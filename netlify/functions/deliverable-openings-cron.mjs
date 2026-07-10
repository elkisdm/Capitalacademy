// Netlify Scheduled Function — dispara el cron de aperturas de entregables.
//
// El deploy de Capital Academy es NETLIFY (no Vercel): los crons de vercel.json
// NO se ejecutan aquí. Esta función agenda el trabajo y lo delega al route
// handler de Next (app/api/cron/deliverable-openings/route.ts), que es la única
// fuente de la lógica de envío y valida el CRON_SECRET. Copia exacta del
// patrón de netlify/functions/session-reminders-cron.mjs.
//
// Env requeridas (Netlify → Site settings → Environment variables):
//   - CRON_SECRET : el mismo secreto que valida el route handler.
//   - URL         : la provee Netlify automáticamente (URL principal del sitio).

export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error(
      "[deliverable-openings-cron] falta URL o CRON_SECRET en el entorno; no se dispara.",
    );
    return;
  }

  try {
    const res = await fetch(`${base}/api/cron/deliverable-openings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.text();
    console.log(`[deliverable-openings-cron] ${res.status} ${body.slice(0, 500)}`);
  } catch (err) {
    console.error(
      `[deliverable-openings-cron] error al invocar el route: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

export const config = { schedule: "*/30 * * * *" };
