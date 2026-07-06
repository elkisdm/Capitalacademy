// Matrícula + invitación de la fuerza de ventas al Ciclo de Capacitación Comercial CI.
//
// Entorno: "Ciclo de Capacitación Comercial CI" (ADR-0012, seed 0049).
//   Programa CAP-CI · Cohorte G1 "I Ciclo — 2026" · b0000000-…-000000000004.
//   Ciclo interno GRATUITO para la fuerza de ventas de Capital Inteligente.
//   Primera sesión: martes 7 de julio, 10:00–12:00, Auditorio (presencial).
//
// Flujo (idempotente) por alumno, replicando scripts/invite-diplomado-g4.mjs:
//   1. generateLink(invite) -> crea auth user si no existe + token; cae a recovery si ya existe
//   2. upsert profile (role student)
//   3. upsert enrollment en G1 (status active)
//   4. envía email branded vía Resend (copy del ciclo interno; acento rose del entorno)
//   5. registra invitation_log (anti-duplicado)
//
// Origen de los alumnos: pega el listado en STUDENTS (abajo). Como la fuerza de ventas
// es interna, casi todos serán @capitalinteligente.cl. Si prefieres leer de un XLSX,
// copia el loader de invite-diplomado-g4.mjs; aquí se usa un array explícito para
// arrancar rápido (el listado llega por separado).
//
// Modos:
//   node scripts/invite-capacitaciones.mjs preview   -> NO escribe nada, envía 1 correo de muestra a PREVIEW_TO
//   node scripts/invite-capacitaciones.mjs send       -> ejecuta sobre STUDENTS
//
// NUNCA reenvía a quien ya está en invitation_log (para ESTE cohorte) ni toca EXCLUDE.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

// ---------------------------------------------------------------- listado
// Pega aquí a los asistentes. email obligatorio; fullName recomendado.
// Ej: { email: "nombre@capitalinteligente.cl", fullName: "Nombre Apellido" }
const STUDENTS = [
  // { email: "", fullName: "" },
];

// ---------------------------------------------------------------- config
const COHORT_ID = "b0000000-0000-0000-0000-000000000004";
const PROGRAM_NAME = "Ciclo de Capacitación Comercial CI";
const COHORT_NAME = "I Ciclo — 2026";
const BASE_URL = "https://capitalacademy.cl";
const SENT_BY = "900823a1-e5e3-4721-b6aa-70ba791928b4"; // admin edaza
const PREVIEW_TO = "edaza@capitalinteligente.cl";
const ACCENT = "#d14a6b"; // ca-rose — acento del entorno Capacitación Comercial CI
const EXCLUDE = new Set([
  "academia@capitalinteligente.cl",
  "edaza@capitalinteligente.cl",
]);
const SEND_DELAY_MS = 280; // ~3.5/seg, holgado para Resend

// Datos de la primera clase (para el email de bienvenida).
const FIRST_CLASS = {
  fecha: "Martes 7 de julio",
  hora: "10:00 a 12:00 hrs",
  lugar: "Auditorio · Capital Inteligente (presencial)",
};

// La fuerza de ventas es interna: marcamos el segmento 'capital_inteligente'
// (migración 0024, CHECK admite null | 'capital_inteligente').
const INTERNAL_DOMAIN = "@capitalinteligente.cl";
function dbSegmentFor(email) {
  return email.toLowerCase().endsWith(INTERNAL_DOMAIN) ? "capital_inteligente" : null;
}

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
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function buildConfirmUrl(hashedToken, type) {
  // Onboarding branded del entorno capacitaciones (registry slug 'capacitaciones').
  return `${BASE_URL}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=${type}&next=${encodeURIComponent("/onboarding/capacitaciones/set-password")}`;
}

