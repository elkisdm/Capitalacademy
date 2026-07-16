/**
 * Reportería y marcado manual de asistencia (lado admin/staff).
 *
 * Todo con service_role (`createAdminClient`): el llamador (API admin) valida
 * `requireStaff()` ANTES. La lectura por RLS también funcionaría (policy
 * is_cohort_staff / is_platform_staff), pero usamos admin para unir enrollments
 * + profiles + attendance sin pelear con las policies de cada tabla.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { GRACE_AFTER_MIN, sessionAppliesToEnrollment } from "./window";

export type AttendanceRow = {
  studentId: string;
  fullName: string | null;
  email: string | null;
  attended: boolean;
  method: "qr" | "manual" | null;
  markedAt: string | null;
};

export type SessionAttendanceReport = {
  sessionId: string;
  cohortId: string;
  title: string | null;
  present: number;
  total: number;
  rows: AttendanceRow[];
};

type EnrollmentRow = {
  student_id: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

/** Reporte de asistencia de una sesión: matriculados activos + su estado. */
export async function getSessionAttendance(
  sessionId: string,
): Promise<SessionAttendanceReport | null> {
  const admin = createAdminClient();

  const { data: session } = await admin
    .from("class_sessions")
    .select("id, cohort_id, title")
    .eq("id", sessionId)
    .single();
  if (!session) return null;

  const { data: enrollmentsRaw } = await admin
    .from("enrollments")
    .select("student_id, profiles(full_name, email)")
    .eq("cohort_id", session.cohort_id)
    .eq("status", "active");
  const enrollments = (enrollmentsRaw ?? []) as unknown as EnrollmentRow[];

  const { data: attendance } = await admin
    .from("session_attendance")
    .select("student_id, method, marked_at")
    .eq("session_id", sessionId);

  const byStudent = new Map(
    (attendance ?? []).map((a) => [
      a.student_id,
      { method: a.method as "qr" | "manual", markedAt: a.marked_at },
    ]),
  );

  const rows: AttendanceRow[] = enrollments
    .map((e) => {
      const att = byStudent.get(e.student_id);
      return {
        studentId: e.student_id,
        fullName: e.profiles?.full_name ?? null,
        email: e.profiles?.email ?? null,
        attended: Boolean(att),
        method: att?.method ?? null,
        markedAt: att?.markedAt ?? null,
      };
    })
    .sort((a, b) =>
      (a.fullName ?? a.email ?? "").localeCompare(b.fullName ?? b.email ?? ""),
    );

  return {
    sessionId: session.id,
    cohortId: session.cohort_id,
    title: session.title,
    present: rows.filter((r) => r.attended).length,
    total: rows.length,
    rows,
  };
}

export type ManualResult = { ok: boolean; error?: string };

/**
 * Marca manualmente la asistencia de un alumno a una sesión (method='manual').
 * Valida que el alumno esté matriculado activo en la cohorte de la sesión.
 * Idempotente: si ya tenía asistencia (qr o manual), no la duplica ni la pisa.
 */
