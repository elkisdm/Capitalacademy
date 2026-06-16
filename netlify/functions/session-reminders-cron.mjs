// Netlify Scheduled Function — dispara el cron de recordatorios de clase.
//
// El deploy de Capital Academy es NETLIFY (no Vercel): los crons de vercel.json
// NO se ejecutan aquí. Esta función agenda el trabajo y lo delega al route
// handler de Next (app/api/cron/session-reminders/route.ts), que es la única
// fuente de la lógica de envío y valida el CRON_SECRET.
//
// Env requeridas (Netlify → Site settings → Environment variables):
//   - CRON_SECRET : el mismo secreto que valida el route handler.
//   - URL         : la provee Netlify automáticamente (URL principal del sitio).
//
// El intervalo (*/30) debe ser <= al WINDOW_SLACK_MS del route (35 min) para no
// perder envíos. Ver app/api/cron/session-reminders/route.ts.

export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error(
      "[session-reminders-cron] falta URL o CRON_SECRET en el entorno; no se dispara.",
    );
    return;
  }

  try {
    const res = await fetch(`${base}/api/cron/session-reminders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.text();
    console.log(`[session-reminders-cron] ${res.status} ${body.slice(0, 500)}`);
  } catch (err) {
    console.error(
      `[session-reminders-cron] error al invocar el route: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

export const config = { schedule: "*/30 * * * *" };
