import type { EmailContent } from "@/lib/email/send-batch";

const TZ = "America/Santiago";

export type SessionChangeKind = "rescheduled" | "cancelled";

export interface SessionChangeInput {
  fullName: string;
  sessionTitle: string;
  kind: SessionChangeKind;
  /** Horario que el alumno tiene hoy en su calendario (y en su bandeja). */
  previousStartsAtIso: string;
  previousEndsAtIso: string;
  /** Horario nuevo. Ausente en una cancelación. */
  startsAtIso?: string | null;
  endsAtIso?: string | null;
  modality: string;
  teacherName: string | null;
  /** Nota opcional que escribe quien reprograma ("se corre por el feriado"). */
  motivo?: string | null;
}

/**
 * Aviso de que una clase cambió de horario o se canceló.
 *
 * Existe porque los recordatorios NO se reenvían: la bitácora es por
 * `(clase, ventana)` y una vez enviado el de 24 h nunca vuelve a salir. Si la
 * clase se mueve después de eso, el alumno se queda con la hora vieja en su
 * bandeja y nadie se lo corrige. Este correo es esa corrección.
 *
 * El horario ANTERIOR se muestra siempre y tachado: quien recibe esto ya tiene
 * otro correo con esa hora, y sin el contraste no sabe cuál de los dos manda.
 */
export function buildSessionChangeEmail(d: SessionChangeInput): EmailContent {
  return {
    subject: subjectFor(d),
    html: changeHtml(d),
    text: changeText(d),
  };
}

function subjectFor(d: SessionChangeInput): string {
  if (d.kind === "cancelled") return `Se canceló: ${d.sessionTitle}`;
  return `Cambio de horario: ${d.sessionTitle}`;
}

function modalityLabel(modality: string): string {
  switch (modality) {
    case "live_in_person":
      return "Presencial";
    case "live_online":
      return "Online (en vivo)";
    case "recorded":
      return "Grabada";
    default:
      return modality;
  }
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(iso));
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function rango(startIso: string, endIso: string): string {
  return `${fmtDate(startIso)}, ${fmtTime(startIso)} – ${fmtTime(endIso)} hrs`;
}

function changeHtml(d: SessionChangeInput): string {
  const firstName = (d.fullName || "").trim().split(" ")[0] || "";
  const cancelada = d.kind === "cancelled";
  const acento = cancelada ? "#e5484d" : "#5e17eb";
  const etiqueta = cancelada ? "Clase cancelada" : "Cambio de horario";

  const antes = rango(d.previousStartsAtIso, d.previousEndsAtIso);
  const ahora =
    !cancelada && d.startsAtIso && d.endsAtIso ? rango(d.startsAtIso, d.endsAtIso) : null;

  const filaNueva = ahora
    ? `                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#9b9db5;width:130px;vertical-align:top;">Nuevo horario</td>
                  <td style="padding:8px 0;font-size:15px;color:${acento};font-weight:800;text-transform:capitalize;">${esc(ahora)}</td>
                </tr>`
    : "";

  const filaDocente = d.teacherName
    ? `                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#9b9db5;vertical-align:top;">Docente</td>
                  <td style="padding:8px 0;font-size:14px;color:#14163a;font-weight:600;">${esc(d.teacherName)}</td>
                </tr>`
    : "";

  const filaMotivo = d.motivo
    ? `        <tr><td style="padding:0 32px 20px 32px;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#3a3d5c;background:#f9f9fb;border-left:3px solid ${acento};padding:12px 16px;border-radius:6px;">${esc(d.motivo)}</p>
        </td></tr>`
    : "";

  const bajada = cancelada
    ? "Esta clase <strong>no se realizará</strong>. Te avisamos porque ya estaba en tu calendario."
    : "Esta clase <strong>cambió de horario</strong>. Si tenías la anterior agendada, actualízala.";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14163a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);">

        <tr><td style="padding:0;background:#14163a;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr><td align="center" style="padding:32px 28px;">
              <img src="https://capitalacademy.cl/brand/logo-light.png" alt="Capital Academy" width="200" style="display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;outline:none;text-decoration:none;" />
              <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:${cancelada ? "#ff8b8e" : "#c5f122"};text-transform:uppercase;font-weight:700;">${esc(etiqueta)}</p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:32px 32px 8px 32px;">
          <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#14163a;font-weight:800;">Hola${firstName ? ", " + esc(firstName) : ""} 👋</h1>
          <p style="margin:0;font-size:15px;line-height:1.65;color:#3a3d5c;">${bajada}</p>
        </td></tr>

        <tr><td style="padding:16px 32px 8px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9f9fb;border:1px solid #ededf0;border-radius:12px;">
            <tr><td style="padding:20px 22px;">
              <p style="margin:0 0 14px 0;font-size:17px;line-height:1.35;color:${acento};font-weight:800;">${esc(d.sessionTitle)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#9b9db5;width:130px;vertical-align:top;">${cancelada ? "Estaba para" : "Horario anterior"}</td>
                  <td style="padding:8px 0;font-size:14px;color:#9b9db5;font-weight:600;text-decoration:line-through;text-transform:capitalize;">${esc(antes)}</td>
                </tr>
${filaNueva}
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#9b9db5;vertical-align:top;">Modalidad</td>
                  <td style="padding:8px 0;font-size:14px;color:#14163a;font-weight:600;">${esc(modalityLabel(d.modality))}</td>
                </tr>
${filaDocente}
              </table>
            </td></tr>
          </table>
        </td></tr>

${filaMotivo}

        <tr><td align="center" style="padding:8px 32px 28px 32px;">
          <a href="https://capitalacademy.cl/classroom" target="_blank" style="display:inline-block;padding:14px 40px;background:${acento};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">Ver mi calendario</a>
        </td></tr>

        <tr><td style="padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;">
          <p style="margin:0;font-size:12px;color:#9b9db5;text-align:center;">Capital Academy &middot; <a href="https://capitalacademy.cl/classroom" style="color:#5e17eb;text-decoration:none;">Ir a la plataforma</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

function changeText(d: SessionChangeInput): string {
  const firstName = (d.fullName || "").trim().split(" ")[0] || "";
  const cancelada = d.kind === "cancelled";
  const lines = [
    `Hola${firstName ? ", " + firstName : ""}.`,
    "",
    cancelada
      ? "Esta clase NO se realizará. Te avisamos porque ya estaba en tu calendario."
      : "Esta clase cambió de horario. Si tenías la anterior agendada, actualízala.",
    "",
    `Clase: ${d.sessionTitle}`,
    `${cancelada ? "Estaba para" : "Horario anterior"}: ${rango(d.previousStartsAtIso, d.previousEndsAtIso)}`,
  ];

  if (!cancelada && d.startsAtIso && d.endsAtIso) {
    lines.push(`NUEVO horario: ${rango(d.startsAtIso, d.endsAtIso)}`);
  }
  lines.push(`Modalidad: ${modalityLabel(d.modality)}`);
  if (d.teacherName) lines.push(`Docente: ${d.teacherName}`);
  if (d.motivo) lines.push("", d.motivo);

  lines.push("", "Ver mi calendario: https://capitalacademy.cl/classroom");
  lines.push("", "Capital Academy · capitalacademy.cl/classroom");
  return lines.join("\n");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
