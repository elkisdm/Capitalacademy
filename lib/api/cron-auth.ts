import { timingSafeEqual } from "node:crypto";

/**
 * Autoriza un request de cron validando SOLO el header `Authorization: Bearer
 * <CRON_SECRET>` con comparación timing-safe. Los crons reales (Netlify
 * Functions, ver netlify/functions/*-cron.mjs) ya invocan con ese header, así
 * que no se soporta el camino por query param (`?secret=`) que antes permitía
 * fugar el secreto en logs de acceso / URLs cacheadas.
 */
export function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sin secret configurado, denegar por defecto.

  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length);

  const expected = Buffer.from(secret);
  const received = Buffer.from(token);
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}
