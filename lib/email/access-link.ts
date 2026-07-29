import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";

/**
 * Correo de ACCESO: el enlace único que sirve tanto para activar una cuenta que
 * nunca tuvo contraseña como para recuperar una olvidada. Son el mismo
 * mecanismo en Supabase (`generateLink recovery` → `verifyOtp` → `updateUser`),
 * así que se presentan como una sola cosa; ver
 * docs/specs/acceso-autoservicio-trazabilidad.md.
 *
 * Este módulo carga con el envío Y con la bitácora, para que la ruta se quede
 * solo con la orquestación. Nada de lo que hay acá lanza: un fallo de correo o
 * de registro no puede cambiar lo que ve quien pidió el enlace (la respuesta es
 * genérica a propósito, para no delatar qué correos tienen cuenta).
 */

export type AccessEmailStatus = "sent" | "failed" | "no_account";

type LogEntry = {
  email: string;
  userId?: string | null;
  status: AccessEmailStatus;
  error?: string | null;
  providerMessageId?: string | null;
};

/**
 * Registra el desenlace de una solicitud de enlace de acceso. Best-effort: si
 * la bitácora falla, el alumno igual recibe su correo.
 */
export async function logAccessEmail(entry: LogEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("access_email_log").insert({
      email: entry.email.trim().toLowerCase(),
      user_id: entry.userId ?? null,
      kind: "access_link",
      status: entry.status,
      error: entry.error ?? null,
      provider: "resend",
      provider_message_id: entry.providerMessageId ?? null,
    });
  } catch (err) {
    console.error("access_email_log insert failed:", err);
  }
}

/**
 * Avisa al equipo cuando un correo de acceso NO pudo salir. El alumno sigue
 * viendo el mensaje genérico, así que sin este aviso el fallo es invisible
 * hasta que la persona reclama por otro canal.
 */
export async function notifyAccessEmailFailure(
  email: string,
  reason: string,
): Promise<void> {
  const recipient = process.env.TEAM_NOTIFICATION_EMAIL;
  if (!recipient) return;

  try {
    const resend = getResendClient();
    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipient,
      subject: "⚠️ Falló un correo de acceso · Capital Academy",
      text: [
        "No se pudo enviar el enlace de acceso.",
        "",
        `Destinatario: ${email}`,
        `Motivo: ${reason}`,
        "",
        "La persona vio el mensaje genérico de siempre y no sabe que falló.",
        "Queda registrado en access_email_log con status 'failed'.",
      ].join("\n"),
    });
  } catch (err) {
    console.error("access failure notification error:", err);
  }
}

function accessLinkHtml(url: string): string {
  return `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #14163a; font-size: 22px; font-weight: 900; margin: 0;">Capital Academy</h1>
            <p style="color: #6b6e8a; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.2em; margin: 4px 0 0;">Tu enlace de acceso</p>
          </div>
          <p style="color: #14163a; font-size: 15px; line-height: 1.6; margin: 0 0 8px;">
            Acá tienes tu enlace para entrar a la plataforma.
          </p>
          <p style="color: #6b6e8a; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
            Sirve igual si es tu primera vez y aún no has creado una contraseña, o si la
            olvidaste. Al abrirlo eliges tu contraseña y entras. El enlace expira en 1 hora.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${url}" style="display: inline-block; background: #5e17eb; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 12px;">
              Entrar a Capital Academy
            </a>
          </div>
          <p style="color: #9b9db5; font-size: 12px; line-height: 1.5; margin: 24px 0 0;">
            Si no pediste este enlace, ignora este correo. Tu cuenta no cambia.
          </p>
          <hr style="border: none; border-top: 1px solid #f0f0f3; margin: 32px 0 16px;" />
          <p style="color: #9b9db5; font-size: 11px; text-align: center; margin: 0;">
            Capital Academy · Capital Inteligente
          </p>
        </div>
      `;
}

/**
 * Envía el enlace de acceso y deja el rastro en la bitácora. Devuelve el
 * desenlace para que quien llame decida (la ruta no cambia su respuesta, pero
 * los tests y el panel sí lo necesitan).
 */
export async function sendAccessLinkEmail({
  email,
  url,
  userId,
}: {
  email: string;
  url: string;
  userId?: string | null;
}): Promise<AccessEmailStatus> {
  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Tu enlace de acceso · Capital Academy",
      html: accessLinkHtml(url),
      text: `Tu enlace de acceso - Capital Academy\n\nAbre este enlace para elegir tu contraseña y entrar:\n${url}\n\nSirve igual si es tu primera vez o si la olvidaste. Expira en 1 hora.\n\nSi no lo pediste, ignora este correo.`,
    });

    /*
      El SDK de Resend no lanza cuando la API responde con error: lo devuelve en
      `error`. Sin este chequeo, un rechazo del proveedor se registraba como
      envío exitoso.
    */
    if (error) {
      const reason = error.message ?? "Resend devolvió un error sin mensaje";
      await logAccessEmail({ email, userId, status: "failed", error: reason });
      await notifyAccessEmailFailure(email, reason);
      return "failed";
    }

    await logAccessEmail({
      email,
      userId,
      status: "sent",
      providerMessageId: data?.id ?? null,
    });
    return "sent";
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("Access link email error:", reason);
    await logAccessEmail({ email, userId, status: "failed", error: reason });
    await notifyAccessEmailFailure(email, reason);
    return "failed";
  }
}
