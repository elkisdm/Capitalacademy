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
//   y cuyo envío no terminó (open_notify_completed_at IS NULL — incluye tanto
//   los nunca reservados como una reserva vieja sin terminar por un crash a
//   mitad de camino, ver 0063). El envío inmediato al crear (si la ventana ya
//   está abierta) lo cubre la API de creación; este cron toma el resto cada
//   30 min. El reclamo atómico y el filtro de "reserva vieja" viven en
//   notifyDeliverableOpen: aquí solo se arma la lista de candidatos.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: pending, error } = await admin
    .from("deliverables")
    .select("id")
    .is("open_notify_completed_at", null)
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
