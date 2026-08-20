#!/usr/bin/env node
/**
 * Rescate de una clase desde los segmentos HLS (ADR-0034, enmienda).
 *
 * Cuándo se usa: el egress murió a mitad de clase. El MP4 vive en un temporal
 * DENTRO del contenedor y se pierde entero, pero los segmentos de 6 s que subió
 * durante la clase siguen en el bucket. Este script los junta y devuelve un MP4.
 *
 * Por qué existe y no basta con ffmpeg sobre el playlist: cuando el egress se
 * cae, el `.m3u8` queda SIN `#EXT-X-ENDLIST` — ffmpeg lo interpreta como un
 * directo todavía en curso y se cuelga esperando segmentos que no van a llegar.
 * Acá el playlist se IGNORA a propósito: la fuente de verdad es qué objetos hay
 * en el bucket, ordenados por el número de secuencia de su nombre.
 *
 * Uso:
 *   node scripts/rescatar-segmentos.mjs --list
 *   node scripts/rescatar-segmentos.mjs --prefix <sessionId>/<recordingId>-hls
 *   node scripts/rescatar-segmentos.mjs --recording <uuid>            (deriva el prefijo)
 *   ... [--out ruta.mp4] [--keep-temp]
 *
 * Requiere `ffmpeg` en el PATH y las credenciales de servicio en `.env`.
 */

import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const BUCKET = "grabaciones";

/**
 * Descargas simultáneas.
 *
 * 8 baja una clase de 2 h en minutos en vez de media hora, sin llegar a
 * parecerle un abuso a Storage. Subirlo más arriesga que el propio rescate
 * empiece a recibir errores.
 */
const DESCARGAS_EN_PARALELO = 8;

function cargarEnv() {
  for (const archivo of [".env.local", ".env"]) {
    let texto;
    try {
      texto = readFileSync(archivo, "utf8");
    } catch {
      continue;
    }
    for (const linea of texto.split("\n")) {
      if (!linea.includes("=") || linea.trimStart().startsWith("#")) continue;
      const i = linea.indexOf("=");
      const clave = linea.slice(0, i).trim();
      if (!process.env[clave]) process.env[clave] = linea.slice(i + 1).trim();
    }
  }
}

function parseArgs(argv) {
  const args = { list: false, keepTemp: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") args.list = true;
    else if (a === "--keep-temp") args.keepTemp = true;
    else if (a === "--prefix") args.prefix = argv[++i];
    else if (a === "--recording") args.recording = argv[++i];
    else if (a === "--out") args.out = argv[++i];
  }
  return args;
}

/**
 * Orden por número de secuencia, NO alfabético.
 *
 * El egress nombra `clase_00000.ts`, `clase_00001.ts`… Con relleno de ceros el
 * orden alfabético coincide, pero basta que una versión de LiveKit deje de
 * rellenar para que `clase_10.ts` se cuele antes de `clase_9.ts` y el rescate
 * salga con los minutos barajados — un fallo silencioso, porque el MP4 se
 * genera igual y solo se nota mirándolo.
 */
export function ordenarSegmentos(nombres) {
  return nombres
    .filter((n) => n.endsWith(".ts"))
    .map((n) => ({ n, seq: Number(n.match(/(\d+)\.ts$/)?.[1] ?? -1) }))
    .sort((a, b) => a.seq - b.seq)
    .map((x) => x.n);
}

/** Detecta huecos en la secuencia: un segmento que no subió es video perdido. */
export function huecosEnSecuencia(nombres) {
  const seqs = nombres.map((n) => Number(n.match(/(\d+)\.ts$/)?.[1] ?? -1)).filter((s) => s >= 0);
  const huecos = [];
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] !== seqs[i - 1] + 1) huecos.push([seqs[i - 1], seqs[i]]);
  }
  return huecos;
}

/**
 * Lista TODOS los objetos de un prefijo, paginando.
 *
 * Storage devuelve como mucho 100 por llamada. Una clase de 2 h son ~1.200
 * segmentos, así que quedarse con la primera página rescataría 10 minutos de
 * una clase de dos horas — y el MP4 se generaría igual, sin un solo error. Ese
 * es el modo de fallo que hay que evitar: el rescate que parece funcionar.
 */
export async function listarTodo(storage, prefijo) {
  const nombres = [];
  const limite = 100;
  for (let offset = 0; ; offset += limite) {
    const { data, error } = await storage.list(prefijo, {
      limit: limite,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`No se pudo listar ${prefijo}: ${error.message}`);
    if (!data?.length) break;
    nombres.push(...data.map((o) => o.name));
    if (data.length < limite) break;
  }
  return nombres;
}

/**
 * Baja un objeto reintentando.
 *
 * Un rescate de 2 h son ~1.200 descargas; que la número 900 falle por un
 * hipo de red y tire abajo veinte minutos de trabajo sería absurdo.
 */
export async function bajarConReintento(storage, ruta, intentos = 3, esperaMs = 1000) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    const { data, error } = await storage.download(ruta);
    if (!error && data) return data;
    ultimo = error;
    if (i < intentos - 1) await new Promise((r) => setTimeout(r, esperaMs * (i + 1)));
  }
  throw new Error(`No se pudo bajar ${ruta} tras ${intentos} intentos: ${ultimo?.message}`);
}

