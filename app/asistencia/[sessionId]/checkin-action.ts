"use server";

import { headers } from "next/headers";
import { getAuthUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter } from "@/lib/rate-limit";
import { isWithinWindow, OUTSIDE_WINDOW_LABEL } from "@/lib/asistencia/window";

export type CheckinStatus =
  | "ok"
  | "already"
  | "not_enrolled"
  | "outside_window"
  | "error";

export type CheckinResult = {
  status: CheckinStatus;
  message: string;
};

// 10 intentos por usuario cada 5 minutos (idempotente igual, esto frena abuso).
const limiter = createRateLimiter({ limit: 10, windowSeconds: 300 });

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

export async function registrarAsistencia(
  sessionId: string,
): Promise<CheckinResult> {
  const {
    data: { user },
  } = await getAuthUser();

  if (!user) {
    return { status: "error", message: "Debes iniciar sesión para registrar tu asistencia." };
  }

  const rl = limiter.check(`asistencia:${user.id}:${await clientIp()}`);
  if (!rl.ok) {
    return {
      status: "error",
      message: "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
    };
  }

  const admin = createAdminClient();

  const { data: session, error: sessionError } = await admin
    .from("class_sessions")
    .select("id, cohort_id, starts_at, ends_at, title")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return { status: "error", message: "No encontramos esta clase." };
  }

  // Matrícula activa en la cohorte de la sesión.
  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", user.id)
    .eq("cohort_id", session.cohort_id)
    .eq("status", "active")
    .maybeSingle();

  if (!enrollment) {
    return {
      status: "not_enrolled",
      message: "No estás matriculado en esta clase.",
    };
  }

  // Ventana temporal (20 min antes / 30 min después).
  if (!isWithinWindow({ starts_at: session.starts_at, ends_at: session.ends_at })) {
    return { status: "outside_window", message: OUTSIDE_WINDOW_LABEL };
  }

  // Idempotente: si ya existe, on conflict do nothing → no filas devueltas.
  const { data: inserted, error: insertError } = await admin
    .from("session_attendance")
    .upsert(
      {
        session_id: session.id,
        student_id: user.id,
        cohort_id: session.cohort_id,
        method: "qr",
        marked_by: null,
      },
      { onConflict: "session_id,student_id", ignoreDuplicates: true },
    )
    .select("id");

  if (insertError) {
    return { status: "error", message: "No pudimos registrar tu asistencia. Intenta de nuevo." };
  }

  if (!inserted || inserted.length === 0) {
    return { status: "already", message: "Tu asistencia ya estaba registrada." };
  }

  return { status: "ok", message: "¡Listo! Tu asistencia quedó registrada." };
}
