// E2E autónomo del registro de asistencia por QR — corre SIN intervención humana.
//
//   node scripts/test-asistencia-e2e.mjs
//
// Qué hace: contra la BD real (service_role del .env), crea datos de prueba
// EFÍMEROS (rango de UUIDs f…, emails e2e-*@example.com), ejercita los 4 caminos
// del check-in reproduciendo EXACTAMENTE las queries de buildCheckinDeps
// (app/asistencia/[sessionId]/checkin-action.ts) y la secuencia de evaluateCheckin
// (lib/asistencia/checkin.ts), verifica la reportería (lib/asistencia/queries.ts),
// y BORRA todo en un finally (autolimpiante, aunque falle a mitad). No toca los 5
// datos reales del ciclo CAP-CI. La lógica pura de decisión está cubierta aparte
// por lib/asistencia/__tests__/checkin.test.ts; este script valida la INTEGRACIÓN
// (queries reales + RLS de escritura por service_role + ventana con datos reales).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

// ---- datos de prueba (UUIDs dedicados rango f…, jamás usados por seeds) -------
const P = {
  program: "f0000000-0000-0000-0000-0000000000e2",
  cohort: "f0000000-0000-0000-0000-00000000e2c0",
  sessionLive: "f0000000-0000-0000-0000-00000000e251", // ventana activa (ahora)
  sessionPast: "f0000000-0000-0000-0000-00000000e252", // ventana cerrada
};
const runId = `${Date.now()}`;
const EMAIL_ENROLLED = `e2e-asistencia-${runId}-a@example.com`;
const EMAIL_OUTSIDER = `e2e-asistencia-${runId}-b@example.com`;

