import { createClient } from "@/lib/supabase/server";
import { getEnrollmentForUser } from "@/lib/classroom/queries";
import { GRACE_AFTER_MIN } from "@/lib/asistencia/window";

const MINUTE_MS = 60_000;

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
  /**
   * Promedio SIMPLE (sin ponderar), o `null` cuando: (a) no hay notas, o
   * (b) el grupo tiene alguna evaluación con `weight_pct` cargado — un
   * promedio simple ahí contradice la composición ponderada que la profe ya
   * comunicó a los alumnos (corrección A7 del brief). En ese caso se listan
   * solo las notas individuales.
   */
  average: number | null;
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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Notas 1-7 consolidadas de un alumno en una cohorte, agrupadas por módulo.
 * Cliente RLS (no admin): el alumno solo puede ver sus propias notas
 * PUBLICADAS (`evaluation_grades_student_select`), consistente con el resto
 * del classroom.
 */
export async function getStudentGrades(cohortId: string, userId: string): Promise<StudentGradesResult> {
  const supabase = await createClient();

  const enrollment = await getEnrollmentForUser(userId, cohortId);
  if (!enrollment) {
    return { groups: [], attendance: { pct: null, meetsRequirement: null } };
  }

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("program_id, programs(min_attendance_pct)")
    .eq("id", cohortId)
    .maybeSingle();
  const program = cohort?.programs as { min_attendance_pct: number } | null;

  const { data: gradeRows } = await supabase
    .from("evaluation_grades")
    .select(
      "grade, feedback, graded_at, evaluations(id, title, scope, module_id, lesson_id, session_id, weight_pct)",
    )
    .eq("enrollment_id", enrollment.id)
    .not("grade", "is", null);

  type Row = {
    grade: number;
    feedback: string | null;
    graded_at: string | null;
    evaluations: {
      id: string;
      title: string;
      scope: "final" | "module" | "lesson" | "session";
      module_id: string | null;
      lesson_id: string | null;
      session_id: string | null;
      weight_pct: number | null;
    } | null;
  };
  const rows = ((gradeRows ?? []) as unknown as Row[]).filter((r) => r.evaluations != null);

  // Resolver module_id para scope=lesson (via lessons.module_id) y
  // scope=session (via class_sessions.module_id, nullable — "Otras evaluaciones").
  const lessonIds = rows.filter((r) => r.evaluations!.scope === "lesson").map((r) => r.evaluations!.lesson_id!);
  const sessionIds = rows.filter((r) => r.evaluations!.scope === "session").map((r) => r.evaluations!.session_id!);

  const moduleIdByLesson = new Map<string, string | null>();
  if (lessonIds.length > 0) {
    const { data: lessons } = await supabase.from("lessons").select("id, module_id").in("id", lessonIds);
    for (const l of lessons ?? []) moduleIdByLesson.set(l.id, l.module_id);
  }
  const moduleIdBySession = new Map<string, string | null>();
  if (sessionIds.length > 0) {
    const { data: sessions } = await supabase.from("class_sessions").select("id, module_id").in("id", sessionIds);
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
  if (moduleIdsNeeded.size > 0) {
    const { data: modules } = await supabase
      .from("program_modules")
      .select("id, title, position")
      .in("id", Array.from(moduleIdsNeeded));
    for (const m of modules ?? []) moduleTitleById.set(m.id, m.title);
  }

  const groupsByKey = new Map<string, StudentGradeGroup>();

  for (const r of rows) {
    const e = r.evaluations!;
    const { key, moduleId } = resolveGroupKeyAndModuleId(r);
    let group = groupsByKey.get(key);
    if (!group) {
      const title =
        key === "final" ? "Evaluación final" : key === "other" ? "Otras evaluaciones" : (moduleId && moduleTitleById.get(moduleId)) || "Módulo";
      group = { key, title, rows: [], average: null };
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

  const groups = Array.from(groupsByKey.values()).map((g) => {
    const hasWeighting = g.rows.some((row) => row.weightPct != null);
    const average = hasWeighting ? null : g.rows.length > 0 ? round1(g.rows.reduce((sum, row) => sum + row.grade, 0) / g.rows.length) : null;
    return { key: g.key, title: g.title, rows: g.rows, average };
  });
  // Orden: módulos (por posición del módulo), luego "Otras evaluaciones", luego "Evaluación final".
  const positionByModuleId = new Map<string, number>();
  if (moduleIdsNeeded.size > 0) {
    const { data: modules } = await supabase
      .from("program_modules")
      .select("id, position")
      .in("id", Array.from(moduleIdsNeeded));
    for (const m of modules ?? []) positionByModuleId.set(m.id, m.position);
  }
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
  // Definición canónica de "sesión cerrada" (corrección A3 de la revisión):
  // misma que `lib/admin/student-panel-queries.ts` y el cron de alertas
  // (`lib/asistencia/queries.ts:getStudentsAtAbsenceThreshold`) — excluye
  // `status='cancelled'` Y `modality='recorded'` (una grabación no tiene QR,
  // no puede computar como inasistencia), y exige `now > ends_at +
  // GRACE_AFTER_MIN` (ventana de gracia de asistencia), no solo `ends_at` en
  // el pasado.
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const { data: closedSessionsRaw } = await supabase
    .from("class_sessions")
    .select("id, ends_at")
    .eq("cohort_id", cohortId)
    .neq("status", "cancelled")
    .neq("modality", "recorded")
    .lt("ends_at", nowIso);
  const closedSessionIds = (closedSessionsRaw ?? [])
    .filter((s) => now > new Date(s.ends_at).getTime() + GRACE_AFTER_MIN * MINUTE_MS)
    .map((s) => s.id);

  let attendance: AttendanceLane = { pct: null, meetsRequirement: null };
  if (closedSessionIds.length > 0) {
    const { data: presentRows } = await supabase
      .from("session_attendance")
      .select("session_id")
      .eq("student_id", userId)
      .in("session_id", closedSessionIds);
    const pct = Math.round(((presentRows?.length ?? 0) / closedSessionIds.length) * 100);
    attendance = {
      pct,
      meetsRequirement: program ? pct >= program.min_attendance_pct : null,
    };
  }

  return { groups, attendance };
}
