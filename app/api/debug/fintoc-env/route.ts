import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Endpoint temporal de diagnóstico. Devuelve solo prefijos de las
// variables de entorno relacionadas con Fintoc para verificar que
// estén cargadas correctamente en Vercel. NO devuelve los secretos
// completos. Eliminar este archivo apenas terminemos el debug.
export async function GET() {
  const sk = process.env.FINTOC_SECRET_KEY;
  const pk = process.env.NEXT_PUBLIC_FINTOC_PUBLIC_KEY;
  const wh = process.env.FINTOC_WEBHOOK_SECRET;
  const tn = process.env.TEAM_NOTIFICATION_EMAIL;
  const url = process.env.NEXT_PUBLIC_APP_URL;

  const safe = (v: string | undefined): string => {
    if (!v) return "MISSING";
    if (v.length < 10) return "TOO_SHORT";
    return `${v.slice(0, 10)}…${v.slice(-4)} (len=${v.length})`;
  };

  return NextResponse.json({
    FINTOC_SECRET_KEY: safe(sk),
    NEXT_PUBLIC_FINTOC_PUBLIC_KEY: safe(pk),
    FINTOC_WEBHOOK_SECRET: safe(wh),
    TEAM_NOTIFICATION_EMAIL: tn ?? "MISSING",
    NEXT_PUBLIC_APP_URL: url ?? "MISSING",
    NODE_ENV: process.env.NODE_ENV,
  });
}
