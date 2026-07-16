// Matrícula + invitación de la fuerza de ventas al Ciclo de Capacitación Comercial CI.
//
// Entorno: "Ciclo de Capacitación Comercial CI" (ADR-0012, seed 0049).
//   Programa CAP-CI · Cohorte G1 "I Ciclo — 2026" · b0000000-…-000000000004.
//   Ciclo interno GRATUITO para la fuerza de ventas de Capital Inteligente.
//   Próxima sesión: martes 21 de julio, 10:00–12:00, presencial (Auditorio).
//
// Flujo (idempotente) por alumno, replicando scripts/invite-diplomado-g4.mjs:
//   1. generateLink(invite) -> crea auth user si no existe + token; cae a recovery si ya existe
//   2. upsert profile (role student)
//   3. upsert enrollment en G1 (status active)
//   4. envía email branded vía Resend (copy del ciclo interno; acento rose del entorno)
//   5. registra invitation_log (anti-duplicado)
//
// Origen de los alumnos: XLSX exportado de Salesforce (ver SOURCE_XLSX), hoja
// "Usuarios Salesforce". Se filtra en este orden (ver loadRawRows/filterStudents):
//   a) Tipo de usuario distinto de PowerPartner/Standard (cuentas de sistema)
//   b) Correos de integración (INTEGRATION_EMAILS)
//   c) Dominio: solo @capitalinteligente.cl / @capitalinteligente.me (red de seguridad)
//   d) EXCLUDE: cuentas maestras de empresa y compartidas
//   e) Dedup por correo
//   f) Ya matriculados en este cohorte (se resuelve aparte, requiere consultar la base)
//
// Modos:
//   node scripts/invite-capacitaciones.mjs preview   -> NO escribe nada, envía 1 correo de muestra a PREVIEW_TO
//   node scripts/invite-capacitaciones.mjs dry-run   -> NO escribe nada, NO envía correos; corre toda la carga +
//                                                        filtrado + consulta de ya-matriculados e imprime el
//                                                        desglose completo + CSV con el objetivo final
//   node scripts/invite-capacitaciones.mjs send       -> ejecuta sobre el objetivo filtrado del XLSX
//
// NUNCA reenvía a quien ya está en invitation_log (para ESTE cohorte) ni toca EXCLUDE.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

// ---------------------------------------------------------------- listado (XLSX)
// Export de Salesforce: hoja "Usuarios Salesforce", fila 1 = headers, resto = datos.
// Columnas: Nombre | Correo | Equipo (UserRole) | Perfil | Cargo (Title) | Departamento |
//           Tipo de usuario | SF User Id
const SOURCE_XLSX = "/Users/macbookpro/Downloads/usuarios-salesforce-activos-2026-07-15.xlsx";
const XLSX_SHEET = "Usuarios Salesforce";

const ALLOWED_TIPOS = new Set(["PowerPartner", "Standard"]);
const INTEGRATION_EMAILS = new Set([
  "insightsintegration@00dam00001qdv4ieav.ext",
  "salesforceiqintegration@00dam00001qdv4ieav.ext",
  "noreply@salesforce.com",
]);
const ALLOWED_DOMAINS = ["@capitalinteligente.cl", "@capitalinteligente.me"];
const BLOCKED_DOMAIN_MARKERS = ["00dam00001qdv4ieav", "salesforce.com"];

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
  // cuentas maestras de empresa (socios del portal, no una persona)
  "domca@capitalinteligente.cl", // Domca Brokers
  "grecaconsultores@capitalinteligente.cl", // GRECA CONSULTORES
  "inverproper@capitalinteligente.cl", // Inverproper BP
  "opig@capitalinteligente.cl", // Olivero Partners
  "sinapsis@capitalinteligente.cl", // SINAPSIS CI
  "vanema@capitalinteligente.cl", // VANEMA BP
  // cuentas compartidas (no una persona)
  "contactcenter@capitalinteligente.cl", // Contact Center Ci
  "rrss@capitalinteligente.cl", // Marketing Ci
]);
const SEND_DELAY_MS = 550; // ~2/seg (límite por defecto de Resend); ver retry ante 429 en sendResend

