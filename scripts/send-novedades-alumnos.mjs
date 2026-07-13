// Envío one-off del correo de novedades de plataforma (2026-07-12) a los
// alumnos con matrícula activa, segmentado POR PROGRAMA.
//
// El HTML ya está preparado en docs/reportes/correo-alumnos-novedades-2026-07-12.html
// (se lee desde el repo en runtime, no se copia aquí). Personalización: si el
// perfil tiene nombre, "Hola:" pasa a "Hola, <primer nombre>:".
//
// Audiencia: enrollments.status='active' -> cohorts -> programs, solo
// profiles.role='student' (excluye staff/admin/teacher/ops), únicos por
// email dentro de cada programa, menos EXCLUDE.
//
// Modos:
//   node scripts/send-novedades-alumnos.mjs --list
//     -> lista programas con matrículas activas + conteo de destinatarios. Solo lectura.
//   node scripts/send-novedades-alumnos.mjs --dry-run --program <slug-o-id>
//     -> imprime la lista exacta de destinatarios de ese programa. No envía.
//   node scripts/send-novedades-alumnos.mjs preview
//     -> envía UNA muestra real solo a PREVIEW_TO. No toca la base ni el log.
//   node scripts/send-novedades-alumnos.mjs send --program <slug-o-id>
//     -> envío real al programa indicado. Idempotente vía log local JSON.
//
// <slug-o-id> acepta: UUID de public.programs.id, programs.code (ej. "DIP-VENTAS"),
// o el slug de entorno de lib/programs/registry.ts (ej. "diplomado"). El script
// .mjs no puede importar ese registry.ts, así que el mapeo slug->code se replica
// abajo (mantenerlo en sync si el registry cambia).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

// ---------------------------------------------------------------- config
const HTML_PATH = join(REPO, "docs/reportes/correo-alumnos-novedades-2026-07-12.html");
const SENT_LOG_PATH = join(__dirname, ".sent-novedades-2026-07-12.json");
const SUBJECT = "Tu plataforma mejoró esta semana: más simple, más rápida y mejor desde el celular";
const PREVIEW_TO = "edaza@capitalinteligente.cl";
const SEND_DELAY_MS = 280; // ~3.5/seg, holgado para Resend
const EXCLUDE = new Set([
  "academia@capitalinteligente.cl",
  "edaza@capitalinteligente.cl",
]);

// Replicado de lib/programs/registry.ts (BRANDS[].slug -> code). Solo para
// aceptar el slug de entorno como atajo en --program; la fuente de verdad
// sigue siendo public.programs.
const SLUG_TO_CODE = {
  diplomado: "DIP-VENTAS",
  workshop: "WS-INMOB",
  liderazgo: "LID-COMERCIAL",
  capacitaciones: "CAP-CI",
};

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
const CLASSROOM_URL = ca.NEXT_PUBLIC_SUPABASE_URL;
const CLASSROOM_KEY = ca.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = ca.RESEND_API_KEY;
const FROM_EMAIL = ca.RESEND_FROM_EMAIL;

for (const [k, v] of Object.entries({ CLASSROOM_URL, CLASSROOM_KEY, RESEND_KEY, FROM_EMAIL })) {
  if (!v) throw new Error(`Falta env: ${k}`);
}

