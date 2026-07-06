/**
 * Lógica de negocio PURA del registro de asistencia por QR.
 *
 * No depende de Next ni de Supabase: recibe sus datos vía `deps` (loaders +
 * writer inyectables) y un `now` opcional. Así la misma decisión que corre en
 * producción (la Server Action `registrarAsistencia` la envuelve) se puede
 * ejercitar en tests unitarios (deps fake) y en el script E2E (deps reales
 * contra la BD) sin escanear un QR ni un navegador.
 *
 * Responsabilidad: sesión existe → matrícula activa → ventana temporal →
 * registro idempotente. La autenticación y el rate-limit viven en la Server
 * Action (dependen de Next), no aquí.
 */

import { isWithinWindow, OUTSIDE_WINDOW_LABEL } from "./window";

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

export type CheckinSession = {
  id: string;
  cohort_id: string;
  starts_at: string;
  ends_at: string;
  title: string | null;
};

export interface CheckinDeps {
  /** Carga la sesión por id, o null si no existe. */
  loadSession(sessionId: string): Promise<CheckinSession | null>;
  /** ¿El usuario tiene matrícula ACTIVA en esa cohorte? */
  isEnrolledActive(userId: string, cohortId: string): Promise<boolean>;
  /**
   * Registra la asistencia de forma idempotente. Devuelve `true` si insertó una
   * fila nueva, `false` si ya existía (para distinguir "ok" de "already").
   */
  recordAttendance(input: {
    sessionId: string;
    userId: string;
    cohortId: string;
  }): Promise<boolean>;
}

export async function evaluateCheckin(
  deps: CheckinDeps,
  input: { sessionId: string; userId: string; now?: Date },
): Promise<CheckinResult> {
  const session = await deps.loadSession(input.sessionId);
  if (!session) {
    return { status: "error", message: "No encontramos esta clase." };
  }

  const enrolled = await deps.isEnrolledActive(input.userId, session.cohort_id);
  if (!enrolled) {
    return { status: "not_enrolled", message: "No estás matriculado en esta clase." };
  }

  if (
    !isWithinWindow(
      { starts_at: session.starts_at, ends_at: session.ends_at },
      input.now,
    )
  ) {
    return { status: "outside_window", message: OUTSIDE_WINDOW_LABEL };
  }

  const inserted = await deps.recordAttendance({
    sessionId: session.id,
    userId: input.userId,
    cohortId: session.cohort_id,
  });

  return inserted
    ? { status: "ok", message: "¡Listo! Tu asistencia quedó registrada." }
    : { status: "already", message: "Tu asistencia ya estaba registrada." };
}
