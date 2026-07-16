// Netlify Scheduled Function — dispara el cron de reconciliación de pagos Flow.
//
// El deploy de Capital Academy es NETLIFY (no Vercel): los crons de vercel.json
// NO se ejecutan aquí. Esta función agenda el trabajo y lo delega al route
// handler de Next (app/api/cron/flow-reconcile/route.ts), que es la única
// fuente de la lógica de reconciliación y valida el CRON_SECRET. Copia exacta
// del patrón de netlify/functions/deliverable-openings-cron.mjs.
//
// Env requeridas (Netlify → Site settings → Environment variables):
//   - CRON_SECRET : el mismo secreto que valida el route handler.
//   - URL         : la provee Netlify automáticamente (URL principal del sitio).

export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error(
      "[flow-reconcile-cron] falta URL o CRON_SECRET en el entorno; no se dispara.",
    );
    return;
  }

  try {
    const res = await fetch(`${base}/api/cron/flow-reconcile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.text();
    console.log(`[flow-reconcile-cron] ${res.status} ${body.slice(0, 500)}`);
  } catch (err) {
    console.error(
      `[flow-reconcile-cron] error al invocar el route: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

// Cada 15 min (más frecuente que los otros crons: es plata cobrada sin registrar).
export const config = { schedule: "*/15 * * * *" };