const classroom = createClient(CLASSROOM_URL, CLASSROOM_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readSentLog() {
  if (!existsSync(SENT_LOG_PATH)) return [];
  try {
    return JSON.parse(readFileSync(SENT_LOG_PATH, "utf8"));
  } catch {
    return [];
  }
}
function writeSentLog(log) {
  writeFileSync(SENT_LOG_PATH, JSON.stringify(log, null, 2));
}

function personalizeHtml(html, fullName) {
  const firstName = (fullName || "").trim().split(/\s+/)[0];
  if (!firstName) return html;
  return html.replace("Hola:", `Hola, ${firstName}:`);
}

async function sendResend(to, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject: SUBJECT, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Trae todas las matrículas activas con programa + perfil, ya filtradas a alumnos. */
async function fetchActiveAudience() {
  const { data, error } = await classroom
    .from("enrollments")
    .select(
      "student_id, cohorts!inner(program_id, programs!inner(id, code, name)), profiles!inner(id, email, full_name, role)",
    )
    .eq("status", "active");
  if (error) throw new Error(`enrollments: ${error.message}`);

  // Map<programId, { id, code, name, recipients: Map<email, {email, fullName}> }>
  const byProgram = new Map();
  for (const row of data ?? []) {
    const profile = row.profiles;
    const program = row.cohorts?.programs;
    if (!profile || !program) continue;
    if (profile.role !== "student") continue;
    const email = (profile.email || "").trim().toLowerCase();
    if (!email || EXCLUDE.has(email)) continue;

    let entry = byProgram.get(program.id);
    if (!entry) {
      entry = { id: program.id, code: program.code, name: program.name, recipients: new Map() };
      byProgram.set(program.id, entry);
    }
    entry.recipients.set(email, { email, fullName: profile.full_name || "" });
  }
  return byProgram;
}

function resolveProgram(allPrograms, arg) {
  if (!arg) return null;
  if (UUID_RE.test(arg)) {
    return allPrograms.find((p) => p.id === arg) ?? null;
  }
  const lower = arg.toLowerCase();
  const slugCode = SLUG_TO_CODE[lower];
  if (slugCode) {
    const bySlug = allPrograms.find((p) => (p.code || "").toLowerCase() === slugCode.toLowerCase());
    if (bySlug) return bySlug;
  }
  return allPrograms.find((p) => (p.code || "").toLowerCase() === lower) ?? null;
}

// ---------------------------------------------------------------- main
const args = process.argv.slice(2);
const MODE = args[0];
const programIdx = args.indexOf("--program");
const PROGRAM_ARG = programIdx !== -1 ? args[programIdx + 1] : null;

if (!["--list", "--dry-run", "preview", "send"].includes(MODE)) {
  console.error(
    "Uso:\n" +
      "  node scripts/send-novedades-alumnos.mjs --list\n" +
      "  node scripts/send-novedades-alumnos.mjs --dry-run --program <slug-o-id>\n" +
      "  node scripts/send-novedades-alumnos.mjs preview\n" +
      "  node scripts/send-novedades-alumnos.mjs send --program <slug-o-id>",
  );
  process.exit(1);
}

if (MODE === "preview") {
  const html = personalizeHtml(readFileSync(HTML_PATH, "utf8"), "Elkis (PREVIEW)");
  await sendResend(PREVIEW_TO, html);
  console.log(`✓ Preview enviado a ${PREVIEW_TO}.`);
  console.log("  (No se tocó la base ni el log de enviados.)");
  process.exit(0);
}

if (MODE === "--list") {
  const byProgram = await fetchActiveAudience();
  if (byProgram.size === 0) {
    console.log("No hay matrículas activas con perfiles de alumno.");
    process.exit(0);
  }
  console.log("Programas con matrículas activas:\n");
  for (const p of byProgram.values()) {
    console.log(`- ${p.name} (code=${p.code}, id=${p.id}) — destinatarios: ${p.recipients.size}`);
  }
  process.exit(0);
}

if (MODE === "--dry-run") {
  if (!PROGRAM_ARG) {
    console.error("Falta --program <slug-o-id>. Usa --list para ver los programas disponibles.");
    process.exit(1);
  }
  const byProgram = await fetchActiveAudience();
  const { data: allPrograms, error } = await classroom.from("programs").select("id, code, name");
  if (error) throw new Error(`programs: ${error.message}`);
  const program = resolveProgram(allPrograms ?? [], PROGRAM_ARG);
  if (!program) {
    console.error(`✗ No se encontró un programa para "${PROGRAM_ARG}".`);
    process.exit(1);
  }
  const recipients = [...(byProgram.get(program.id)?.recipients.values() ?? [])].sort((a, b) =>
    a.email.localeCompare(b.email),
  );
  console.log(`Programa: ${program.name} (code=${program.code}, id=${program.id})`);
  console.log(`Destinatarios (${recipients.length}):\n`);
  for (const r of recipients) {
    console.log(`  ${r.email}${r.fullName ? ` — ${r.fullName}` : ""}`);
  }
  process.exit(0);
}

// MODE === "send"
if (!PROGRAM_ARG) {
  console.error("Falta --program <slug-o-id>. Usa --list para ver los programas disponibles.");
  process.exit(1);
}

const byProgram = await fetchActiveAudience();
const { data: allPrograms, error: programsErr } = await classroom.from("programs").select("id, code, name");
if (programsErr) throw new Error(`programs: ${programsErr.message}`);
const program = resolveProgram(allPrograms ?? [], PROGRAM_ARG);
if (!program) {
  console.error(`✗ No se encontró un programa para "${PROGRAM_ARG}".`);
  process.exit(1);
}

const recipients = [...(byProgram.get(program.id)?.recipients.values() ?? [])].sort((a, b) =>
  a.email.localeCompare(b.email),
);
if (recipients.length === 0) {
  console.log(`No hay destinatarios para ${program.name} (tras filtros).`);
  process.exit(0);
}

const baseHtml = readFileSync(HTML_PATH, "utf8");
const sentLog = readSentLog();
const alreadySent = new Set(
  sentLog.filter((e) => e.program === program.code).map((e) => e.email),
);

console.log(`→ Programa: ${program.name} (code=${program.code}) — ${recipients.length} destinatarios`);

const ok = [];
const skipped = [];
const fail = [];
let i = 0;
for (const r of recipients) {
  i++;
  if (alreadySent.has(r.email)) {
    skipped.push(r.email);
    console.log(`  ⏭ ${i}/${recipients.length} ${r.email} (ya enviado)`);
    continue;
  }
  try {
    const html = personalizeHtml(baseHtml, r.fullName);
    const result = await sendResend(r.email, html);
    sentLog.push({ email: r.email, program: program.code, sentAt: new Date().toISOString(), id: result.id });
    writeSentLog(sentLog);
    ok.push(r.email);
    console.log(`  ✓ ${i}/${recipients.length} ${r.email}`);
  } catch (e) {
    fail.push({ email: r.email, error: e.message });
    console.log(`  ✗ ${i}/${recipients.length} ${r.email}: ${e.message}`);
  }
  await sleep(SEND_DELAY_MS);
}

console.log("\n================ RESULTADO ================");
console.log(`Enviados OK  : ${ok.length}`);
console.log(`Ya enviados  : ${skipped.length}`);
console.log(`Fallidos     : ${fail.length}`);
if (fail.length) console.log(JSON.stringify(fail, null, 2));
