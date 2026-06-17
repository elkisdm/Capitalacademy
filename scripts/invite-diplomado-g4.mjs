// Matrícula + invitación de los 8 alumnos del Diplomado G4 al classroom de Capital Academy.
//
// Origen de los alumnos: "4ta generacion diplomado/LISTA OFICIAL DE ALUMNOS.xlsx"
//   fila 0 = título "Listado Alumnos Inscritos"
//   fila 1 = headers: Nombres | Apellidos | Correo
//   filas 2..n = alumnos (8 alumnos; 4 con correo @capitalinteligente.cl)
//
// Destino: cohorte G4 (IV Generación — Junio 2026) del proyecto classroom (.env de este repo).
//
// Flujo (idempotente) por alumno, replicando scripts/bulk-invite-workshop.mjs:
//   1. generateLink(invite) -> crea auth user si no existe + token; cae a recovery si ya existe
//   2. upsert profile (role student)
//   3. upsert enrollment en G4 (status active)
//   4. envía email branded vía Resend (copy PRESENCIAL: clases en vivo)
//   5. registra invitation_log (anti-duplicado)
//
// Modos:
//   node scripts/invite-diplomado-g4.mjs preview   -> NO escribe nada, envía 1 correo de muestra a PREVIEW_TO
//   node scripts/invite-diplomado-g4.mjs send       -> ejecuta sobre los alumnos reales del xlsx
//
// NUNCA toca los emails de EXCLUDE ni reenvía a quien ya está en invitation_log.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const XLSX_PATH = join(REPO, "4ta generacion diplomado", "LISTA OFICIAL DE ALUMNOS.xlsx");

// ---------------------------------------------------------------- config
const COHORT_ID = "b0000000-0000-0000-0000-000000000002";
const PROGRAM_NAME = "Diplomado Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria";
const COHORT_NAME = "IV Generación — Junio 2026";
const BASE_URL = "https://capitalacademy.cl";
const SENT_BY = "900823a1-e5e3-4721-b6aa-70ba791928b4"; // admin edaza
const PREVIEW_TO = "edaza@capitalinteligente.cl";
const EXCLUDE = new Set([
  "academia@capitalinteligente.cl",
  "edaza@capitalinteligente.cl",
]);
const SEND_DELAY_MS = 280; // ~3.5/seg, holgado para Resend