// ---- env + cliente -----------------------------------------------------------
function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const env = loadEnv(join(REPO, ".env"));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- deps reales (mismas queries que buildCheckinDeps) -----------------------
async function loadSession(sessionId) {
  const { data } = await db
    .from("class_sessions")
    .select("id, cohort_id, starts_at, ends_at, title")
    .eq("id", sessionId)
    .single();
  return data ?? null;
}
async function isEnrolledActive(userId, cohortId) {
  const { data } = await db
    .from("enrollments")
    .select("id")
    .eq("student_id", userId)
    .eq("cohort_id", cohortId)
    .eq("status", "active")
    .maybeSingle();
  return Boolean(data);
}
async function recordAttendance(sessionId, userId, cohortId) {
  const { data, error } = await db
    .from("session_attendance")
    .upsert(
      { session_id: sessionId, student_id: userId, cohort_id: cohortId, method: "qr", marked_by: null },
      { onConflict: "session_id,student_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  return Boolean(data && data.length > 0);
}
// ventana [starts-20m, ends+30m] — misma regla que lib/asistencia/window.ts
function isWithinWindow(session, now) {
  const opens = new Date(session.starts_at).getTime() - 20 * 60000;
  const closes = new Date(session.ends_at).getTime() + 30 * 60000;
  const t = now.getTime();
  return t >= opens && t <= closes;
}
// secuencia de evaluateCheckin reproducida contra la BD real
async function runCheckin(sessionId, userId, now) {
  const session = await loadSession(sessionId);
  if (!session) return "error";
  if (!(await isEnrolledActive(userId, session.cohort_id))) return "not_enrolled";
  if (!isWithinWindow(session, now)) return "outside_window";
  return (await recordAttendance(session.id, userId, session.cohort_id)) ? "ok" : "already";
}

// ---- setup / teardown --------------------------------------------------------
let enrolledId = null;
let outsiderId = null;

async function cleanup() {
  await db.from("session_attendance").delete().in("session_id", [P.sessionLive, P.sessionPast]);
  await db.from("class_sessions").delete().in("id", [P.sessionLive, P.sessionPast]);
  await db.from("enrollments").delete().eq("cohort_id", P.cohort);
  await db.from("cohorts").delete().eq("id", P.cohort);
  await db.from("programs").delete().eq("id", P.program);
  for (const id of [enrolledId, outsiderId]) {
    if (!id) continue;
    await db.from("profiles").delete().eq("id", id);
    await db.auth.admin.deleteUser(id).catch(() => {});
  }
}

async function createTestUser(email, fullName) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  const id = data.user.id;
  const { error: pErr } = await db
    .from("profiles")
    .upsert({ id, email, full_name: fullName, role: "student" }, { onConflict: "id" });
  if (pErr) throw new Error(`profile ${email}: ${pErr.message}`);
  return id;
}

async function setup() {
  await cleanup(); // limpia restos de una corrida previa fallida
  const now = new Date();
  const iso = (d) => new Date(d).toISOString();

  await db.from("programs").insert({
    id: P.program, code: `E2E-ASIST-${runId}`, name: "E2E Asistencia (prueba)", total_modules: 0, is_active: true,
  }).throwOnError();
  await db.from("cohorts").insert({
    id: P.cohort, program_id: P.program, code: "E2E", name: "E2E prueba",
    slug: `e2e-asist-${runId}`, start_date: "2026-07-01", end_date: "2026-12-31", status: "active",
  }).throwOnError();
  // sesión con ventana ACTIVA: empezó hace 10 min, termina en 50 min
  await db.from("class_sessions").insert({
    id: P.sessionLive, cohort_id: P.cohort, title: "Sesión activa (E2E)",
    starts_at: iso(now.getTime() - 10 * 60000), ends_at: iso(now.getTime() + 50 * 60000),
    modality: "live_online", status: "scheduled",
  }).throwOnError();
  // sesión con ventana CERRADA: terminó hace 2 h
  await db.from("class_sessions").insert({
    id: P.sessionPast, cohort_id: P.cohort, title: "Sesión pasada (E2E)",
    starts_at: iso(now.getTime() - 3 * 3600000), ends_at: iso(now.getTime() - 2 * 3600000),
    modality: "live_online", status: "finished",
  }).throwOnError();

  enrolledId = await createTestUser(EMAIL_ENROLLED, "Alumno Matriculado E2E");
  outsiderId = await createTestUser(EMAIL_OUTSIDER, "Alumno Externo E2E");
  await db.from("enrollments").insert({
    cohort_id: P.cohort, student_id: enrolledId, status: "active",
  }).throwOnError();
  // el outsider NO se matricula (a propósito)
}

// ---- assertions --------------------------------------------------------------
let pass = 0, fail = 0;
function check(name, got, want) {
  if (got === want) { pass++; console.log(`  ✓ ${name} → ${got}`); }
  else { fail++; console.log(`  ✗ ${name} → esperado '${want}', obtenido '${got}'`); }
}

// ---- main --------------------------------------------------------------------
try {
  console.log("→ Preparando datos de prueba efímeros…");
  await setup();
  const now = new Date();

  console.log("→ Escenarios de check-in:");
  check("matriculado + en ventana", await runCheckin(P.sessionLive, enrolledId, now), "ok");
  check("segundo intento (idempotente)", await runCheckin(P.sessionLive, enrolledId, now), "already");
  check("no matriculado", await runCheckin(P.sessionLive, outsiderId, now), "not_enrolled");
  check("fuera de ventana (sesión pasada)", await runCheckin(P.sessionPast, enrolledId, now), "outside_window");
  check("sesión inexistente", await runCheckin(P.program /*id que no es sesión*/, enrolledId, now), "error");

  console.log("→ Reportería:");
  const { data: att } = await db
    .from("session_attendance")
    .select("student_id, method")
    .eq("session_id", P.sessionLive);
  check("1 presente registrado", String(att?.length ?? 0), "1");
  check("método = qr", att?.[0]?.method ?? "?", "qr");
  check("el presente es el matriculado", att?.[0]?.student_id ?? "?", enrolledId);

  console.log(`\n================ RESULTADO ================`);
  console.log(`PASS: ${pass}  FAIL: ${fail}`);
} catch (e) {
  fail++;
  console.error("✗ Error inesperado:", e.message);
} finally {
  console.log("→ Limpiando datos de prueba…");
  await cleanup();
  console.log("  ✓ limpieza completa");
}

process.exit(fail === 0 ? 0 : 1);
