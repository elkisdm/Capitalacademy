// Segunda tanda de invitación — Ciclo de Capacitación Comercial CI.
//
// Contexto: el 15-jul-2026 (20:19–20:24 UTC) scripts/invite-capacitaciones.mjs envió
// 222 invitaciones a la cohorte (141 invite/nuevos, 81 recovery/ya tenían cuenta).
// Los enlaces expiran a las 72h (mueren el viernes 18-jul). La clase es el martes
// 21-jul 10:00 (presencial, asistencia por QR): quien no active su cuenta antes no
// podrá marcar asistencia. Esta segunda tanda reenvía SOLO a quien sigue sin activar.
//
// Entorno: "Ciclo de Capacitación Comercial CI" (ADR-0012, seed 0049).
//   Programa "Ciclo de Capacitación Comercial CI" · Cohorte G1 "I Ciclo — 2026" ·
//   b0000000-…-000000000004 (código 'G1' está DUPLICADO con la cohorte de Liderazgo,
//   …-000000000003 — se resuelve por UUID, no por code).
//
// Detección de "stuck" (mismo espíritu que scripts/check-activation.mjs, que es de
// donde sale el criterio real — scripts/reinvite-stuck-g4.mjs NO detecta: toma una
// lista de emails ya fijada a mano):
//   1. Roster = matriculados 'active' de este cohorte (239 en la corrida del 16-jul).
//   2. Se escanea auth.users completo vía Admin API paginado de a 10 (per_page mayor
//      revienta GoTrue por un registro viejo corrupto — ver memoria "GoTrue NULL Token
//      Bug" — páginas que fallan se saltan y se avisa, igual que en check-activation.mjs).
//   3. "Activado" = last_sign_in_at NO nulo (ha ingresado al menos una vez). Es el mismo
//      criterio que check-activation.mjs usa para "ACTIVADOS (han ingresado)".
//      email_confirmed_at se registra solo informativamente, no decide el estado.
//   4. "Pendiente" (stuck) = matriculado active cuyo auth user existe pero
//      last_sign_in_at es null.
//   5. Desglose invite/recovery de los pendientes: se infiere por auth.users.created_at
//      del propio usuario. Si el usuario fue CREADO dentro de la ventana de envío de la
//      tanda 1 (15-jul 20:15–20:30 UTC, con margen sobre el 20:19–20:24 real) es porque
//      generateLink(invite) creó la cuenta ese día -> era "invite" (nuevo). Si la cuenta
//      es de antes, era "recovery" (ya existía). invitation_log no guarda el tipo, así
//      que esta es la señal disponible más directa.
//
// Envío (modo --send): reusa EXACTAMENTE la ramificación invite/recovery de
// invite-capacitaciones.mjs (makeInviteUrl -> intenta "invite", cae a "recovery" si el
// email ya está registrado) y el mismo copy/plantilla/remitente/acento de la tanda 1.
// Como el usuario YA tiene cuenta (fue creada en la tanda 1), generateLink("invite")
// siempre va a fallar con "already registered" y el link real será "recovery"
// (isExisting=true) sin importar la variante original — es el comportamiento esperado,
// no un bug. Único ajuste de copy: se antepone "Recordatorio: " al asunto.
// NO vuelve a upsertear profile/enrollment (ya existen desde la tanda 1): solo
// reenvía el correo y registra un nuevo invitation_log.
//
// Modos:
//   node scripts/reinvite-stuck-capacitaciones.mjs --dry-run  -> NO genera links, NO
//                                                                 envía correos; solo
//                                                                 detecta y cuenta.
//   node scripts/reinvite-stuck-capacitaciones.mjs --send     -> reenvía de verdad a
//                                                                 los pendientes.
//
// NUNCA reenvía a quien esté en EXCLUDE (cuentas de sistema/compartidas, por si acaso).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