function invitationHtml({ fullName, inviteUrl }) {
  const firstName = fullName.split(" ")[0];
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14163a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);">
      <tr><td style="padding:0;background:#14163a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 28px;">
        <img src="https://capitalacademy.cl/brand/logo-light.png" alt="Capital Academy" width="200" style="display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;outline:none;text-decoration:none;" />
        <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;">Capacitación Comercial · Capital Inteligente</p>
      </td></tr></table></td></tr>
      <tr><td style="padding:32px 32px 8px 32px;">
        <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;color:#14163a;font-weight:800;">&iexcl;Te damos la bienvenida, ${esc(firstName)}!</h1>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">Te sumamos al <strong>${esc(PROGRAM_NAME)}</strong>: una l&iacute;nea de capacitaci&oacute;n interna para fortalecer tu desempe&ntilde;o comercial y conectar con las &aacute;reas, herramientas y procesos que respaldan tu gesti&oacute;n diaria.</p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">Aqu&iacute; tendr&aacute;s tu <strong style="color:${ACCENT};">acceso a Capital Academy</strong>, con el calendario de sesiones y las grabaciones de cada clase para consultarlas cuando quieras.</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px 32px;">
        <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;color:${ACCENT};text-transform:uppercase;font-weight:800;">Qu&eacute; encontrar&aacute;s adentro</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;color:#3a3d5c;">
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;width:26px;">&#128197;</td><td style="padding:5px 0;"><strong>El calendario de sesiones</strong>, con fechas, temas y expositores.</td></tr>
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;">&#127909;</td><td style="padding:5px 0;"><strong>Las grabaciones</strong> de cada clase, disponibles como material de consulta.</td></tr>
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;">&#128172;</td><td style="padding:5px 0;"><strong>El foro del ciclo</strong> para resolver dudas con tus compa&ntilde;eros y los expositores.</td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 32px 12px 32px;">
        <a href="${esc(inviteUrl)}" target="_blank" style="display:inline-block;padding:15px 44px;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">Activar mi acceso y entrar</a>
      </td></tr>
      <tr><td style="padding:0 32px 24px 32px;"><p style="margin:0;font-size:13px;line-height:1.6;color:#6b6e8a;text-align:center;">El enlace expira en 72 horas. Al activarlo, creas tu contrase&ntilde;a y entras a la plataforma.</p></td></tr>
      <tr><td style="padding:0 32px 22px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fdeef2;border-radius:12px;border:1px solid #f7dde4;">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 10px 0;font-size:12px;letter-spacing:0.15em;color:${ACCENT};text-transform:uppercase;font-weight:800;">Tu primera sesi&oacute;n &middot; presencial</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.55;color:#3a3d5c;">
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;width:24px;">&#128197;</td><td style="padding:3px 0;"><strong>${esc(FIRST_CLASS.fecha)}</strong> &middot; ${esc(FIRST_CLASS.hora)}</td></tr>
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;">&#128205;</td><td style="padding:3px 0;">${esc(FIRST_CLASS.lugar)}</td></tr>
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;">&#128100;</td><td style="padding:3px 0;">Rentix: administraci&oacute;n de propiedades y continuidad de la inversi&oacute;n &middot; Jose Soto.</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 28px 32px;"><p style="margin:0;font-size:14px;line-height:1.6;color:#3a3d5c;">&iexcl;Te esperamos! Si tienes alguna consulta antes de empezar, escr&iacute;benos.<br/><strong>Equipo Capital Academy</strong></p></td></tr>
      <tr><td style="padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;"><p style="margin:0;font-size:12px;color:#9b9db5;text-align:center;">Capital Academy &middot; <a href="https://capitalacademy.cl" style="color:${ACCENT};text-decoration:none;">capitalacademy.cl</a></p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
function invitationText({ fullName, inviteUrl }) {
  const firstName = fullName.split(" ")[0];
  return [
    `¡Te damos la bienvenida, ${firstName}!`, "",
    `Te sumamos al ${PROGRAM_NAME}: una línea de capacitación interna para fortalecer tu desempeño comercial y conectar con las áreas, herramientas y procesos que respaldan tu gestión diaria.`, "",
    "Aquí tendrás tu acceso a Capital Academy, con el calendario de sesiones y las grabaciones de cada clase para consultarlas cuando quieras.", "",
    "Qué encontrarás adentro:",
    "  • El calendario de sesiones, con fechas, temas y expositores.",
    "  • Las grabaciones de cada clase, disponibles como material de consulta.",
    "  • El foro del ciclo para resolver dudas con tus compañeros y los expositores.", "",
    `Activa tu acceso y entra: ${inviteUrl}`, "",
    "El enlace expira en 72 horas. Al activarlo, creas tu contraseña y entras a la plataforma.", "",
    "TU PRIMERA SESIÓN (presencial):",
    `  • ${FIRST_CLASS.fecha} · ${FIRST_CLASS.hora}`,
    `  • ${FIRST_CLASS.lugar}`,
    "  • Rentix: administración de propiedades y continuidad de la inversión · Jose Soto.", "",
    "¡Te esperamos! Si tienes alguna consulta antes de empezar, escríbenos.",
    "Equipo Capital Academy", "",
    "Capital Academy · capitalacademy.cl",
  ].join("\n");
}
async function sendResend(to, fullName, inviteUrl) {
  const firstName = fullName.split(" ")[0];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL, to,
      subject: `${firstName}, tu acceso al Ciclo de Capacitación Comercial CI ya está disponible`,
      html: invitationHtml({ fullName, inviteUrl }),
      text: invitationText({ fullName, inviteUrl }),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}
