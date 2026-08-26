// Aviso one-off: la clase del 26-ago del Diplomado se dicta por Zoom y no en la
// sala de la plataforma.
//
// Por qué hace falta: los recordatorios de 72 h y 24 h salieron el 23 y el 25 de
// agosto, cuando la sesión todavía no tenía `meeting_url`, así que llevaban a la
// sala de la plataforma. El enlace de Zoom se cargó el mismo 26 a las 13:26. El
// recordatorio de 1 h ya sale con el enlace correcto, pero quien tenga abierto
// un correo anterior llegaría a una sala vacía.
//
// Audiencia: matrículas activas de la cohorte del Diplomado con
// profiles.account_type='real' — la etiqueta de ADR-0037 deja fuera al equipo y
// a las cuentas de prueba sin listas negras a mano.
//
// Modos:
//   node scripts/aviso-clase-zoom-2026-08-26.mjs --dry-run   -> lista destinatarios, no envía
//   node scripts/aviso-clase-zoom-2026-08-26.mjs preview     -> una muestra real a PREVIEW_TO
//   node scripts/aviso-clase-zoom-2026-08-26.mjs send        -> envío real
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dirname, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const COHORT_ID = "b0000000-0000-0000-0000-000000000002";
const SESSION_ID = "e0000000-0000-0000-0000-000000000020";
const PREVIEW_TO = "edaza@capitalinteligente.cl";
const SENT_LOG = join(__dirname, ".sent-aviso-zoom-2026-08-26.json");
const SEND_DELAY_MS = 280;

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: session } = await supabase
  .from("class_sessions")
  .select("title, starts_at, meeting_url")
  .eq("id", SESSION_ID)
  .single();

if (!session?.meeting_url) {
  console.error("La sesión no tiene meeting_url; nada que avisar.");
  process.exit(1);
}

const hora = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date(session.starts_at));

const { data: rows, error } = await supabase
  .from("enrollments")
  .select("student_id, profiles(email, full_name, account_type)")
  .eq("cohort_id", COHORT_ID)
  .eq("status", "active");
if (error) {
  console.error("No se pudo leer la audiencia:", error.message);
  process.exit(1);
}

const byEmail = new Map();
for (const r of rows ?? []) {
  const p = r.profiles;
  if (!p?.email) continue;
  if (p.account_type !== "real") continue; // ADR-0037: equipo y QA fuera
  const email = p.email.trim().toLowerCase();
  if (!byEmail.has(email)) byEmail.set(email, { email, fullName: p.full_name ?? "" });
}
const destinatarios = [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));

const SUBJECT = `Cambio de sala: la clase de hoy (${hora} h) es por Zoom`;

function html(nombre) {
  const saludo = nombre ? `Hola, ${nombre.split(" ")[0]}` : "Hola";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14163a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);">
        <tr><td align="center" style="padding:32px 28px;background:#14163a;">
          <img src="https://capitalacademy.cl/brand/logo-light.png" alt="Capital Academy" width="200" style="display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;" />
          <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;">Diplomado Ejecutivo</p>
        </td></tr>
        <tr><td style="padding:32px 32px 8px 32px;">
          <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:800;">${saludo}:</h1>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">La clase de <strong>hoy a las ${hora} h</strong> se dicta por <strong>Zoom</strong>, no en la sala de la plataforma. Si guardaste el enlace de un correo anterior, usa este en su lugar.</p>
          <p style="margin:0 0 4px 0;font-size:15px;line-height:1.65;color:#3a3d5c;"><strong>${session.title}</strong></p>
        </td></tr>
        <tr><td align="center" style="padding:16px 32px 28px 32px;">
          <a href="${session.meeting_url}" target="_blank" style="display:inline-block;padding:14px 40px;background:#5e17eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">Entrar por Zoom</a>
        </td></tr>
        <tr><td style="padding:0 32px 24px 32px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6b6e8a;">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all;color:#5e17eb;">${session.meeting_url}</span></p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;">
          <p style="margin:0;font-size:12px;color:#9b9db5;text-align:center;">Capital Academy &middot; <a href="https://capitalacademy.cl/classroom" style="color:#5e17eb;text-decoration:none;">Ir a la plataforma</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function texto(nombre) {
  const saludo = nombre ? `Hola, ${nombre.split(" ")[0]}` : "Hola";
  return [
    `${saludo}:`,
    "",
    `La clase de hoy a las ${hora} h se dicta por Zoom, no en la sala de la plataforma.`,
    "Si guardaste el enlace de un correo anterior, usa este en su lugar.",
    "",
    session.title,
    session.meeting_url,
    "",
    "Capital Academy · capitalacademy.cl/classroom",
  ].join("\n");
}

const modo = process.argv[2] ?? "--dry-run";

console.log(`Sesión: ${session.title}`);
console.log(`Hora Chile: ${hora}`);
console.log(`Zoom: ${session.meeting_url}`);
console.log(`Asunto: ${SUBJECT}`);
console.log(`Destinatarios reales: ${destinatarios.length}`);
for (const d of destinatarios) console.log(`  - ${d.email} (${d.fullName || "sin nombre"})`);

if (modo === "--dry-run") {
  console.log("\nCorrida en seco. No se envió nada.");
  process.exit(0);
}

async function enviar(to, fullName) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to,
      subject: SUBJECT,
      html: html(fullName),
      text: texto(fullName),
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

if (modo === "preview") {
  const id = await enviar(PREVIEW_TO, "Elkis");
  console.log(`\nMuestra enviada a ${PREVIEW_TO} (${id}). No se tocó la base ni el log.`);
  process.exit(0);
}

if (modo !== "send") {
  console.error(`\nModo desconocido: ${modo}`);
  process.exit(1);
}

// Idempotencia local: si el script se corre dos veces, nadie recibe doble.
const yaEnviado = existsSync(SENT_LOG) ? JSON.parse(readFileSync(SENT_LOG, "utf8")) : {};
let ok = 0;
let fallos = 0;
for (const d of destinatarios) {
  if (yaEnviado[d.email]) {
    console.log(`saltado (ya recibió) ${d.email}`);
    continue;
  }
  try {
    const id = await enviar(d.email, d.fullName);
    yaEnviado[d.email] = { id, at: new Date().toISOString() };
    writeFileSync(SENT_LOG, JSON.stringify(yaEnviado, null, 2));
    ok++;
    console.log(`enviado ${d.email}`);
  } catch (err) {
    fallos++;
    console.error(`FALLÓ ${d.email}: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
}
console.log(`\nListo: ${ok} enviados, ${fallos} fallidos.`);
