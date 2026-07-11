import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDeliverableOpen } from "@/lib/deliverables/notify";
import { authorizeCron } from "@/lib/api/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;
// Evita que Next intente cachear/estatizar la ruta del cron.
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET/POST  /api/cron/deliverable-openings
//   Cubre aperturas futuras: notifica los entregables cuya ventana ya abrió
//   y que aún no fueron notificados (open_notified_at IS NULL). El envío
//   inmediato al crear (si la ventana ya está abierta) lo cubre la API de
//   creación; este cron toma el resto cada 30 min.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
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