// ---------------------------------------------------------------- config
const COHORT_ID = "b0000000-0000-0000-0000-000000000004";
const PROGRAM_NAME = "Ciclo de Capacitación Comercial CI";
const BASE_URL = "https://capitalacademy.cl";
const SENT_BY = "900823a1-e5e3-4721-b6aa-70ba791928b4"; // admin edaza
const ACCENT = "#d14a6b"; // ca-rose — acento del entorno Capacitación Comercial CI
const EXCLUDE = new Set([
  "academia@capitalinteligente.cl",
  "edaza@capitalinteligente.cl",
  "domca@capitalinteligente.cl",
  "grecaconsultores@capitalinteligente.cl",
  "inverproper@capitalinteligente.cl",
  "opig@capitalinteligente.cl",
  "sinapsis@capitalinteligente.cl",
  "vanema@capitalinteligente.cl",
  "contactcenter@capitalinteligente.cl",
  "rrss@capitalinteligente.cl",
]);
const SEND_DELAY_MS = 550; // ~2/seg (límite por defecto de Resend); ver retry ante 429 en sendResend

// Ventana real de envío de la tanda 1: 2026-07-15 20:19–20:24 UTC. Con margen para
// clasificar invite (creado en tanda1) vs recovery (preexistente).
const TANDA1_WINDOW_START = new Date("2026-07-15T20:15:00Z").getTime();
const TANDA1_WINDOW_END = new Date("2026-07-15T20:30:00Z").getTime();

const NEXT_CLASS = {
  fecha: "Martes 21 de julio",
  hora: "10:00 a 12:00 hrs",
  tema: "Soporte comercial: lectura de resumen de proyecto y uso de Brekto",
  lugar: "Auditorio · Capital Inteligente",
  expositor: "Areli Marisio",
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

// ---------------------------------------------------------------- helpers (copy/plantilla idénticos a invite-capacitaciones.mjs)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function buildConfirmUrl(hashedToken, type) {
  return `${BASE_URL}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=${type}&next=${encodeURIComponent("/onboarding/capacitaciones/set-password")}`;
}

