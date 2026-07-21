// Script one-off: regenera la miniatura inteligente (elegida por IA) de las
// lecciones-repetición que ya se publicaron ANTES de que existiera
// lib/mux/smart-thumbnail.ts, y que por eso se quedaron con la miniatura
// default de Mux (sin `?time=`).
//
// Replica exactamente la lógica de lib/mux/smart-thumbnail.ts: 6 timestamps
// enteros equiespaciados entre el 10% y el 85% de la duración, se los muestra
// a gpt-5.4-mini en baja resolución, y usa el índice elegido como el nuevo
// `thumbnail_url`. A diferencia del webhook, aquí no hay presupuesto duro de
// 8s (es un script local, no un flujo de request), solo un timeout generoso
// por llamada.
//
// Modos:
//   node scripts/regenerate-recording-thumbnails.mjs
//   node scripts/regenerate-recording-thumbnails.mjs --dry-run
//     -> lista qué haría (título, duración, time elegido) sin escribir. Default.
//   node scripts/regenerate-recording-thumbnails.mjs --apply
//     -> escribe lessons.thumbnail_url con el frame elegido.
//   Agregar --force a cualquiera de los dos modos para incluir también las
//   lecciones que YA tienen `?time=` en su thumbnail_url (por defecto se saltan).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

// ---------------------------------------------------------------- config
const CALL_DELAY_MS = 500;
const CALL_TIMEOUT_MS = 60_000;
const MIN_DURATION_SECONDS = 30;

const SYSTEM_PROMPT = `Eres un editor de video experto en miniaturas (thumbnails) que maximizan el clic.
Recibes 6 fotogramas numerados (0 a 5) de la grabación de una clase.
Elige el fotograma MAS atractivo para invitar a ver la clase:
- Presentador/a visible y expresivo, rostro nitido, buena iluminacion.
- Imagen clara y bien compuesta.
Descarta: pantallas negras o en blanco, transiciones/desenfoques, diapositivas
ilegibles, pantallas de carga, fotogramas vacios o congelados.
Si NINGUNO sirve, devuelve index -1.

Responde SIEMPRE y SOLO con este JSON, sin texto adicional:
{"index": N}
donde N es el numero (0-5) del mejor fotograma, o -1 si ninguno es adecuado.`;

// ---------------------------------------------------------------- env
function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const ca = loadEnv(join(REPO, ".env"));
const SUPABASE_URL = ca.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = ca.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = ca.OPENAI_API_KEY;

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_KEY, OPENAI_API_KEY })) {
  if (!v) throw new Error(`Falta env: ${k}`);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildCandidateTimes(durationSeconds) {
  const times = Array.from({ length: 6 }, (_, i) =>
    Math.round(durationSeconds * (0.1 + (0.75 * i) / 5)),
  );
  return Array.from(new Set(times));
}

/** Misma lógica que lib/mux/smart-thumbnail.ts, sin el AbortController de 8s. */
async function pickSmartThumbnailTime(playbackId, durationSeconds) {
  const candidateTimes = buildCandidateTimes(durationSeconds);
  const candidateUrls = candidateTimes.map(
    (t) => `https://image.mux.com/${playbackId}/thumbnail.webp?time=${t}&width=320`,
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

  try {
    const content = [
      {
        type: "text",
        text: `Imagen 0..${candidateUrls.length - 1} en este orden: fotogramas de la grabación en distintos momentos.`,
      },
      ...candidateUrls.map((url) => ({
        type: "image_url",
        image_url: { url, detail: "low" },
      })),
    ];

    const requestBody = {
      model: "gpt-5.4-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: 50,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "unknown error");
      console.error(`  ✗ OpenAI API error ${res.status}: ${errorText}`);
      return null;
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      console.error("  ✗ OpenAI devolvió contenido vacío");
      return null;
    }

    const parsed = JSON.parse(rawContent);
    const index = parsed.index;

    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= candidateTimes.length
    ) {
      return null;
    }

    return candidateTimes[index];
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------- main
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");

console.log(`Modo: ${APPLY ? "APPLY (escribe en la base)" : "DRY-RUN (solo lectura)"}${FORCE ? " + FORCE (incluye ya-inteligentes)" : ""}\n`);

const { data: sessions, error: sessionsErr } = await supabase
  .from("class_sessions")
  .select("lesson_id")
  .not("lesson_id", "is", null);
if (sessionsErr) throw new Error(`class_sessions: ${sessionsErr.message}`);

const lessonIds = [...new Set((sessions ?? []).map((s) => s.lesson_id))];
if (lessonIds.length === 0) {
  console.log("No hay repeticiones (class_sessions.lesson_id) registradas.");
  process.exit(0);
}

const { data: lessons, error: lessonsErr } = await supabase
  .from("lessons")
  .select("id, title, mux_playback_id, video_duration_seconds, thumbnail_url")
  .in("id", lessonIds)
  .not("mux_playback_id", "is", null);
if (lessonsErr) throw new Error(`lessons: ${lessonsErr.message}`);

const candidates = (lessons ?? []).filter((l) => {
  const alreadySmart = (l.thumbnail_url || "").includes("?time=");
  if (alreadySmart && !FORCE) return false;
  return true;
});

console.log(`Repeticiones candidatas: ${candidates.length} (de ${lessons?.length ?? 0} lecciones-repetición con video)\n`);

let updated = 0;
let skipped = 0;
let failed = 0;

for (const lesson of candidates) {
  const duration = lesson.video_duration_seconds;
  if (!duration || duration < MIN_DURATION_SECONDS) {
    console.log(`⏭ "${lesson.title}" — duración insuficiente (${duration ?? "sin dato"}s < ${MIN_DURATION_SECONDS}s)`);
    skipped++;
    continue;
  }

  const time = await pickSmartThumbnailTime(lesson.mux_playback_id, duration);
  if (time === null) {
    console.log(`⏭ "${lesson.title}" (${duration}s) — sin frame elegido (IA no encontró uno adecuado o falló)`);
    skipped++;
    await sleep(CALL_DELAY_MS);
    continue;
  }

  if (!APPLY) {
    console.log(`→ "${lesson.title}" (${duration}s) — elegiría time=${time}`);
  } else {
    const newThumbnailUrl = `https://image.mux.com/${lesson.mux_playback_id}/thumbnail.webp?time=${time}`;
    const { error: updateErr } = await supabase
      .from("lessons")
      .update({ thumbnail_url: newThumbnailUrl })
      .eq("id", lesson.id);
    if (updateErr) {
      console.log(`✗ "${lesson.title}" (${duration}s) — time=${time} pero falló el update: ${updateErr.message}`);
      failed++;
      await sleep(CALL_DELAY_MS);
      continue;
    }
    console.log(`✓ "${lesson.title}" (${duration}s) — thumbnail_url actualizado, time=${time}`);
    updated++;
  }

  await sleep(CALL_DELAY_MS);
}

console.log("\n================ RESULTADO ================");
console.log(`Candidatas       : ${candidates.length}`);
console.log(`${APPLY ? "Actualizadas" : "Elegirían time"} : ${APPLY ? updated : candidates.length - skipped - failed}`);
console.log(`Sin cambio       : ${skipped}`);
if (APPLY) console.log(`Fallidas         : ${failed}`);
if (!APPLY) console.log("\n(Nada se escribió. Corre con --apply para aplicar los cambios.)");
