import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";
import { createRateLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const limiter = createRateLimiter({ limit: 3, windowSeconds: 300 });

function getBaseUrl(req: Request): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function POST(req: Request) {
  const rl = limiter.check(getClientIp(req));
  if (!rl.ok) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { email } = body as { email?: string };

  if (!email || typeof email !== "string") {
    return NextResponse.json(
      { error: "Email es requerido" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();
  const baseUrl = getBaseUrl(req);

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${baseUrl}/onboarding/set-password`,
      },
    });

  if (linkError) {
    return NextResponse.json({ ok: true });
  }

  const hashedToken = linkData.properties.hashed_token;
  const resetUrl = `${baseUrl}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=recovery&next=${encodeURIComponent("/onboarding/set-password")}`;

  try {
    const resend = getResendClient();
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Restablecer contraseña · Capital Academy",
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #14163a; font-size: 22px; font-weight: 900; margin: 0;">Capital Academy</h1>
            <p style="color: #6b6e8a; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.2em; margin: 4px 0 0;">Restablecer contraseña</p>
          </div>
          <p style="color: #14163a; font-size: 15px; line-height: 1.6; margin: 0 0 8px;">
            Recibimos una solicitud para restablecer tu contraseña.
          </p>
          <p style="color: #6b6e8a; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
            Haz clic en el botón para crear una nueva contraseña. Este enlace expira en 1 hora.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" style="display: inline-block; background: #5e17eb; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 12px;">
              Restablecer contraseña
            </a>
          </div>
          <p style="color: #9b9db5; font-size: 12px; line-height: 1.5; margin: 24px 0 0;">
            Si no solicitaste este cambio, ignora este email. Tu contraseña no será modificada.
          </p>
          <hr style="border: none; border-top: 1px solid #f0f0f3; margin: 32px 0 16px;" />
          <p style="color: #9b9db5; font-size: 11px; text-align: center; margin: 0;">
            Capital Academy · Capital Inteligente
          </p>
        </div>
      `,
      text: `Restablecer contraseña - Capital Academy\n\nHaz clic en el siguiente enlace para crear una nueva contraseña:\n${resetUrl}\n\nSi no solicitaste este cambio, ignora este email.`,
    });
  } catch (err) {
    console.error("Password reset email error:", err);
  }

  return NextResponse.json({ ok: true });
}