function invitationHtml({ fullName, inviteUrl, isExisting }) {
  const firstName = fullName.split(" ")[0];
  const heading = isExisting
    ? `${esc(firstName)}, te sumamos al ${esc(PROGRAM_NAME)}`
    : `&iexcl;Te damos la bienvenida, ${esc(firstName)}!`;
  const intro = isExisting
    ? `Ya tienes cuenta en Capital Academy y ahora tambi&eacute;n eres parte del <strong>${esc(PROGRAM_NAME)}</strong>: una l&iacute;nea de capacitaci&oacute;n para la fuerza de venta de Capital Inteligente, para fortalecer tu desempe&ntilde;o comercial y conectar con las &aacute;reas, herramientas y procesos que respaldan tu gesti&oacute;n diaria.`
    : `Te sumamos al <strong>${esc(PROGRAM_NAME)}</strong>: una l&iacute;nea de capacitaci&oacute;n para la fuerza de venta de Capital Inteligente, para fortalecer tu desempe&ntilde;o comercial y conectar con las &aacute;reas, herramientas y procesos que respaldan tu gesti&oacute;n diaria.`;
  const second = isExisting
    ? `En tu cuenta de <strong style="color:${ACCENT};">Capital Academy</strong>, el ciclo aparece junto a tus otros programas, con el calendario y el espacio para seguir cada sesi&oacute;n.`
    : `Aqu&iacute; tendr&aacute;s tu <strong style="color:${ACCENT};">acceso a Capital Academy</strong>, con el calendario del ciclo y el espacio para seguir cada sesi&oacute;n.`;
  const ctaLabel = isExisting ? "Entrar al ciclo" : "Activar mi acceso y entrar";
  const ctaNote = isExisting
    ? `El enlace expira en 72 horas y te lleva a definir tu contrase&ntilde;a. Si ya la recuerdas, entra directo en capitalacademy.cl.`
    : `El enlace expira en 72 horas. Al activarlo, creas tu contrase&ntilde;a y entras a la plataforma.`;
  const qrNote = isExisting
    ? `El d&iacute;a de la clase marcas tu asistencia escaneando el QR.`
    : `Activa tu cuenta ahora: el d&iacute;a de la clase marcas tu asistencia escaneando el QR.`;
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
        <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;color:#14163a;font-weight:800;">${heading}</h1>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">${intro}</p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">${second}</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px 32px;">
        <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;color:${ACCENT};text-transform:uppercase;font-weight:800;">Qu&eacute; encontrar&aacute;s adentro</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;color:#3a3d5c;">
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;width:26px;">&#128197;</td><td style="padding:5px 0;"><strong>El calendario de sesiones</strong>, con fechas, temas y expositores.</td></tr>
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;">&#128172;</td><td style="padding:5px 0;"><strong>El foro del ciclo</strong> para resolver dudas con tus compa&ntilde;eros y los expositores.</td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 32px 12px 32px;">
        <a href="${esc(inviteUrl)}" target="_blank" style="display:inline-block;padding:15px 44px;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">${ctaLabel}</a>
      </td></tr>
      <tr><td style="padding:0 32px 24px 32px;"><p style="margin:0;font-size:13px;line-height:1.6;color:#6b6e8a;text-align:center;">${ctaNote}</p></td></tr>
      <tr><td style="padding:0 32px 22px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fdeef2;border-radius:12px;border:1px solid #f7dde4;">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 10px 0;font-size:12px;letter-spacing:0.15em;color:${ACCENT};text-transform:uppercase;font-weight:800;">Tu pr&oacute;xima sesi&oacute;n &middot; presencial</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.55;color:#3a3d5c;">
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;width:24px;">&#128197;</td><td style="padding:3px 0;"><strong>${esc(NEXT_CLASS.fecha)}</strong> &middot; ${esc(NEXT_CLASS.hora)}</td></tr>
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;">&#128221;</td><td style="padding:3px 0;">${esc(NEXT_CLASS.tema)}</td></tr>
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;">&#128205;</td><td style="padding:3px 0;">Lugar: ${esc(NEXT_CLASS.lugar)}</td></tr>
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;">&#128100;</td><td style="padding:3px 0;">Expone: ${esc(NEXT_CLASS.expositor)}</td></tr>
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;">&#9888;&#65039;</td><td style="padding:3px 0;">Cupo limitado por orden de llegada.</td></tr>
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;">&#9989;</td><td style="padding:3px 0;">${qrNote}</td></tr>
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
function invitationText({ fullName, inviteUrl, isExisting }) {
  const firstName = fullName.split(" ")[0];
  const heading = isExisting
    ? `${firstName}, te sumamos al ${PROGRAM_NAME}`
    : `¡Te damos la bienvenida, ${firstName}!`;
  const intro = isExisting
    ? `Ya tienes cuenta en Capital Academy y ahora también eres parte del ${PROGRAM_NAME}: una línea de capacitación para la fuerza de venta de Capital Inteligente, para fortalecer tu desempeño comercial y conectar con las áreas, herramientas y procesos que respaldan tu gestión diaria.`
    : `Te sumamos al ${PROGRAM_NAME}: una línea de capacitación para la fuerza de venta de Capital Inteligente, para fortalecer tu desempeño comercial y conectar con las áreas, herramientas y procesos que respaldan tu gestión diaria.`;
  const second = isExisting
    ? "En tu cuenta de Capital Academy, el ciclo aparece junto a tus otros programas, con el calendario y el espacio para seguir cada sesión."
    : "Aquí tendrás tu acceso a Capital Academy, con el calendario del ciclo y el espacio para seguir cada sesión.";
  const ctaLabel = isExisting ? "Entra al ciclo" : "Activa tu acceso y entra";
  const ctaNote = isExisting
    ? "El enlace expira en 72 horas y te lleva a definir tu contraseña. Si ya la recuerdas, entra directo en capitalacademy.cl."
    : "El enlace expira en 72 horas. Al activarlo, creas tu contraseña y entras a la plataforma.";
  const qrNote = isExisting
    ? "El día de la clase marcas tu asistencia escaneando el QR."
    : "Activa tu cuenta ahora: el día de la clase marcas tu asistencia escaneando el QR.";
  return [
    heading, "",
    intro, "",
    second, "",
    "Qué encontrarás adentro:",
    "  • El calendario de sesiones, con fechas, temas y expositores.",
    "  • El foro del ciclo para resolver dudas con tus compañeros y los expositores.", "",
    `${ctaLabel}: ${inviteUrl}`, "",
    ctaNote, "",
    "TU PRÓXIMA SESIÓN (presencial):",
    `  • ${NEXT_CLASS.fecha} · ${NEXT_CLASS.hora}`,
    `  • ${NEXT_CLASS.tema}`,
    `  • Lugar: ${NEXT_CLASS.lugar}`,
    `  • Expone: ${NEXT_CLASS.expositor}`,
    "  • Cupo limitado por orden de llegada.",
    `  • ${qrNote}`, "",
    "¡Te esperamos! Si tienes alguna consulta antes de empezar, escríbenos.",
    "Equipo Capital Academy", "",
    "Capital Academy · capitalacademy.cl",
  ].join("\n");
}
async function sendResend(to, fullName, inviteUrl, isExisting, subjectPrefix = "") {
  const firstName = fullName.split(" ")[0];
  const subject = subjectPrefix + (isExisting
    ? `${firstName}, te sumamos al Ciclo de Capacitación Comercial CI`
    : `${firstName}, tu acceso al Ciclo de Capacitación Comercial CI ya está disponible`);
  const body = JSON.stringify({
    from: FROM_EMAIL, to,
    subject,
    html: invitationHtml({ fullName, inviteUrl, isExisting }),
    text: invitationText({ fullName, inviteUrl, isExisting }),
  });
  const retryDelaysMs = [1000, 2000, 4000]; // backoff ante 429 (rate limit de Resend)
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body,
    });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < retryDelaysMs.length) {
      await sleep(retryDelaysMs[attempt]);
      continue;
    }
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
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
  return { inviteUrl: buildConfirmUrl(hashed, type), userId, isExisting: type === "recovery" };
}

