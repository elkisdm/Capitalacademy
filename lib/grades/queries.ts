import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnrollmentForUser } from "@/lib/classroom/queries";
import { isSessionClosed, sessionAppliesToEnrollment } from "@/lib/asistencia/window";
import { computeGroupAverage } from "@/lib/grades/scale";

export type StudentGradeRow = {
  evaluationId: string;
  title: string;
  scope: "final" | "module" | "lesson" | "session";
  weightPct: number | null;
  grade: number;
  feedback: string | null;
  gradedAt: string | null;
};

export type StudentGradeGroup = {
  key: string;
  title: string;
  rows: StudentGradeRow[];
  /** Promedio sobre evaluaciones YA CALIFICADAS. Ponderado si alguna tiene
   *  `weight_pct` (ADR-0024, supersede A7 de ADR-0018). */
  average: number | null;
  averageKind: "weighted" | "simple" | null;
  averageExcluded: number;
};

export type AttendanceLane = {
  /** % de asistencia calculado (sesiones cerradas de la cohorte), o null sin sesiones cerradas aún. */
  pct: number | null;
  /** Si `pct` cumple `programs.min_attendance_pct`. Null si no hay `pct`. NUNCA se expone el umbral numérico (ver corrección A1). */
  meetsRequirement: boolean | null;
};

export type StudentGradesResult = {
  groups: StudentGradeGroup[];
  attendance: AttendanceLane;
};

/**
 * Notas 1-7 consolidadas de un alumno en una cohorte, agrupadas por módulo.
 * Cliente RLS (no admin) para el gate de fila de `evaluation_grades`: el
 * alumno solo puede ver sus propias notas PUBLICADAS
 * (`evaluation_grades_student_select`), consistente con el resto del
 * classroom.
 *
 * La metadata de `evaluations` (título, scope, peso) se lee aparte con
 * cliente admin, acotada a los `evaluation_id` ya validados por la query RLS
 * de arriba (corrección M5 de la revisión): `evaluations_student_select`
 * exige `is_active`, así que el embed RLS original hacía desaparecer notas ya
 * PUBLICADAS del registro del alumno en cuanto la profe desactivaba el quiz
 * al cerrar el trimestre. Una nota publicada es un registro académico —
 * desactivar la evaluación no debe borrarla de la vista del alumno. El
 * acotado por `evaluation_id` (no una lectura libre) evita que esto abra
 * acceso a evaluaciones fuera de las que el alumno ya tiene nota.
 */