// Alumnos internos de Capital Inteligente: van etiquetados con un segmento distinto.
// El dominio corporativo es el discriminador (los 4 @capitalinteligente.cl de la lista).
const INTERNAL_DOMAIN = "@capitalinteligente.cl";
function segmentFor(email) {
  return email.toLowerCase().endsWith(INTERNAL_DOMAIN) ? "internal" : "external";
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

function courseLabel(p, c) {
  p = (p ?? "").trim();
  c = (c ?? "").trim();
  if (!p) return c;
  if (!c) return p;
  if (c.toLowerCase().startsWith(p.toLowerCase())) return c;
  return `${p} — ${c}`;
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function buildConfirmUrl(hashedToken, type) {
  return `${BASE_URL}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=${type}&next=${encodeURIComponent("/onboarding/set-password")}`;
}

// --- Email PRESENCIAL: el Diplomado tiene clases en vivo, no masterclasses on-demand.
function invitationHtml({ fullName, inviteUrl }) {
  const firstName = fullName.split(" ")[0];
  const label = courseLabel(PROGRAM_NAME, COHORT_NAME);
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14163a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);">
      <tr><td style="padding:0;background:#14163a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 28px;">
        <img src="https://capitalacademy.cl/brand/logo-light.png" alt="Capital Academy" width="200" style="display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;outline:none;text-decoration:none;" />
        <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;">Plataforma educativa</p>
      </td></tr></table></td></tr>
      <tr><td style="padding:32px 32px 8px 32px;">
        <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;color:#14163a;font-weight:800;">&iexcl;Bienvenido a Capital Academy, ${esc(firstName)}!</h1>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">Es un placer darte la bienvenida a la <strong>IV Generaci&oacute;n</strong> del <strong>${esc(PROGRAM_NAME)}</strong>. Est&aacute;s a punto de iniciar un camino que transformar&aacute; tu forma de entender y ejercer la venta inmobiliaria: una nueva metodolog&iacute;a comercial, t&eacute;cnicas de cierre, herramientas de soporte al asesor, gesti&oacute;n de clientes y negociaci&oacute;n.</p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">Hoy damos el primer paso: tu acceso a <strong style="color:#5e17eb;">Capital Academy</strong>, donde tendr&aacute;s tu calendario de clases, el material de cada sesi&oacute;n y todo lo que necesitas durante el programa.</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px 32px;">
        <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;color:#5e17eb;text-transform:uppercase;font-weight:800;">Qu&eacute; encontrar&aacute;s adentro</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;color:#3a3d5c;">
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;width:26px;">&#128197;</td><td style="padding:5px 0;"><strong>Tu calendario de clases en vivo</strong>, con fechas, horarios y docentes.</td></tr>
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;">&#128218;</td><td style="padding:5px 0;"><strong>Material y recursos</strong> complementarios de cada sesi&oacute;n.</td></tr>
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;">&#127942;</td><td style="padding:5px 0;"><strong>Pon a prueba lo aprendido</strong> y obt&eacute;n tu certificado.</td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 32px 12px 32px;">
        <a href="${esc(inviteUrl)}" target="_blank" style="display:inline-block;padding:15px 44px;background:#5e17eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">Activar mi acceso y entrar</a>
      </td></tr>
      <tr><td style="padding:0 32px 24px 32px;"><p style="margin:0;font-size:13px;line-height:1.6;color:#6b6e8a;text-align:center;">El enlace expira en 72 horas. Al activarlo, creas tu contrase&ntilde;a y entras a la plataforma.</p></td></tr>
      <tr><td style="padding:0 32px 32px 32px;">
        <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;color:#5e17eb;text-transform:uppercase;font-weight:800;">C&oacute;mo empezar</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;color:#3a3d5c;">
          <tr><td style="padding:4px 12px 4px 0;color:#5e17eb;font-weight:800;vertical-align:top;width:24px;">1.</td><td style="padding:4px 0;"><strong>Activa tu cuenta</strong> &mdash; crea tu contrase&ntilde;a <span style="color:#9b9db5;">(1 min)</span></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5e17eb;font-weight:800;vertical-align:top;">2.</td><td style="padding:4px 0;"><strong>Completa tu perfil</strong> (RUT, tel&eacute;fono) <span style="color:#9b9db5;">(2 min)</span></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5e17eb;font-weight:800;vertical-align:top;">3.</td><td style="padding:4px 0;"><strong>Revisa tu calendario y te esperamos en tu primera clase</strong></td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 22px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f1ff;border-radius:12px;border:1px solid #e7defc;">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 10px 0;font-size:12px;letter-spacing:0.15em;color:#5e17eb;text-transform:uppercase;font-weight:800;">Tu primera clase &middot; presencial</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.55;color:#3a3d5c;">
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;width:24px;">&#128197;</td><td style="padding:3px 0;"><strong>S&aacute;bado 20 de junio</strong> &middot; 9:30 a.m.</td></tr>
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;">&#128205;</td><td style="padding:3px 0;">Av. Presidente Kennedy 8017 (edificio Sony), piso 4, Las Condes.</td></tr>
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;">&#128663;</td><td style="padding:3px 0;">Estacionamientos disponibles. Te sugerimos llegar unos minutos antes.</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 28px 32px;"><p style="margin:0;font-size:14px;line-height:1.6;color:#3a3d5c;">&iexcl;Te esperamos con todo listo! Si tienes alguna consulta antes del inicio, escr&iacute;benos.<br/><strong>Equipo Capital Academy</strong></p></td></tr>
      <tr><td style="padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;"><p style="margin:0;font-size:12px;color:#9b9db5;text-align:center;">Capital Academy &middot; <a href="https://capitalacademy.cl" style="color:#5e17eb;text-decoration:none;">capitalacademy.cl</a></p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
function invitationText({ fullName, inviteUrl }) {
  const firstName = fullName.split(" ")[0];
  return [
    `¡Bienvenido a Capital Academy, ${firstName}!`, "",
    `Es un placer darte la bienvenida a la IV Generación del ${PROGRAM_NAME}. Estás a punto de iniciar un camino que transformará tu forma de entender y ejercer la venta inmobiliaria: una nueva metodología comercial, técnicas de cierre, herramientas de soporte al asesor, gestión de clientes y negociación.`, "",
    "Hoy damos el primer paso: tu acceso a Capital Academy, donde tendrás tu calendario de clases, el material de cada sesión y todo lo que necesitas durante el programa.", "",
    "Qué encontrarás adentro:",
    "  • Tu calendario de clases en vivo, con fechas, horarios y docentes.",
    "  • Material y recursos complementarios de cada sesión.",
    "  • Pon a prueba lo aprendido y obtén tu certificado.", "",
    `Activa tu acceso y entra: ${inviteUrl}`, "",
    "El enlace expira en 72 horas. Al activarlo, creas tu contraseña y entras a la plataforma.", "",
    "Cómo empezar:",
    "  1. Activa tu cuenta — crea tu contraseña (1 min)",
    "  2. Completa tu perfil — RUT, teléfono (2 min)",
    "  3. Revisa tu calendario y te esperamos en tu primera clase", "",
    "TU PRIMERA CLASE (presencial):",
    "  • Sábado 20 de junio · 9:30 a.m.",
    "  • Av. Presidente Kennedy 8017 (edificio Sony), piso 4, Las Condes.",
    "  • Estacionamientos disponibles. Te sugerimos llegar unos minutos antes.", "",
    "¡Te esperamos con todo listo! Si tienes alguna consulta antes del inicio, escríbenos.",
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
      subject: `${firstName}, tu acceso al Diplomado en Capital Academy ya está disponible 🎓`,
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
    options: { redirectTo: `${BASE_URL}/onboarding/set-password` },
  });
  if (error && /registered|already/i.test(error.message)) {
    ({ data, error } = await classroom.auth.admin.generateLink({
      type: "recovery", email,
      options: { redirectTo: `${BASE_URL}/onboarding/set-password` },
    }));
  }
  if (error) throw new Error(`generateLink: ${error.message}`);
  const hashed = data.properties.hashed_token;
  const type = data.properties.verification_type ?? "invite";
  const userId = data.user?.id ?? data.properties?.user_id;
  return { inviteUrl: buildConfirmUrl(hashed, type), userId };
}

// ---------------------------------------------------------------- alumnos (xlsx)
function loadStudents() {
  // XLSX.readFile no existe en el build ESM (no trae fs); leemos el buffer.
  const wb = XLSX.read(readFileSync(XLSX_PATH), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // header:1 => arrays por fila. fila 0 = título, fila 1 = headers, resto = datos.
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  const out = [];
  const seen = new Set();
  for (let i = 2; i < rows.length; i++) {
    const [nombres, apellidos, correo] = rows[i];
    const email = String(correo || "").trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    const fullName = `${String(nombres || "").trim()} ${String(apellidos || "").trim()}`.trim() || email;
    out.push({ email, fullName, segment: segmentFor(email) });
  }
  return out;
}

// ---------------------------------------------------------------- main
const MODE = process.argv[2];
if (!["preview", "send"].includes(MODE)) {
  console.error("Uso: node scripts/invite-diplomado-g4.mjs <preview|send>");
  process.exit(1);
}

if (MODE === "preview") {
  const inviteUrl = `${BASE_URL}/auth/confirm?token_hash=PREVIEW&type=invite&next=%2Fonboarding%2Fset-password`;
  await sendResend(PREVIEW_TO, "Elkis (PREVIEW)", inviteUrl);
  console.log(`✓ Preview branded (PRESENCIAL) enviado a ${PREVIEW_TO} — revisa el copy de clases en vivo y el LOGO sobre el header azul.`);
  console.log("  (No se creó ninguna cuenta ni se tocó la base.)");
  process.exit(0);
}

// MODE === "send"
console.log("→ Leyendo lista oficial de alumnos…");
const students = loadStudents();

const { data: invLog } = await classroom.from("invitation_log").select("email");
const alreadyInvited = new Set((invLog ?? []).map((r) => (r.email || "").toLowerCase()));

const targets = students.filter((s) => {
  if (EXCLUDE.has(s.email)) return false;
  if (alreadyInvited.has(s.email)) return false;
  return true;
});

const internalCount = targets.filter((t) => t.segment === "internal").length;
console.log(`→ Alumnos en lista: ${students.length} | objetivo a invitar: ${targets.length} (excluidos internos de EXCLUDE + ya invitados)`);
console.log(`  de los cuales internos (@capitalinteligente.cl): ${internalCount}`);

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

    // Enrollment en G4. status active.
    // Segmento (migración 0024): la columna enrollments.segment solo admite
    //   null | 'capital_inteligente' (CHECK). Mapeamos la etiqueta interna:
    //   'internal' (los 4 @capitalinteligente.cl) -> 'capital_inteligente';
    //   'external' -> null (sin segmento). Así los internos quedan marcados
    //   desde la invitación y verán las clases audience='capital_inteligente'.
    const dbSegment = t.segment === "internal" ? "capital_inteligente" : null;
    const enrollPayload = {
      cohort_id: COHORT_ID,
      student_id: userId,
      status: "active",
      segment: dbSegment,
    };
    const { error: enrErr } = await classroom.from("enrollments").upsert(
      enrollPayload,
      { onConflict: "cohort_id,student_id" },
    );
    if (enrErr) throw new Error(`enrollment: ${enrErr.message}`);

    await sendResend(t.email, t.fullName, inviteUrl);

    await classroom.from("invitation_log").insert({
      user_id: userId, email: t.email, sent_at: new Date().toISOString(),
      sent_by: SENT_BY, channel: "email", status: "sent",
    });

    ok.push(t.email);
    console.log(`  ✓ ${i}/${targets.length} ${t.email} [${t.segment}]`);
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
