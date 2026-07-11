import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDeliverableOpen } from "@/lib/deliverables/notify";

export const runtime = "nodejs";
export const maxDuration = 60;
// Evita que Next intente cachear/estatizar la ruta del cron.
export const dynamic = "force-dynamic";

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sin secret configurado, denegar por defecto.
  const auth = req.headers.get("authorization");
  if (auth && auth === `Bearer ${secret}`) return true;
  // Soporte para schedulers que no permiten headers (query param).
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

// ---------------------------------------------------------------------------
// GET/POST  /api/cron/deliverable-openings
//   Cubre aperturas futuras: notifica los entregables cuya ventana ya abrió
//   y que aún no fueron notificados (open_notified_at IS NULL). El envío
//   inmediato al crear (si la ventana ya está abierta) lo cubre la API de
//   creación; este cron toma el resto cada 30 min.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: pending, error } = await admin
    .from("deliverables")
    .select("id")
    .is("open_notified_at", null)
    .lte("opens_at", new Date().toISOString());

  if (error) {
    console.error("deliverable-openings query error", error);
    return NextResponse.json({ error: "Error al consultar entregables" }, { status: 500 });
  }

  let sent = 0;
  for (const d of pending ?? []) {
    const result = await notifyDeliverableOpen(d.id);
    if (!result.skipped) sent += result.sent;
  }

  return NextResponse.json({ ok: true, processed: (pending ?? []).length, sent });
}

// Algunos schedulers invocan por GET; otros prefieren POST.
export const POST = GET;
