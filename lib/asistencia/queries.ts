/**
 * Reportería y marcado manual de asistencia (lado admin/staff).
 *
 * Todo con service_role (`createAdminClient`): el llamador (API admin) valida
 * `requireStaff()` ANTES. La lectura por RLS también funcionaría (policy
 * is_cohort_staff / is_platform_staff), pero usamos admin para unir enrollments
 * + profiles + attendance sin pelear con las policies de cada tabla.
 */

import { createAdminClient } from "@/lib/supabase/admin";

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
