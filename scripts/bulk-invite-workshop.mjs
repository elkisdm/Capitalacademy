// Bulk-invite de los compradores del workshop al classroom de Capital Academy.
//
// Flujo (idempotente) por comprador, replicando app/api/admin/send-invitation:
//   1. generateLink(invite) -> crea auth user si no existe + token
//   2. upsert profile (role student)
//   3. upsert enrollment en el cohort destino (status active)
//   4. envía email branded vía Resend
//   5. registra invitation_log (anti-duplicado)
//
// Origen de los compradores: proyecto Encuentro Smart (workshop_subscribers).
// Destino: proyecto classroom (.env de este repo).
//
// Modos:
//   node scripts/bulk-invite-workshop.mjs preview   -> NO escribe nada, envía 1 correo de muestra a PREVIEW_TO
//   node scripts/bulk-invite-workshop.mjs send       -> ejecuta sobre los 263 reales
//
// NUNCA toca los emails de EXCLUDE ni reenvía a quien ya está en invitation_log.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const ES_REPO = join(REPO, "..", "encuentrosmart");

// ---------------------------------------------------------------- config
const COHORT_ID = "b0000000-0000-0000-0000-000000000001";
const PROGRAM_NAME = "Workshop Inmobiliario";
const COHORT_NAME = "Workshop Inmobiliario — Mayo 2026";
const BASE_URL = "https://capitalacademy.cl";
const SENT_BY = "900823a1-e5e3-4721-b6aa-70ba791928b4"; // admin edaza
const PREVIEW_TO = "edaza@capitalinteligente.cl";
const EXCLUDE = new Set([
  "academia@capitalinteligente.cl",
  "edaza@capitalinteligente.cl",
]);
const SEND_DELAY_MS = 280; // ~3.5/seg, holgado para Resend

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
const es = loadEnv(join(ES_REPO, ".env.local"));

const CLASSROOM_URL = ca.NEXT_PUBLIC_SUPABASE_URL;
const CLASSROOM_KEY = ca.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = ca.RESEND_API_KEY;
const FROM_EMAIL = ca.RESEND_FROM_EMAIL;
const BUYERS_URL = es.NEXT_PUBLIC_SUPABASE_URL;
const BUYERS_KEY = es.SUPABASE_SERVICE_ROLE_KEY;

for (const [k, v] of Object.entries({ CLASSROOM_URL, CLASSROOM_KEY, RESEND_KEY, FROM_EMAIL, BUYERS_URL, BUYERS_KEY })) {
  if (!v) throw new Error(`Falta env: ${k}`);
}