// ---------------------------------------------------------------- detección
const PER_PAGE = 10;
const MAX_PAGE = 60;
async function loadAuthStatusByEmail() {
  const byEmail = new Map();
  let skipped = 0, emptyStreak = 0;
  for (let page = 1; page <= MAX_PAGE; page++) {
    const { data, error } = await classroom.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) { skipped++; continue; }
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email) {
        byEmail.set(u.email.toLowerCase(), {
          id: u.id,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          email_confirmed_at: u.email_confirmed_at,
        });
      }
    }
    if (users.length < PER_PAGE) { emptyStreak++; if (emptyStreak >= 2) break; } else { emptyStreak = 0; }
  }
  if (skipped) console.log(`(aviso: ${skipped} página(s) de auth.users saltadas por error del Admin API)`);
  return byEmail;
}

async function buildRoster() {
  const { data, error } = await classroom
    .from("enrollments")
    .select("student_id, profiles!inner(email, full_name)")
    .eq("cohort_id", COHORT_ID)
    .eq("status", "active");
  if (error) throw new Error(`enrollments: ${error.message}`);
  return (data ?? [])
    .map((r) => ({
      email: (r.profiles?.email || "").toLowerCase(),
      fullName: r.profiles?.full_name || r.profiles?.email || "",
    }))
    .filter((r) => r.email && !EXCLUDE.has(r.email));
}

function classifyOriginalVariant(createdAtIso) {
  if (!createdAtIso) return "desconocido";
  const t = new Date(createdAtIso).getTime();
  return t >= TANDA1_WINDOW_START && t <= TANDA1_WINDOW_END ? "invite" : "recovery";
}

// ---------------------------------------------------------------- main
const argv = process.argv.slice(2);
const MODE = argv.includes("--send") ? "send" : argv.includes("--dry-run") ? "dry-run" : null;
if (!MODE) {
  console.error("Uso: node scripts/reinvite-stuck-capacitaciones.mjs --dry-run | --send");
  process.exit(1);
}

const roster = await buildRoster();
const authByEmail = await loadAuthStatusByEmail();

