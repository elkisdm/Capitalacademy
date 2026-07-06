"use server";

import { headers } from "next/headers";
import { getAuthUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter } from "@/lib/rate-limit";
import { evaluateCheckin, type CheckinDeps } from "@/lib/asistencia/checkin";

export type { CheckinStatus, CheckinResult } from "@/lib/asistencia/checkin";

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

/**
 * Construye los `deps` de la lógica de check-in contra Supabase (service_role).
 * NO se exporta: en Next 16 un archivo `"use server"` solo puede exportar
 * funciones async. El script E2E reproduce estas queries inline, no las importa.
 */
function buildCheckinDeps(
  admin: ReturnType<typeof createAdminClient>,
): CheckinDeps {
  return {
    async loadSession(sessionId) {
      const { data } = await admin
        .from("class_sessions")
        .select("id, cohort_id, starts_at, ends_at, title")
        .eq("id", sessionId)
        .single();
      return data ?? null;
    },
    async isEnrolledActive(userId, cohortId) {
      const { data } = await admin
        .from("enrollments")
        .select("id")
        .eq("student_id", userId)
        .eq("cohort_id", cohortId)
        .eq("status", "active")
        .maybeSingle();
      return Boolean(data);
    },
    async recordAttendance({ sessionId, userId, cohortId }) {
      const { data, error } = await admin
        .from("session_attendance")
        .upsert(
          {
            session_id: sessionId,
            student_id: userId,
            cohort_id: cohortId,
            method: "qr",
            marked_by: null,
          },
          { onConflict: "session_id,student_id", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw error;
      return Boolean(data && data.length > 0);
    },
  };
}

export async function registrarAsistencia(sessionId: string) {
  const {
    data: { user },
  } = await getAuthUser();

  if (!user) {
    return {
      status: "error" as const,
      message: "Debes iniciar sesión para registrar tu asistencia.",
    };
  }

  const rl = limiter.check(`asistencia:${user.id}:${await clientIp()}`);
  if (!rl.ok) {
    return {
      status: "error" as const,
      message: "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
    };
  }

  const admin = createAdminClient();
  try {
    return await evaluateCheckin(buildCheckinDeps(admin), {
      sessionId,
      userId: user.id,
    });
  } catch {
    return {
      status: "error" as const,
      message: "No pudimos registrar tu asistencia. Intenta de nuevo.",
    };
  }
}