// Datos de la próxima clase (para el email de bienvenida). Es presencial.
const NEXT_CLASS = {
  fecha: "Martes 21 de julio",
  hora: "10:00 a 12:00 hrs",
  tema: "Soporte comercial: lectura de resumen de proyecto y uso de Brekto",
  lugar: "Auditorio · Capital Inteligente",
  // Verificado en class_sessions/instructors de este cohorte (id e...402 -> d...017).
  expositor: "Areli Marisio",
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

// ---------------------------------------------------------------- alumnos (xlsx)
function loadRawRows() {
  // XLSX.readFile no existe en el build ESM (no trae fs); leemos el buffer.
  const wb = XLSX.read(readFileSync(SOURCE_XLSX), { type: "buffer" });
  const ws = wb.Sheets[XLSX_SHEET] ?? wb.Sheets[wb.SheetNames[0]];
  // header:1 => arrays por fila. fila 0 = headers, resto = datos.
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  return rows.slice(1)
    .map((r) => ({
      fullName: String(r[0] || "").trim(),
      email: String(r[1] || "").trim().toLowerCase(),
      tipo: String(r[6] || "").trim(),
    }))
    .filter((r) => r.email && r.email.includes("@"));
}

// Filtra en el orden a-e del comentario de cabecera. 'f' (ya matriculados) se
// resuelve aparte porque requiere consultar la base.
function filterStudents(rows) {
  const excluded = { tipo: [], integracion: [], dominio: [], exclude: [], dedup: [] };

  let step = rows.filter((r) => {
    if (ALLOWED_TIPOS.has(r.tipo)) return true;
    excluded.tipo.push(r);
    return false;
  });
  step = step.filter((r) => {
    if (!INTEGRATION_EMAILS.has(r.email)) return true;
    excluded.integracion.push(r);
    return false;
  });
  step = step.filter((r) => {
    const domainOk = ALLOWED_DOMAINS.some((d) => r.email.endsWith(d));
    const blocked = BLOCKED_DOMAIN_MARKERS.some((m) => r.email.includes(m));
    if (domainOk && !blocked) return true;
    excluded.dominio.push(r);
    return false;
  });
  step = step.filter((r) => {
    if (!EXCLUDE.has(r.email)) return true;
    excluded.exclude.push(r);
    return false;
  });
  const seen = new Set();
  step = step.filter((r) => {
    if (seen.has(r.email)) {
      excluded.dedup.push(r);
      return false;
    }
    seen.add(r.email);
    return true;
  });

  return { candidates: step, excluded };
}

// ---------------------------------------------------------------- main
const MODE = process.argv[2];
if (!["preview", "dry-run", "send"].includes(MODE)) {
  console.error("Uso: node scripts/invite-capacitaciones.mjs <preview|dry-run|send>");
  process.exit(1);
}

if (MODE === "preview") {
  const inviteUrl = `${BASE_URL}/auth/confirm?token_hash=PREVIEW&type=invite&next=%2Fonboarding%2Fcapacitaciones%2Fset-password`;
  await sendResend(PREVIEW_TO, "Elkis (PREVIEW)", inviteUrl, false, "[PREVIEW nuevo] ");
  await sendResend(PREVIEW_TO, "Elkis (PREVIEW)", inviteUrl, true, "[PREVIEW existente] ");
  console.log(`✓ Preview branded (ciclo interno, acento rose) enviado a ${PREVIEW_TO}: variante nuevo + variante existente.`);
  console.log("  (No se creó ninguna cuenta ni se tocó la base.)");
  process.exit(0);
}

// MODE === "dry-run" | "send": carga + filtrado a-e (comparten toda esta lógica)
const rawRows = loadRawRows();
const { candidates, excluded } = filterStudents(rawRows);

// f) ya matriculados: filtramos por enrollment en ESTE cohorte, no invitation_log
//    global-por-email, para no bloquear a un interno que ya está en otro programa.
const { data: existingEnroll } = await classroom
  .from("enrollments")
  .select("student_id, profiles!inner(email)")
  .eq("cohort_id", COHORT_ID);
const alreadyEnrolled = new Set(
  (existingEnroll ?? []).map((r) => (r.profiles?.email || "").toLowerCase()).filter(Boolean),
);

const yaMatriculados = candidates.filter((r) => alreadyEnrolled.has(r.email));
const targets = candidates
  .filter((r) => !alreadyEnrolled.has(r.email))
  .map((r) => ({ email: r.email, fullName: r.fullName || r.email }));

if (MODE === "dry-run") {
  const printGroup = (label, list) => {
    console.log(`  ${label}: ${list.length}`);
    for (const r of list) console.log(`    - ${r.email}${r.fullName ? ` (${r.fullName})` : ""}`);
  };

  console.log(`→ XLSX: ${rawRows.length} filas de datos.`);
  printGroup("a) excluidos por tipo de usuario", excluded.tipo);
  printGroup("b) excluidos por correo de integración", excluded.integracion);
  printGroup("c) excluidos por dominio", excluded.dominio);
  printGroup("d) excluidos por EXCLUDE (empresa/compartidas)", excluded.exclude);
  printGroup("e) descartados por duplicado", excluded.dedup);
  printGroup("f) ya matriculados en este cohorte", yaMatriculados);

  console.log(`\n→ Objetivo final: ${targets.length}`);
  const tipoCount = { PowerPartner: 0, Standard: 0 };
  for (const r of candidates) {
    if (!alreadyEnrolled.has(r.email) && tipoCount[r.tipo] !== undefined) tipoCount[r.tipo]++;
  }
  console.log(`  PowerPartner: ${tipoCount.PowerPartner} | Standard: ${tipoCount.Standard}`);

  // Solo lectura: anticipa el desglose invite (nuevo) vs recovery (ya tiene cuenta)
  // que decidirá makeInviteUrl en modo send. Batching por si .in() no admite 222 de una.
  const targetEmails = targets.map((t) => t.email);
  const existingProfileEmails = new Set();
  const BATCH = 100;
  for (let start = 0; start < targetEmails.length; start += BATCH) {
    const batch = targetEmails.slice(start, start + BATCH);
    const { data, error } = await classroom.from("profiles").select("email").in("email", batch);
    if (error) throw new Error(`profiles (dry-run desglose): ${error.message}`);
    for (const r of data ?? []) existingProfileEmails.add((r.email || "").toLowerCase());
  }
  const nuevosCount = targets.filter((t) => !existingProfileEmails.has(t.email)).length;
  const existentesCount = targets.length - nuevosCount;
  console.log(`  Objetivo final: ${targets.length} → ${nuevosCount} nuevos (invite) · ${existentesCount} ya tienen cuenta (recovery)`);

  targets.forEach((t, i) => console.log(`  ${i + 1}. ${t.fullName} <${t.email}>`));

  const csvLines = ["fullName,email", ...targets.map((t) => `"${t.fullName.replace(/"/g, '""')}",${t.email}`)];
  const csvPath = "/private/tmp/claude-501/-Users-macbookpro-Documents-Capitalacademy/6b096009-4756-4262-9e88-52d91de05429/scratchpad/ci-objetivo-final.csv";
  writeFileSync(csvPath, csvLines.join("\n") + "\n", "utf8");
  console.log(`\n✓ CSV escrito en ${csvPath}`);
  console.log("  (dry-run: no se tocó la base, no se llamó a generateLink, no se envió ningún correo.)");
  process.exit(0);
}

// MODE === "send"
console.log(`→ En XLSX: ${rawRows.length} | candidatos tras filtros a-e: ${candidates.length} | objetivo a invitar: ${targets.length} (ya matriculados: ${yaMatriculados.length})`);

const ok = [];
const fail = [];
let i = 0;
for (const t of targets) {
  i++;
  try {
    const { inviteUrl, userId, isExisting } = await makeInviteUrl(t.email);
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

    await sendResend(t.email, t.fullName, inviteUrl, isExisting);

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
