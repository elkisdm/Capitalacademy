// Netlify Scheduled Function — dispara la reconciliación y la limpieza de las
// grabaciones nativas de las clases en vivo (ADR-0034).
//
// El deploy de Capital Academy es NETLIFY (no Vercel): los crons de vercel.json
// NO se ejecutan aquí. Esta función agenda el trabajo y lo delega al route
// handler de Next (app/api/cron/grabaciones/route.ts), que es la única fuente de
// la lógica y valida el CRON_SECRET. Copia exacta del patrón de
// netlify/functions/recording-notifications-cron.mjs.
//
// Env requeridas (Netlify → Site settings → Environment variables):
//   - CRON_SECRET : el mismo secreto que valida el route handler.
//   - URL         : la provee Netlify automáticamente (URL principal del sitio).

export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error("[grabaciones-cron] falta URL o CRON_SECRET en el entorno; no se dispara.");
    return;
  }

  try {
    const res = await fetch(`${base}/api/cron/grabaciones`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.text();
    console.log(`[grabaciones-cron] ${res.status} ${body.slice(0, 500)}`);
  } catch (err) {
    console.error(
      `[grabaciones-cron] error al invocar el route: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

// Cada 15 minutos: una grabación colgada cuesta dinero por minuto y un archivo
// sin ingestar retrasa la repetición de una clase que ya ocurrió.
export const config = { schedule: "*/15 * * * *" };
