// Netlify Scheduled Function — recordatorio diario del seguimiento de leads.
//
// El deploy de Capital Academy es NETLIFY: los crons de vercel.json NO se
// ejecutan aquí. Esta función agenda el trabajo y lo delega al route handler de
// Next (app/api/cron/lead-tasks/route.ts), que valida el CRON_SECRET y es la
// única fuente de la lógica de envío.
//
// Env requeridas (Netlify → Site settings → Environment variables):
//   - CRON_SECRET : el mismo secreto que valida el route handler.
//   - URL         : la provee Netlify automáticamente (URL principal del sitio).
//
// Horario: 12:00 UTC = 08:00 en Chile durante el invierno (UTC-4) y 09:00 en
// verano (UTC-3). Netlify solo acepta cron en UTC y el desfase de una hora en
// verano no cambia nada: el correo sigue llegando a primera hora del día
// laboral. Fijarlo en UTC evita el error clásico de un cron que se corre solo
// dos veces al año.
export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error("[lead-tasks-cron] falta URL o CRON_SECRET en el entorno; no se dispara.");
    return;
  }

  try {
    const res = await fetch(`${base}/api/cron/lead-tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.text();
    console.log(`[lead-tasks-cron] ${res.status} ${body.slice(0, 500)}`);
  } catch (err) {
    console.error(
      `[lead-tasks-cron] error al invocar el route: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

export const config = { schedule: "0 12 * * *" };