const activados = [];
const pendientes = [];
const sinRegistroAuth = []; // matriculado active pero sin auth user encontrado (anómalo)
for (const r of roster) {
  const auth = authByEmail.get(r.email);
  if (!auth) { sinRegistroAuth.push(r); continue; }
  if (auth.last_sign_in_at) {
    activados.push(r);
  } else {
    pendientes.push({
      ...r,
      email_confirmed_at: auth.email_confirmed_at,
      variantOriginal: classifyOriginalVariant(auth.created_at),
    });
  }
}

if (MODE === "dry-run") {
  console.log(`→ Matriculados 'active' en el cohorte (${COHORT_ID}): ${roster.length}`);
  console.log(`  Activados (last_sign_in_at != null)      : ${activados.length}`);
  console.log(`  Pendientes (stuck, sin ingresar aún)      : ${pendientes.length}`);
  if (sinRegistroAuth.length) {
    console.log(`  Sin registro en auth.users (anómalo)      : ${sinRegistroAuth.length}`);
    sinRegistroAuth.forEach((r) => console.log(`    - ${r.email} (${r.fullName})`));
  }

  const inviteCount = pendientes.filter((p) => p.variantOriginal === "invite").length;
  const recoveryCount = pendientes.filter((p) => p.variantOriginal === "recovery").length;
  const desconocidoCount = pendientes.filter((p) => p.variantOriginal === "desconocido").length;
  console.log(`\n→ Desglose de pendientes por variante ORIGINAL de tanda 1 (inferida por auth.users.created_at):`);
  console.log(`  invite (cuenta nueva en tanda 1)     : ${inviteCount}`);
  console.log(`  recovery (cuenta ya existía)         : ${recoveryCount}`);
  if (desconocidoCount) console.log(`  desconocido (sin created_at)         : ${desconocidoCount}`);
  console.log(`  (nota: en la tanda 2 TODOS caerán a type=recovery en generateLink, porque la cuenta ya existe desde la tanda 1 — no depende de la variante original.)`);

  console.log(`\n→ Pendientes (${pendientes.length}):`);
  pendientes
    .sort((a, b) => a.email.localeCompare(b.email))
    .forEach((p, i) => console.log(`  ${i + 1}. ${p.fullName} <${p.email}> [tanda1=${p.variantOriginal}]`));

  const csvLines = [
    "fullName,email,variantOriginal",
    ...pendientes.map((p) => `"${p.fullName.replace(/"/g, '""')}",${p.email},${p.variantOriginal}`),
  ];
  const csvPath = join(REPO, "scripts", ".tmp-reinvite-capacitaciones-pendientes.csv");
  writeFileSync(csvPath, csvLines.join("\n") + "\n", "utf8");
  console.log(`\n✓ CSV escrito en ${csvPath}`);
  console.log("  (dry-run: no se generó ningún link, no se llamó a generateLink, no se envió ningún correo, no se tocó invitation_log.)");
  process.exit(0);
}

// MODE === "send"
console.log(`→ Reenviando a ${pendientes.length} pendiente(s) de ${roster.length} matriculados active.`);
const ok = [];
const fail = [];
let i = 0;
for (const p of pendientes) {
  i++;
  try {
    const { inviteUrl, userId, isExisting } = await makeInviteUrl(p.email);
    if (!userId) throw new Error("sin userId tras generateLink");

    await sendResend(p.email, p.fullName, inviteUrl, isExisting, "Recordatorio: ");

    await classroom.from("invitation_log").insert({
      user_id: userId, email: p.email, sent_at: new Date().toISOString(),
      sent_by: SENT_BY, channel: "email", status: "sent",
    });

    ok.push(p.email);
    console.log(`  ✓ ${i}/${pendientes.length} ${p.email}`);
  } catch (e) {
    fail.push({ email: p.email, error: e.message });
    console.log(`  ✗ ${p.email}: ${e.message}`);
  }
  await sleep(SEND_DELAY_MS);
}

console.log("\n================ RESULTADO ================");
console.log(`Reenviados OK : ${ok.length}`);
console.log(`Fallidos      : ${fail.length}`);
if (fail.length) console.log(JSON.stringify(fail, null, 2));
