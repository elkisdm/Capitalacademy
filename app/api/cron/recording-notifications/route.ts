import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  dispatchRecordingAvailableNotification,
  dispatchCapacitacionFollowup,
  RETRY_STALE_MS,
} from "@/lib/classroom/recording-notifications";
import { authorizeCron } from "@/lib/api/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;
// Evita que Next intente cachear/estatizar la ruta del cron.
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET/POST  /api/cron/recording-notifications
//   Reconciliación del patrón "reserva-antes-de-enviar" del webhook de Mux
//   (ver lib/classroom/recording-notifications.ts, 0064): reintenta las
//   notificaciones "grabación disponible" (genérica y CAP-CI) cuya reserva
//   quedó marcada pero nunca se completó (recording_notify_completed_at /
//   completed_at IS NULL) hace más de RETRY_STALE_MS — señal de que el
//   webhook crasheó o expiró a mitad del loop de envío. El reclamo atómico
//   vive en las funciones dispatch*; aquí solo se arma la lista de candidatos.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const staleCutoffIso = new Date(Date.now() - RETRY_STALE_MS).toISOString();

  const { data: staleLessons } = await admin
    .from("lessons")
    .select("id")
    .not("recording_notified_at", "is", null)
    .is("recording_notify_completed_at", null)
    .lt("recording_notified_at", staleCutoffIso);

  for (const l of staleLessons ?? []) {
    await dispatchRecordingAvailableNotification(admin, l.id);
  }

  const { data: staleLogs } = await admin
    .from("capacitacion_followup_log")
    .select("session_id, class_sessions(lesson_id)")
    .is("completed_at", null)
    .lt("sent_at", staleCutoffIso);

  for (const row of (staleLogs ?? []) as Array<{
    session_id: string;
    class_sessions: { lesson_id: string | null } | null;
  }>) {
    const lessonId = row.class_sessions?.lesson_id;
    if (lessonId) await dispatchCapacitacionFollowup(admin, lessonId);
  }

  return NextResponse.json({
    ok: true,
    generic: (staleLessons ?? []).length,
    capci: (staleLogs ?? []).length,
  });
}

// Algunos schedulers invocan por GET; otros prefieren POST.
export const POST = GET;