const classroom = createClient(CLASSROOM_URL, CLASSROOM_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const buyers = createClient(BUYERS_URL, BUYERS_KEY, {
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
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">Gracias por ser parte de las <strong>${esc(label)}</strong>. Hoy damos el siguiente paso: tu acceso a <strong style="color:#5e17eb;">Capital Academy</strong>, la plataforma donde las masterclasses viven <strong>online</strong> para que las veas cuando quieras, las veces que quieras y desde donde est&eacute;s.</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px 32px;">
        <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;color:#5e17eb;text-transform:uppercase;font-weight:800;">Qu&eacute; encontrar&aacute;s adentro</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;color:#3a3d5c;">
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;width:26px;">&#127909;</td><td style="padding:5px 0;"><strong>Todas las masterclasses grabadas</strong>, on-demand y en alta calidad.</td></tr>
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
          <tr><td style="padding:4px 12px 4px 0;color:#5e17eb;font-weight:800;vertical-align:top;">3.</td><td style="padding:4px 0;"><strong>Entra y ve tu primera masterclass online</strong></td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;"><p style="margin:0;font-size:12px;color:#9b9db5;text-align:center;">Capital Academy &middot; <a href="https://capitalacademy.cl" style="color:#5e17eb;text-decoration:none;">capitalacademy.cl</a></p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
function invitationText({ fullName, inviteUrl }) {
  const firstName = fullName.split(" ")[0];
  return [
    `¡Bienvenido a Capital Academy, ${firstName}!`, "",
    `Gracias por ser parte de las ${courseLabel(PROGRAM_NAME, COHORT_NAME)}. Hoy damos el siguiente paso: tu acceso a Capital Academy, la plataforma donde las masterclasses viven online para que las veas cuando quieras, las veces que quieras.`, "",
    "Qué encontrarás adentro:",
    "  • Todas las masterclasses grabadas, on-demand y en alta calidad.",
    "  • Material y recursos complementarios de cada sesión.",
    "  • Pon a prueba lo aprendido y obtén tu certificado.", "",
    `Activa tu acceso y entra: ${inviteUrl}`, "",
    "El enlace expira en 72 horas. Al activarlo, creas tu contraseña y entras a la plataforma.", "",
    "Cómo empezar:",
    "  1. Activa tu cuenta — crea tu contraseña (1 min)",
    "  2. Completa tu perfil — RUT, teléfono (2 min)",
    "  3. Entra y ve tu primera masterclass online", "",
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
      subject: `${firstName}, tu acceso a Capital Academy ya está disponible 🎓`,
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

// ---------------------------------------------------------------- main
const MODE = process.argv[2];
if (!["preview", "send"].includes(MODE)) {
  console.error("Uso: node scripts/bulk-invite-workshop.mjs <preview|send>");
  process.exit(1);
}

if (MODE === "preview") {
  const inviteUrl = `${BASE_URL}/auth/confirm?token_hash=PREVIEW&type=invite&next=%2Fonboarding%2Fset-password`;
  await sendResend(PREVIEW_TO, "Elkis (PREVIEW)", inviteUrl);
  console.log(`✓ Preview branded enviado a ${PREVIEW_TO} — revisa que el LOGO se vea bien sobre el header azul.`);
  console.log("  (No se creó ninguna cuenta ni se tocó la base.)");
  process.exit(0);
}

// MODE === "send"
console.log("→ Cargando compradores pagados…");
const { data: paid, error: pErr } = await buyers
  .from("workshop_subscribers")
  .select("email,firstname,lastname,phone")
  .eq("workshop_payment_status", "succeeded");
if (pErr) throw pErr;

const { data: invLog } = await classroom.from("invitation_log").select("email");
const alreadyInvited = new Set((invLog ?? []).map((r) => (r.email || "").toLowerCase()));

// dedupe por email + excluir internos + ya invitados
const seen = new Set();
const targets = [];
for (const b of paid) {
  const email = (b.email || "").trim().toLowerCase();
  if (!email || seen.has(email)) continue;
  seen.add(email);
  if (EXCLUDE.has(email)) continue;
  if (alreadyInvited.has(email)) continue;
  const fullName = `${(b.firstname || "").trim()} ${(b.lastname || "").trim()}`.trim() || email;
  targets.push({ email, fullName, phone: (b.phone || "").trim() || null });
}

console.log(`→ Pagados: ${paid.length} | objetivo a invitar: ${targets.length} (excluidos internos + ya invitados)`);

const ok = [];
const fail = [];
let i = 0;
for (const t of targets) {
  i++;
  try {
    const { inviteUrl, userId } = await makeInviteUrl(t.email);
    if (!userId) throw new Error("sin userId tras generateLink");

    const { error: profErr } = await classroom.from("profiles").upsert(
      { id: userId, email: t.email, full_name: t.fullName, role: "student", phone: t.phone },
      { onConflict: "id" },
    );
    if (profErr) throw new Error(`profile: ${profErr.message}`);

    const { error: enrErr } = await classroom.from("enrollments").upsert(
      { cohort_id: COHORT_ID, student_id: userId, status: "active" },
      { onConflict: "cohort_id,student_id" },
    );
    if (enrErr) throw new Error(`enrollment: ${enrErr.message}`);

    await sendResend(t.email, t.fullName, inviteUrl);

    await classroom.from("invitation_log").insert({
      user_id: userId, email: t.email, sent_at: new Date().toISOString(),
      sent_by: SENT_BY, channel: "email", status: "sent",
    });

    ok.push(t.email);
    if (i % 25 === 0 || i === targets.length) console.log(`  …${i}/${targets.length} (ok ${ok.length}, fail ${fail.length})`);
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