function correr(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} falló (${code}): ${err.slice(-500)}`)),
    );
  });
}

async function main() {
  cargarEnv();
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET);

  let prefijo = args.prefix;

  if (!prefijo && args.recording) {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await db
      .from("session_recordings")
      .select("id, session_id")
      .eq("id", args.recording)
      .maybeSingle();
    if (!data) {
      console.error(`No existe la grabación ${args.recording}.`);
      process.exit(1);
    }
    // Mismo cálculo que `segmentPrefixFor` en lib/livekit/egress-estado.ts.
    prefijo = `${data.session_id}/${data.id}-hls`;
  }

  if (args.list || !prefijo) {
    // Sin prefijo, muestra qué carpetas de segmentos hay para elegir.
    const raices = await listarTodo(storage, "");
    console.log(`Carpetas en el bucket "${BUCKET}":`);
    for (const r of raices) {
      const hijos = await listarTodo(storage, r);
      const hls = hijos.filter((h) => h.endsWith("-hls"));
      for (const h of hls) {
        const segs = await listarTodo(storage, `${r}/${h}`);
        const ts = segs.filter((s) => s.endsWith(".ts"));
        console.log(`  ${r}/${h}  —  ${ts.length} segmentos`);
      }
      const mp4 = hijos.filter((h) => h.endsWith(".mp4"));
      for (const m of mp4) console.log(`  ${r}/${m}  —  MP4 final (no necesita rescate)`);
    }
    if (!prefijo) return;
  }

  console.log(`\nRescatando ${prefijo}`);
  const todos = await listarTodo(storage, prefijo);
  const segmentos = ordenarSegmentos(todos);

  if (segmentos.length === 0) {
    console.error("No hay segmentos .ts en ese prefijo. No hay nada que rescatar.");
    process.exit(1);
  }

  const huecos = huecosEnSecuencia(segmentos);
  console.log(`  ${segmentos.length} segmentos, de ${segmentos[0]} a ${segmentos.at(-1)}`);
  if (huecos.length) {
    // Se avisa y se sigue: un rescate con huecos vale mucho más que ningún
    // rescate, pero quien lo mire tiene que saber que el video salta.
    console.warn(`  ⚠ ${huecos.length} hueco(s) en la secuencia: ${JSON.stringify(huecos)}`);
    console.warn("    El video resultante salta en esos puntos.");
  }
  if (todos.some((n) => n.endsWith(".m3u8"))) {
    console.log("  (el playlist .m3u8 se ignora a propósito: si el egress murió, no tiene cierre)");
  }

  const temp = await mkdtemp(join(tmpdir(), "rescate-"));
  try {
    // En serie, una clase de 2 h (~1.200 segmentos, ~2,7 GB) tarda más de media
    // hora en bajar, y un rescate se hace con la clase ya perdida y alguien
    // esperando. El orden de descarga da igual: cada segmento se guarda con su
    // nombre y el orden lo impone la lista que consume ffmpeg.
    let bytes = 0;
    let hechos = 0;
    const cola = [...segmentos];
    const obrero = async () => {
      for (;;) {
        const nombre = cola.shift();
        if (!nombre) return;
        const data = await bajarConReintento(storage, `${prefijo}/${nombre}`);
        const buf = Buffer.from(await data.arrayBuffer());
        bytes += buf.length;
        await writeFile(join(temp, nombre), buf);
        hechos++;
        if (hechos % 50 === 0 || hechos === segmentos.length) {
          process.stdout.write(`\r  bajados ${hechos}/${segmentos.length}`);
        }
      }
    };
    await Promise.all(Array.from({ length: DESCARGAS_EN_PARALELO }, obrero));
    console.log(`\n  ${(bytes / 1024 / 1024).toFixed(1)} MB descargados`);

    // Demuxer `concat` con `-c copy`: no recodifica, así que el rescate no
    // degrada la clase ni tarda lo que tardaría un transcode de 2 horas.
    const lista = join(temp, "lista.txt");
    await writeFile(lista, segmentos.map((n) => `file '${join(temp, n)}'`).join("\n"));

    const salida = args.out ?? `rescate-${prefijo.replace(/\//g, "_")}.mp4`;
    await correr("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      lista,
      "-c",
      "copy",
      // Los .ts traen timestamps que arrancan donde iba la clase; sin esto el
      // MP4 nace con un offset y algunos reproductores muestran negro al inicio.
      "-fflags",
      "+genpts",
      salida,
    ]);

    const dur = await correr("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      salida,
    ]);
    const segundos = Number(dur.trim());
    const { size } = await stat(salida);
    console.log(
      `\n✓ ${salida}  —  ${(segundos / 60).toFixed(1)} min, ${(size / 1024 / 1024).toFixed(1)} MB`,
    );
    console.log("  Súbelo con el panel de repetición manual de la clase.");
  } finally {
    if (args.keepTemp) console.log(`  (temporales en ${temp})`);
    else await rm(temp, { recursive: true, force: true });
  }
}

// Solo corre si se invoca directo: el archivo también exporta funciones puras
// para los tests.
if (process.argv[1]?.endsWith("rescatar-segmentos.mjs")) {
  main().catch((e) => {
    console.error(`\n✗ ${e.message}`);
    process.exit(1);
  });
}