export async function markManualAttendance(
  sessionId: string,
  studentId: string,
  staffId: string,
): Promise<ManualResult> {
  const admin = createAdminClient();

  const { data: session } = await admin
    .from("class_sessions")
    .select("id, cohort_id")
    .eq("id", sessionId)
    .single();
  if (!session) return { ok: false, error: "Sesión no encontrada." };

  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", studentId)
    .eq("cohort_id", session.cohort_id)
    .eq("status", "active")
    .maybeSingle();
  if (!enrollment) {
    return { ok: false, error: "El alumno no está matriculado en esta clase." };
  }

  const { error } = await admin.from("session_attendance").upsert(
    {
      session_id: sessionId,
      student_id: studentId,
      cohort_id: session.cohort_id,
      method: "manual",
      marked_by: staffId,
    },
    { onConflict: "session_id,student_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: "No se pudo marcar la asistencia." };
  return { ok: true };
}

export type BulkResult = { ok: boolean; error?: string; report?: SessionAttendanceReport };

/**
 * Marca o quita, en un solo round-trip, la asistencia de varios alumnos a una
 * sesión. Misma semántica que `markManualAttendance`/`unmarkAttendance` pero
 * en lote: si `attended=true` valida matrícula activa de todos los
 * `studentIds` con UNA sola consulta y hace upsert idempotente; si
 * `attended=false` borra las filas de esos alumnos. Devuelve el reporte
 * fresco de la sesión.
 */
export async function bulkSetAttendance(
  sessionId: string,
  studentIds: string[],
  attended: boolean,
  staffId: string,
): Promise<BulkResult> {
  const admin = createAdminClient();

  const { data: session } = await admin
    .from("class_sessions")
    .select("id, cohort_id")
    .eq("id", sessionId)
    .single();
  if (!session) return { ok: false, error: "Sesión no encontrada." };

  if (attended) {
    const { data: enrolled } = await admin
      .from("enrollments")
      .select("student_id")
      .eq("cohort_id", session.cohort_id)
      .eq("status", "active")
      .in("student_id", studentIds);
    const validIds = (enrolled ?? []).map((e) => e.student_id);
    if (validIds.length > 0) {
      const rows = validIds.map((studentId) => ({
        session_id: sessionId,
        student_id: studentId,
        cohort_id: session.cohort_id,
        method: "manual" as const,
        marked_by: staffId,
      }));
      const { error } = await admin
        .from("session_attendance")
        .upsert(rows, { onConflict: "session_id,student_id", ignoreDuplicates: true });
      if (error) return { ok: false, error: "No se pudo marcar la asistencia." };
    }
  } else {
    const { error } = await admin
      .from("session_attendance")
      .delete()
      .eq("session_id", sessionId)
      .in("student_id", studentIds);
    if (error) return { ok: false, error: "No se pudo quitar la asistencia." };
  }

  const report = await getSessionAttendance(sessionId);
  if (!report) return { ok: false, error: "Sesión no encontrada." };
  return { ok: true, report };
}

export type StudentAbsence = {
  studentId: string;
  cohortId: string;
  programId: string | null;
  cohortName: string | null;
  email: string;
  fullName: string | null;
  absences: number;
};

type CohortRow = { id: string; program_id: string; name: string };
type ClosedSessionRow = { id: string; cohort_id: string; audience: string; ends_at: string };
type EnrollmentSegmentRow = {
  student_id: string;
  cohort_id: string;
  segment: string | null;
  enrolled_at: string;
  profiles: { email: string | null; full_name: string | null } | null;
};

/**
 * Alumnos que acumulan `threshold` o más inasistencias a sesiones EN VIVO ya
 * cerradas (sin registro en `session_attendance`) en sus cohortes activas
 * de programas con `attendance_alerts_enabled = true`. Respeta audiencia: una
 * sesión `audience='capital_inteligente'` solo cuenta para alumnos con
 * `enrollments.segment='capital_inteligente'`.
 *
 * Todo con service_role: el llamador (cron) no tiene sesión de usuario.
 */
export async function getStudentsAtAbsenceThreshold(
  threshold: number,
): Promise<StudentAbsence[]> {
  const admin = createAdminClient();

  // Solo programas con la alerta activada (migración 0076). Default false: un
  // entorno nuevo NO hereda la alerta. ADR-0013 la definió para el Diplomado;
  // el resto se activa con un UPDATE, sin deploy. Sin esto, CAP-CI (239
  // matrículas, cupo real ~40 por sesión) recibiría la advertencia completa.
  const { data: programsRaw } = await admin
    .from("programs")
    .select("id")
    .eq("attendance_alerts_enabled", true);
  const enabledProgramIds = ((programsRaw ?? []) as Array<{ id: string }>).map(
    (p) => p.id,
  );
  if (enabledProgramIds.length === 0) return [];

  const { data: cohortsRaw } = await admin
    .from("cohorts")
    .select("id, program_id, name")
    .eq("status", "active")
    .in("program_id", enabledProgramIds);
  const cohorts = (cohortsRaw ?? []) as CohortRow[];
  if (cohorts.length === 0) return [];

  const cohortIds = cohorts.map((c) => c.id);
  const programByCohort = new Map(cohorts.map((c) => [c.id, c.program_id]));
  const nameByCohort = new Map(cohorts.map((c) => [c.id, c.name]));

  // Sesiones EN VIVO ya cerradas: su ventana de registro (ends_at + 30min)
  // quedó atrás. No se distingue por `status` porque nada transiciona
  // class_sessions.status a 'finished' automáticamente (solo se excluye
  // 'cancelled').
  const cutoff = new Date(Date.now() - GRACE_AFTER_MIN * 60_000).toISOString();
  const { data: sessionsRaw } = await admin
    .from("class_sessions")
    .select("id, cohort_id, audience, ends_at")
    .in("cohort_id", cohortIds)
    .neq("modality", "recorded")
    .neq("status", "cancelled")
    .lt("ends_at", cutoff);
  const sessions = (sessionsRaw ?? []) as ClosedSessionRow[];
  if (sessions.length === 0) return [];

  const sessionsByCohort = new Map<string, ClosedSessionRow[]>();
  for (const s of sessions) {
    const list = sessionsByCohort.get(s.cohort_id) ?? [];
    list.push(s);
    sessionsByCohort.set(s.cohort_id, list);
  }

  const { data: enrollmentsRaw } = await admin
    .from("enrollments")
    .select("student_id, cohort_id, segment, enrolled_at, profiles(email, full_name)")
    .in("cohort_id", cohortIds)
    .eq("status", "active");
  const enrollments = (enrollmentsRaw ?? []) as unknown as EnrollmentSegmentRow[];
  if (enrollments.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const { data: attendanceRaw } = await admin
    .from("session_attendance")
    .select("session_id, student_id")
    .in("session_id", sessionIds);
  const attended = new Set(
    ((attendanceRaw ?? []) as Array<{ session_id: string; student_id: string }>).map(
      (a) => `${a.session_id}:${a.student_id}`,
    ),
  );

  const result: StudentAbsence[] = [];
  for (const e of enrollments) {
    if (!e.profiles?.email) continue;
    const cohortSessions = sessionsByCohort.get(e.cohort_id) ?? [];
    let absences = 0;
    for (const s of cohortSessions) {
      if (!sessionAppliesToEnrollment(s, e)) continue;
      if (!attended.has(`${s.id}:${e.student_id}`)) absences++;
    }
    if (absences >= threshold) {
      result.push({
        studentId: e.student_id,
        cohortId: e.cohort_id,
        programId: programByCohort.get(e.cohort_id) ?? null,
        cohortName: nameByCohort.get(e.cohort_id) ?? null,
        email: e.profiles.email,
        fullName: e.profiles.full_name,
        absences,
      });
    }
  }
  return result;
}

/** Quita la asistencia de un alumno a una sesión (corrección administrativa). */
export async function unmarkAttendance(
  sessionId: string,
  studentId: string,
): Promise<ManualResult> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("session_attendance")
    .delete()
    .eq("session_id", sessionId)
    .eq("student_id", studentId);
  if (error) return { ok: false, error: "No se pudo quitar la asistencia." };
  return { ok: true };
}
