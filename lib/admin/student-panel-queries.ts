/**
 * Panel admin de progreso por alumno (`/admin/alumnos`).
 *
 * Agrega, por cada alumno matriculado en el programa activo, tres métricas
 * server-side en consultas bulk (sin N+1): asistencia (sesiones cerradas de
 * la cohorte sin registro en `session_attendance`, misma definición de
 * inasistencia que el pase de alertas del cron: ventana cerrada = ahora >
 * ends_at + GRACE_AFTER_MIN), avance de lecciones completables (mismo
 * criterio que `getCohortProgressReport`: solo lecciones con
 * `mux_playback_id`) y evaluaciones activas del programa (aprobadas vía
 * `quiz_attempts.passed`).
 *
 * Todo con service_role (`createAdminClient`): el caller (la página) valida
 * sesión y el gating de rol lo hace `app/(admin)/layout.tsx` antes de montar
 * la página, mismo patrón que `lib/asistencia/queries.ts`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isSessionClosed, sessionAppliesToEnrollment } from "@/lib/asistencia/window";

export type MissedSession = { id: string; title: string | null; startsAt: string };
export type PendingLesson = { lessonTitle: string; moduleTitle: string };
export type PendingEvaluation = { title: string; scope: string };

export type StudentPanelRow = {
  studentId: string;
  enrollmentId: string;
  cohortId: string;
  cohortName: string;
  fullName: string;
  email: string;
  initials: string;
  attendance: {
    present: number;
    total: number;
    absences: number;
    pct: number;
    missed: MissedSession[];
  };
  progress: {
    completed: number;
    total: number;
    pct: number;
    pending: PendingLesson[];
  };
  evaluations: {
    approved: number;
    total: number;
    pending: PendingEvaluation[];
  };
  atRisk: boolean;
};

export type StudentPanelReport = {
  program: { id: string; name: string };
  cohorts: { id: string; name: string; code: string }[];
  students: StudentPanelRow[];
};

type EnrollmentRow = {
  id: string;
  student_id: string;
  cohort_id: string;
  segment: string | null;
  enrolled_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export async function getStudentPanelReport(
  programId: string,
  cohortId?: string,
): Promise<StudentPanelReport | null> {
  const admin = createAdminClient();
  const now = Date.now();
  const nowIso = new Date().toISOString();

  const { data: program, error: programError } = await admin
    .from("programs")
    .select("id, name")
    .eq("id", programId)
    .single();
  if (programError && programError.code !== "PGRST116") {
    console.error("[student-panel] programs falló", { programId, code: programError.code, message: programError.message });
    throw programError;
  }
  if (!program) return null;

  const { data: cohortsRaw, error: cohortsError } = await admin
    .from("cohorts")
    .select("id, name, code")
    .eq("program_id", programId)
    .order("created_at", { ascending: false });
  if (cohortsError) {
    console.error("[student-panel] cohorts falló", { programId, code: cohortsError.code, message: cohortsError.message });
    throw cohortsError;
  }
  const cohorts = cohortsRaw ?? [];

  const scopeCohortIds =
    cohortId && cohorts.some((c) => c.id === cohortId)
      ? [cohortId]
      : cohorts.map((c) => c.id);

  const { data: enrollmentsRaw, error: enrollmentsError } =
    scopeCohortIds.length > 0
      ? await admin
          .from("enrollments")
          .select("id, student_id, cohort_id, segment, enrolled_at, profiles(full_name, email)")
          .in("cohort_id", scopeCohortIds)
          .eq("status", "active")
      : { data: [] as EnrollmentRow[], error: null };
  if (enrollmentsError) {
    console.error("[student-panel] enrollments falló", { programId, code: enrollmentsError.code, message: enrollmentsError.message });
    throw enrollmentsError;
  }
  const enrollments = (enrollmentsRaw ?? []) as unknown as EnrollmentRow[];

  const { data: sessionsRaw, error: sessionsError } =
    scopeCohortIds.length > 0
      ? await admin
          .from("class_sessions")
          .select("id, cohort_id, title, starts_at, ends_at, status, audience")
          .in("cohort_id", scopeCohortIds)
          .neq("status", "cancelled")
          .neq("modality", "recorded")
          .lt("ends_at", nowIso)
      : { data: [], error: null };
  if (sessionsError) {
    console.error("[student-panel] class_sessions falló", { programId, code: sessionsError.code, message: sessionsError.message });
    throw sessionsError;
  }
  const closedSessions = (sessionsRaw ?? []).filter((s) => isSessionClosed(s, now));

  const { data: attendanceRaw, error: attendanceError } =
    closedSessions.length > 0
      ? await admin
          .from("session_attendance")
          .select("session_id, student_id")
          .in(
            "session_id",
            closedSessions.map((s) => s.id),
          )
      : { data: [], error: null };
  if (attendanceError) {
    console.error("[student-panel] session_attendance falló", { programId, code: attendanceError.code, message: attendanceError.message });
    throw attendanceError;
  }
  const presentSet = new Set(
    (attendanceRaw ?? []).map((a) => `${a.student_id}:${a.session_id}`),
  );

  const { data: modules, error: modulesError } = await admin
    .from("program_modules")
    .select("id, title, position")
    .eq("program_id", programId)
    .order("position", { ascending: true });
  if (modulesError) {
    console.error("[student-panel] program_modules falló", { programId, code: modulesError.code, message: modulesError.message });
    throw modulesError;
  }
  const moduleTitleById = new Map((modules ?? []).map((m) => [m.id, m.title]));

  const { data: lessonsRaw, error: lessonsError } =
    (modules ?? []).length > 0
      ? await admin
          .from("lessons")
          .select("id, module_id, title, mux_playback_id")
          .in(
            "module_id",
            (modules ?? []).map((m) => m.id),
          )
      : { data: [], error: null };
  if (lessonsError) {
    console.error("[student-panel] lessons falló", { programId, code: lessonsError.code, message: lessonsError.message });
    throw lessonsError;
  }
  const completableLessons = (lessonsRaw ?? []).filter((l) => l.mux_playback_id);
  const totalLessons = completableLessons.length;

  const enrollmentIds = enrollments.map((e) => e.id);
  const { data: videoProgressRaw, error: videoProgressError } =
    enrollmentIds.length > 0
      ? await admin
          .from("video_progress")
          .select("enrollment_id, lesson_id, completed")
          .in("enrollment_id", enrollmentIds)
      : { data: [], error: null };
  if (videoProgressError) {
    console.error("[student-panel] video_progress falló", { programId, code: videoProgressError.code, message: videoProgressError.message });
    throw videoProgressError;
  }
  const progressByEnrollment = new Map<string, Map<string, boolean>>();
  for (const p of videoProgressRaw ?? []) {
    const map = progressByEnrollment.get(p.enrollment_id) ?? new Map();
    map.set(p.lesson_id, Boolean(p.completed));
    progressByEnrollment.set(p.enrollment_id, map);
  }

  // Decisión explícita (ver ADR-0016): este reporte NO aplica la ventana de
  // programación (opens_at/closes_at, migración 0070). Es un listado de
  // evaluaciones PUBLICADAS para el panel del profesor, no un gate de acceso —
  // si se filtrara por ventana, una evaluación ya cerrada desaparecería del
  // reporte junto con el registro de quién la rindió y aprobó.
  const { data: evalsRaw, error: evalsError } = await admin
    .from("evaluations")
    .select("id, title, scope")
    .eq("program_id", programId)
    .eq("is_active", true);
  if (evalsError) {
    console.error("[student-panel] evaluations falló", { programId, code: evalsError.code, message: evalsError.message });
    throw evalsError;
  }
  const evaluations = evalsRaw ?? [];

  const { data: attemptsRaw, error: attemptsError } =
    evaluations.length > 0 && enrollmentIds.length > 0
      ? await admin
          .from("quiz_attempts")
          .select("evaluation_id, enrollment_id")
          .in(
            "evaluation_id",
            evaluations.map((e) => e.id),
          )
          .in("enrollment_id", enrollmentIds)
          .eq("passed", true)
      : { data: [], error: null };
  if (attemptsError) {
    console.error("[student-panel] quiz_attempts falló", { programId, code: attemptsError.code, message: attemptsError.message });
    throw attemptsError;
  }
  const passedByEnrollment = new Map<string, Set<string>>();
  for (const a of attemptsRaw ?? []) {
    if (!a.evaluation_id) continue;
    const set = passedByEnrollment.get(a.enrollment_id) ?? new Set<string>();
    set.add(a.evaluation_id);
    passedByEnrollment.set(a.enrollment_id, set);
  }

  const sessionsByCohort = new Map<string, typeof closedSessions>();
  for (const s of closedSessions) {
    const list = sessionsByCohort.get(s.cohort_id) ?? [];
    list.push(s);
    sessionsByCohort.set(s.cohort_id, list);
  }
  const cohortNameById = new Map(cohorts.map((c) => [c.id, c.name]));

  const students: StudentPanelRow[] = enrollments.map((enr) => {
    const profile = enr.profiles;
    const fullName = profile?.full_name ?? profile?.email ?? "Alumno";
    const email = profile?.email ?? "";

    const applicableSessions = (sessionsByCohort.get(enr.cohort_id) ?? []).filter((s) =>
      sessionAppliesToEnrollment(s, enr),
    );
    const total = applicableSessions.length;
    const missed = applicableSessions.filter(
      (s) => !presentSet.has(`${enr.student_id}:${s.id}`),
    );
    const present = total - missed.length;
    const absences = missed.length;
    const attendancePct = total > 0 ? Math.round((present / total) * 100) : 0;

    const enrollmentProgress = progressByEnrollment.get(enr.id) ?? new Map();
    const completed = completableLessons.filter((l) => enrollmentProgress.get(l.id)).length;
    const pendingLessons = completableLessons
      .filter((l) => !enrollmentProgress.get(l.id))
      .map((l) => ({
        lessonTitle: l.title,
        moduleTitle: moduleTitleById.get(l.module_id) ?? "",
      }));
    const progressPct = totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0;

    const passedEvals = passedByEnrollment.get(enr.id) ?? new Set<string>();
    const approved = evaluations.filter((e) => passedEvals.has(e.id)).length;
    const pendingEvaluations = evaluations
      .filter((e) => !passedEvals.has(e.id))
      .map((e) => ({ title: e.title, scope: e.scope }));

    return {
      studentId: enr.student_id,
      enrollmentId: enr.id,
      cohortId: enr.cohort_id,
      cohortName: cohortNameById.get(enr.cohort_id) ?? "",
      fullName,
      email,
      initials: initialsOf(fullName),
      attendance: {
        present,
        total,
        absences,
        pct: attendancePct,
        missed: missed.map((s) => ({ id: s.id, title: s.title, startsAt: s.starts_at })),
      },
      progress: {
        completed,
        total: totalLessons,
        pct: progressPct,
        pending: pendingLessons,
      },
      evaluations: {
        approved,
        total: evaluations.length,
        pending: pendingEvaluations,
      },
      atRisk: absences >= 2,
    };
  });

  students.sort((a, b) => a.fullName.localeCompare(b.fullName));

  return {
    program,
    cohorts,
    students,
  };
}
