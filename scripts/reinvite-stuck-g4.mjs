// Reenvío dirigido de acceso a los alumnos del Diplomado G4 que quedaron SIN
// contraseña (link de invitación caducado / nunca completaron set-password).
//
// Por alumno: generateLink(invite) -> si ya existe cae a recovery -> arma el
// link /auth/confirm -> envía email branded vía Resend -> registra invitation_log.
// Prefiere "invite" (72h de validez) sobre "recovery" (1h) cuando el user lo permite.
//
//   node scripts/reinvite-stuck-g4.mjs preview   -> genera links, NO envía
//   node scripts/reinvite-stuck-g4.mjs send      -> envía de verdad
//
// Imprime cada link (útil para reenviar por WhatsApp a quien el email no llega, ej. AOL).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const env = {};
for (const line of readFileSync(join(REPO, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const BASE = "https://capitalacademy.cl";
const SENT_BY = "900823a1-e5e3-4721-b6aa-70ba791928b4"; // admin edaza
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const resend = new Resend(env.RESEND_API_KEY);
const FROM = env.RESEND_FROM_EMAIL;

const EMAILS = [
  "nicolealzerreca18@gmail.com",
  "pmaldonado@capitalinteligente.cl",
  "alejandro.nunezbrito@gmail.com",
  "alvarovicu@aol.com",
  "trubilar01@gmail.com",
  "cfigueroa@capitalinteligente.cl",
  "acolmenares@capitalinteligente.cl",
];

function emailHtml(url) {
  return `
  <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #14163a; font-size: 22px; font-weight: 900; margin: 0;">Capital Academy</h1>
      <p style="color: #6b6e8a; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.2em; margin: 4px 0 0;">Diplomado · IV Generación</p>
    </div>
    <p style="color: #14163a; font-size: 15px; line-height: 1.6; margin: 0 0 8px;">Tu acceso a la plataforma está listo.</p>
    <p style="color: #6b6e8a; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">Haz clic en el botón para crear tu contraseña y entrar al classroom del Diplomado.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${url}" style="display: inline-block; background: #5e17eb; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 12px;">Activar mi acceso y entrar</a>
    </div>
    <p style="color: #9b9db5; font-size: 12px; line-height: 1.5; margin: 24px 0 0;">Si el botón no funciona, copia este enlace en tu navegador:<br>${url}</p>
    <hr style="border: none; border-top: 1px solid #f0f0f3; margin: 32px 0 16px;" />
    <p style="color: #9b9db5; font-size: 11px; text-align: center; margin: 0;">Capital Academy · Capital Inteligente</p>
  </div>`;
}

const SEND = process.argv.slice(2).includes("send");

for (const email of EMAILS) {
  try {
    let { data, error } = await sb.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${BASE}/onboarding/set-password` },
    });
    if (error && /registered|already/i.test(error.message)) {
      ({ data, error } = await sb.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${BASE}/onboarding/set-password` },
      }));
    }
    if (error) throw error;

    const hashed = data.properties.hashed_token;
    const type = data.properties.verification_type ?? "invite";
    const url = `${BASE}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=${type}&next=${encodeURIComponent("/onboarding/set-password")}`;

    if (!SEND) {
      console.log(`[preview] ${email}  type=${type}\n          ${url}`);
      continue;
    }

    const { error: se } = await resend.emails.send({
      from: FROM,
      to: email,
      subject: "Activa tu acceso · Diplomado Capital Academy",
      html: emailHtml(url),
      text: `Activa tu acceso al Diplomado Capital Academy:\n${url}`,
    });
    if (se) throw new Error("resend: " + JSON.stringify(se));

    const userId = data.user?.id ?? data.properties?.user_id;
    if (userId) {
      await sb
        .from("invitation_log")
        .insert({ user_id: userId, sent_by: SENT_BY, email, sent_at: new Date().toISOString() })
        .then(({ error: le }) => { if (le) console.log(`          (log fail: ${le.message})`); });
    }
    console.log(`[sent] ${email}  type=${type}\n        ${url}`);
    await new Promise((r) => setTimeout(r, 320));
  } catch (e) {
    console.log(`[ERROR] ${email}: ${e.message}`);
  }
}