export async function getStudentGrades(cohortId: string, userId: string): Promise<StudentGradesResult> {
  const supabase = await createClient();

  const enrollment = await getEnrollmentForUser(userId, cohortId);
  if (!enrollment) {
    return { groups: [], attendance: { pct: null, meetsRequirement: null } };
  }

  const { data: enrollmentDetails, error: enrollmentDetailsError } = await supabase
    .from("enrollments")
    .select("enrolled_at, segment")
    .eq("id", enrollment.id)
    .single();
  if (enrollmentDetailsError && enrollmentDetailsError.code !== "PGRST116") {
    console.error("[grades] enrollmentDetails falló", {
      cohortId,
      userId,
      code: enrollmentDetailsError.code,
      message: enrollmentDetailsError.message,
    });
    throw enrollmentDetailsError;
  }
  const enrollmentEligibility = {
    enrolled_at: enrollmentDetails?.enrolled_at ?? "1970-01-01T00:00:00.000Z",
    segment: enrollmentDetails?.segment ?? null,
  };

  const { data: cohort, error: cohortError } = await supabase
    .from("cohorts")
    .select("program_id, programs(min_attendance_pct)")
    .eq("id", cohortId)
    .maybeSingle();
  if (cohortError) {
    console.error("[grades] cohort falló", { cohortId, userId, code: cohortError.code, message: cohortError.message });
    throw cohortError;
  }
  const program = cohort?.programs as { min_attendance_pct: number } | null;

  const { data: gradeRows, error: gradeRowsError } = await supabase
    .from("evaluation_grades")
    .select("grade, feedback, graded_at, evaluation_id")
    .eq("enrollment_id", enrollment.id)
    .not("grade", "is", null);
  if (gradeRowsError) {
    console.error("[grades] evaluation_grades falló", {
      cohortId,
      userId,
      code: gradeRowsError.code,
      message: gradeRowsError.message,
    });
    throw gradeRowsError;
  }

  type EvaluationMeta = {
    id: string;
    title: string;
    scope: "final" | "module" | "lesson" | "session";
    module_id: string | null;
    lesson_id: string | null;
    session_id: string | null;
    weight_pct: number | null;
  };
  type Row = {
    grade: number;
    feedback: string | null;
    graded_at: string | null;
    evaluations: EvaluationMeta | null;
  };

  const gradeRowsSafe = (gradeRows ?? []) as unknown as Array<{
    grade: number;
    feedback: string | null;
    graded_at: string | null;
    evaluation_id: string;
  }>;
  const evaluationIds = Array.from(new Set(gradeRowsSafe.map((r) => r.evaluation_id)));

  const admin = createAdminClient();
  const { data: evaluationsRaw, error: evaluationsError } =
    evaluationIds.length > 0
      ? await admin
          .from("evaluations")
          .select("id, title, scope, module_id, lesson_id, session_id, weight_pct")
          .in("id", evaluationIds)
      : { data: [], error: null };
  if (evaluationsError) {
    console.error("[grades] evaluations falló", {
      cohortId,
      userId,
      code: evaluationsError.code,
      message: evaluationsError.message,
    });
    throw evaluationsError;
  }
  const evaluationById = new Map(((evaluationsRaw ?? []) as unknown as EvaluationMeta[]).map((e) => [e.id, e]));

  const rows: Row[] = gradeRowsSafe
    .map((r) => ({
      grade: r.grade,
      feedback: r.feedback,
      graded_at: r.graded_at,
      evaluations: evaluationById.get(r.evaluation_id) ?? null,
    }))
    .filter((r) => r.evaluations != null);

  // Resolver module_id para scope=lesson (via lessons.module_id) y
  // scope=session (via class_sessions.module_id, nullable — "Otras evaluaciones").
  const lessonIds = rows.filter((r) => r.evaluations!.scope === "lesson").map((r) => r.evaluations!.lesson_id!);
  const sessionIds = rows.filter((r) => r.evaluations!.scope === "session").map((r) => r.evaluations!.session_id!);

  const moduleIdByLesson = new Map<string, string | null>();
  if (lessonIds.length > 0) {
    const { data: lessons, error: lessonsError } = await supabase.from("lessons").select("id, module_id").in("id", lessonIds);
    if (lessonsError) {
      console.error("[grades] lessons falló", { cohortId, userId, code: lessonsError.code, message: lessonsError.message });
      throw lessonsError;
    }
    for (const l of lessons ?? []) moduleIdByLesson.set(l.id, l.module_id);
  }
  const moduleIdBySession = new Map<string, string | null>();
  if (sessionIds.length > 0) {
    const { data: sessions, error: sessionsError } = await supabase.from("class_sessions").select("id, module_id").in("id", sessionIds);
    if (sessionsError) {
      console.error("[grades] class_sessions (module) falló", {
        cohortId,
        userId,
        code: sessionsError.code,
        message: sessionsError.message,
      });
      throw sessionsError;
    }
    for (const s of sessions ?? []) moduleIdBySession.set(s.id, s.module_id);
  }

  function resolveGroupKeyAndModuleId(r: Row): { key: string; moduleId: string | null } {
    const e = r.evaluations!;
    if (e.scope === "final") return { key: "final", moduleId: null };
    if (e.scope === "module") return { key: `module:${e.module_id}`, moduleId: e.module_id };
    if (e.scope === "lesson") {
      const moduleId = moduleIdByLesson.get(e.lesson_id!) ?? null;
      return { key: moduleId ? `module:${moduleId}` : "other", moduleId };
    }
    // scope === "session"
    const moduleId = moduleIdBySession.get(e.session_id!) ?? null;
    return { key: moduleId ? `module:${moduleId}` : "other", moduleId };
  }

  const moduleIdsNeeded = new Set<string>();
  for (const r of rows) {
    const { moduleId } = resolveGroupKeyAndModuleId(r);
    if (moduleId) moduleIdsNeeded.add(moduleId);
  }
  const moduleTitleById = new Map<string, string>();
  const positionByModuleId = new Map<string, number>();
  if (moduleIdsNeeded.size > 0) {
    const { data: modules, error: modulesError } = await supabase
      .from("program_modules")
      .select("id, title, position")
      .in("id", Array.from(moduleIdsNeeded));
    if (modulesError) {
      console.error("[grades] program_modules falló", {
        cohortId,
        userId,
        code: modulesError.code,
        message: modulesError.message,
      });
      throw modulesError;
    }
    for (const m of modules ?? []) {
      moduleTitleById.set(m.id, m.title);
      positionByModuleId.set(m.id, m.position);
    }
  }

  const groupsByKey = new Map<string, StudentGradeGroup>();

  for (const r of rows) {
    const e = r.evaluations!;
    const { key, moduleId } = resolveGroupKeyAndModuleId(r);
    let group = groupsByKey.get(key);
    if (!group) {
      const title =
        key === "final" ? "Evaluación final" : key === "other" ? "Otras evaluaciones" : (moduleId && moduleTitleById.get(moduleId)) || "Módulo";
      group = { key, title, rows: [], average: null, averageKind: null, averageExcluded: 0 };
      groupsByKey.set(key, group);
    }
    group.rows.push({
      evaluationId: e.id,
      title: e.title,
      scope: e.scope,
      weightPct: e.weight_pct,
      grade: r.grade,
      feedback: r.feedback,
      gradedAt: r.graded_at,
    });
  }

  const groups: StudentGradeGroup[] = Array.from(groupsByKey.values()).map((g) => {
    const avg = computeGroupAverage(g.rows);
    return { key: g.key, title: g.title, rows: g.rows, average: avg.value, averageKind: avg.kind, averageExcluded: avg.excluded };
  });
  // Orden: módulos (por posición del módulo), luego "Otras evaluaciones", luego "Evaluación final".
  groups.sort((a, b) => {
    const rank = (g: StudentGradeGroup) => {
      if (g.key === "final") return 2;
      if (g.key === "other") return 1;
      return 0;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) {
      const moduleIdA = a.key.replace("module:", "");
      const moduleIdB = b.key.replace("module:", "");
      return (positionByModuleId.get(moduleIdA) ?? 0) - (positionByModuleId.get(moduleIdB) ?? 0);
    }
    return 0;
  });

  // Carril de asistencia: % calculado sobre sesiones ya cerradas de la
  // cohorte. NUNCA se expone `min_attendance_pct` en crudo (corrección A1) —
  // solo si el alumno cumple o no el requisito.
  //
  // Definición canónica de "sesión cerrada Y aplicable" (corrección A3 de la
  // revisión, ahora completa): misma que `lib/admin/student-panel-queries.ts`
  // y el cron de alertas (`lib/asistencia/queries.ts:getStudentsAtAbsenceThreshold`)
  // — excluye `status='cancelled'` Y `modality='recorded'` (una grabación no
  // tiene QR, no puede computar como inasistencia), exige `now > ends_at +
  // GRACE_AFTER_MIN` (ventana de gracia), descarta sesiones anteriores a la
  // matrícula del alumno (`enrolled_at`) y respeta `audience`/`segment` (una
  // sesión exclusiva de Capital Inteligente no cuenta para un alumno que no
  // es de ese segmento). Predicados compartidos: `isSessionClosed` /
  // `sessionAppliesToEnrollment` en `lib/asistencia/window.ts`.
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const { data: closedSessionsRaw, error: closedSessionsError } = await supabase
    .from("class_sessions")
    .select("id, ends_at, audience")
    .eq("cohort_id", cohortId)
    .neq("status", "cancelled")
    .neq("modality", "recorded")
    .lt("ends_at", nowIso);
  if (closedSessionsError) {
    console.error("[grades] class_sessions (asistencia) falló", {
      cohortId,
      userId,
      code: closedSessionsError.code,
      message: closedSessionsError.message,
    });
    throw closedSessionsError;
  }
  const closedSessionIds = (closedSessionsRaw ?? [])
    .filter((s) => isSessionClosed(s, now))
    .filter((s) => sessionAppliesToEnrollment(s, enrollmentEligibility))
    .map((s) => s.id);

  let attendance: AttendanceLane = { pct: null, meetsRequirement: null };
  if (closedSessionIds.length > 0) {
    const { data: presentRows, error: presentRowsError } = await supabase
      .from("session_attendance")
      .select("session_id")
      .eq("student_id", userId)
      .in("session_id", closedSessionIds);
    if (presentRowsError) {
      console.error("[grades] session_attendance falló", {
        cohortId,
        userId,
        code: presentRowsError.code,
        message: presentRowsError.message,
      });
      throw presentRowsError;
    }
    const pct = Math.round(((presentRows?.length ?? 0) / closedSessionIds.length) * 100);
    attendance = {
      pct,
      meetsRequirement: program ? pct >= program.min_attendance_pct : null,
    };
  }

  return { groups, attendance };
}
