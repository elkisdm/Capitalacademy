import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Endpoint temporal de diagnóstico. Devuelve prefijos y, en POST,
// intenta crear una sesión real con Fintoc para ver el error exacto
// que devuelve (mejor que el genérico "Revisa configuración"). NO
// expone secretos. Eliminar este archivo apenas terminemos el debug.
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

export async function POST() {
  const sk = process.env.FINTOC_SECRET_KEY;
  if (!sk) {
    return NextResponse.json({ error: "FINTOC_SECRET_KEY missing" }, { status: 500 });
  }

  const payload = {
    amount: 250000,
    currency: "CLP",
    success_url: "https://capitalacademy.cl/pago/gracias?id=debug",
    cancel_url: "https://capitalacademy.cl/pago",
    customer: {
      name: "Debug Probe",
      email: "debug@example.com",
      metadata: { phone: "+56900000000", rut: "111111111" },
    },
    metadata: { flow: "debug-probe" },
  };

  const attempts: Array<Record<string, unknown>> = [];
  const baseUrls = ["https://api.fintoc.com/v2", "https://api.fintoc.com/v1"];
  const authHeaders = [sk, `Bearer ${sk}`];

  for (const base of baseUrls) {
    for (const auth of authHeaders) {
      const res = await fetch(`${base}/checkout_sessions`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      attempts.push({
        base,
        authMode: auth.startsWith("Bearer") ? "Bearer" : "raw",
        status: res.status,
        body: text.slice(0, 500),
      });
      if (res.ok) break;
    }
  }

  return NextResponse.json({ attempts });
}