async function makeInviteUrl(email) {
  let { data, error } = await classroom.auth.admin.generateLink({
    type: "invite", email,
    options: { redirectTo: `${BASE_URL}/onboarding/capacitaciones/set-password` },
  });
  if (error && /registered|already/i.test(error.message)) {
    ({ data, error } = await classroom.auth.admin.generateLink({
      type: "recovery", email,
      options: { redirectTo: `${BASE_URL}/onboarding/capacitaciones/set-password` },
    }));
  }
  if (error) throw new Error(`generateLink: ${error.message}`);
  const hashed = data.properties.hashed_token;
  const type = data.properties.verification_type ?? "invite";
  const userId = data.user?.id ?? data.properties?.user_id;
  return { inviteUrl: buildConfirmUrl(hashed, type), userId };
}

// ---------------------------------------------------------------- main
const MODE = process.argv[2];
if (!["preview", "send"].includes(MODE)) {
  console.error("Uso: node scripts/invite-capacitaciones.mjs <preview|send>");
  process.exit(1);
}

if (MODE === "preview") {
  const inviteUrl = `${BASE_URL}/auth/confirm?token_hash=PREVIEW&type=invite&next=%2Fonboarding%2Fcapacitaciones%2Fset-password`;
  await sendResend(PREVIEW_TO, "Elkis (PREVIEW)", inviteUrl);
  console.log(`✓ Preview branded (ciclo interno, acento rose) enviado a ${PREVIEW_TO}.`);
  console.log("  (No se creó ninguna cuenta ni se tocó la base.)");
  process.exit(0);
}

// MODE === "send"
const students = STUDENTS
  .map((s) => ({ email: String(s.email || "").trim().toLowerCase(), fullName: String(s.fullName || "").trim() }))
  .filter((s) => s.email && s.email.includes("@"));

if (students.length === 0) {
  console.error("✗ STUDENTS está vacío. Pega el listado de asistentes en el array STUDENTS antes de correr 'send'.");
  process.exit(1);
}

// Dedup por email + anti-reinvitación (por cohorte, no global: invitation_log es
// global-por-email, así que filtramos por enrollment en ESTE cohorte para no
// bloquear a un interno que ya está en otro programa).
const seen = new Set();
const deduped = [];
for (const s of students) {
  if (seen.has(s.email)) continue;
  seen.add(s.email);
  deduped.push({ ...s, fullName: s.fullName || s.email });
}

const { data: existingEnroll } = await classroom
  .from("enrollments")
  .select("student_id, profiles!inner(email)")
  .eq("cohort_id", COHORT_ID);
const alreadyEnrolled = new Set(
  (existingEnroll ?? []).map((r) => (r.profiles?.email || "").toLowerCase()).filter(Boolean),
);

const targets = deduped.filter((s) => !EXCLUDE.has(s.email) && !alreadyEnrolled.has(s.email));

console.log(`→ En lista: ${deduped.length} | objetivo a invitar: ${targets.length} (excluidos EXCLUDE + ya matriculados en G1)`);

const ok = [];
const fail = [];
let i = 0;
for (const t of targets) {
  i++;
  try {
    const { inviteUrl, userId } = await makeInviteUrl(t.email);
    if (!userId) throw new Error("sin userId tras generateLink");

    const { error: profErr } = await classroom.from("profiles").upsert(
      { id: userId, email: t.email, full_name: t.fullName, role: "student" },
      { onConflict: "id" },
    );
    if (profErr) throw new Error(`profile: ${profErr.message}`);

    const { error: enrErr } = await classroom.from("enrollments").upsert(
      { cohort_id: COHORT_ID, student_id: userId, status: "active", segment: dbSegmentFor(t.email) },
      { onConflict: "cohort_id,student_id" },
    );
    if (enrErr) throw new Error(`enrollment: ${enrErr.message}`);

    await sendResend(t.email, t.fullName, inviteUrl);

    await classroom.from("invitation_log").insert({
      user_id: userId, email: t.email, sent_at: new Date().toISOString(),
      sent_by: SENT_BY, channel: "email", status: "sent",
    });

    ok.push(t.email);
    console.log(`  ✓ ${i}/${targets.length} ${t.email}`);
  } catch (e) {
    fail.push({ email: t.email, error: e.message });
    console.log(`  ✗ ${t.email}: ${e.message}`);
  }
  await sleep(SEND_DELAY_MS);
}

console.log("\n================ RESULTADO ================");
console.log(`Invitados OK : ${ok.length}`);
console.log(`Fallidos     : ${fail.length}`);
if (fail.length) console.log(JSON.stringify(fail, null, 2));
