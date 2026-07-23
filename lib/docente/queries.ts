/**
 * Lecturas del panel del docente (`/docente`).
 *
 * Todo con service_role (`createAdminClient`): el llamador (server component
 * de `app/(docente)/`) valida antes que el usuario es platform staff
 * (ops/admin) o teacher/assistant de al menos una cohorte.
 *
 * El listado de cohortes (`getTeacherCohorts`) combina dos vías:
 *  (a) `cohort_roles.role in ('teacher','assistant')` del propio usuario:
 *      otorga ESCRITURA — los guards `requireSessionStaff`/
 *      `requireEvaluationStaff` solo miran esta tabla.
 *  (b) `instructors.profile_id` del usuario → `class_sessions.teacher_id`:
 *      SOLO VISIBILIDAD. Ver `TeacherCohort.source`.
 */

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClassSession, SessionResource } from "@/lib/classroom/types";

export type TeacherCohort = {
  cohortId: string;
  cohortName: string;
  cohortSlug: string | null;
  programId: string;
  programName: string;
  /**
   * "role": el usuario tiene `cohort_roles` teacher/assistant en esta
   * cohorte — otorga ESCRITURA (los guards `requireSessionStaff` y
   * `requireEvaluationStaff` autorizan por esta vía).
   *
   * "instructor": el usuario está asignado como `instructors.profile_id` en
   * alguna `class_sessions.teacher_id` de esta cohorte, sin `cohort_roles`
   * ahí — SOLO VISIBILIDAD. Los guards no miran `instructors`; ampliarlo a
   * escritura requiere un ADR propio, porque `profile_id` es nullable y no
   * único en el esquema, y la tabla se edita libre desde /admin.
   */
  source: "role" | "instructor";
};

/** Fichas de `instructors` ligadas a este profile. Un profile puede tener más
 *  de una (profile_id no es único en el esquema). */
export const getInstructorIdsForProfile = cache(async (userId: string): Promise<string[]> => {
  const admin = createAdminClient();
  const { data } = await admin.from("instructors").select("id").eq("profile_id", userId);
  return (data ?? []).map((i) => i.id as string);
});

type CohortJoinRow = {
  cohort_id: string;
  cohorts: {
    id: string;
    name: string;
    slug: string | null;
    program_id: string;
    programs: { id: string; name: string } | null;
  } | null;
};

/**
 * Cohortes donde el usuario dicta clase: unión de (a) `cohort_roles`
 * teacher/assistant y (b) instructor asignado en `class_sessions`. (a) gana
 * si ambas coinciden — nunca se degrada una cohorte de "role" a "instructor".
 */
async function getTeacherCohortsImpl(userId: string): Promise<TeacherCohort[]> {
  const admin = createAdminClient();
  const cohortsById = new Map<string, TeacherCohort>();

  const { data: roleRows } = await admin
    .from("cohort_roles")
    .select("cohort_id, cohorts(id, name, slug, program_id, programs(id, name))")
    .eq("user_id", userId)
    .in("role", ["teacher", "assistant"]);

  for (const r of ((roleRows ?? []) as unknown as CohortJoinRow[])) {
    if (!r.cohorts || !r.cohorts.programs) continue;
    cohortsById.set(r.cohorts.id, {
      cohortId: r.cohorts.id,
      cohortName: r.cohorts.name,
      cohortSlug: r.cohorts.slug,
      programId: r.cohorts.programs.id,
      programName: r.cohorts.programs.name,
      source: "role",
    });
  }

  const instructorIds = await getInstructorIdsForProfile(userId);
  if (instructorIds.length > 0) {
    const { data: sessionRows } = await admin
      .from("class_sessions")
      .select("cohort_id, cohorts(id, name, slug, program_id, programs(id, name))")
      .in("teacher_id", instructorIds);

    for (const r of ((sessionRows ?? []) as unknown as CohortJoinRow[])) {
      if (!r.cohorts || !r.cohorts.programs) continue;
      if (cohortsById.has(r.cohorts.id)) continue; // (a) gana, no se degrada
      cohortsById.set(r.cohorts.id, {
        cohortId: r.cohorts.id,
        cohortName: r.cohorts.name,
        cohortSlug: r.cohorts.slug,
        programId: r.cohorts.programs.id,
        programName: r.cohorts.programs.name,
        source: "instructor",
      });
    }
  }

  return Array.from(cohortsById.values()).sort((a, b) => {
    if (a.programName !== b.programName) return a.programName.localeCompare(b.programName, "es");
    return a.cohortName.localeCompare(b.cohortName, "es");
  });
}

// `cache()` de React dedupe por request; en tests (fuera de un render) no
// memoiza predeciblemente, así que se exporta también la versión sin cachear
// para test unitario (`app/(docente)/docente/page.tsx` sigue usando la
// exportada cacheada — la dedup por request no cambia).
export const getTeacherCohorts = cache(getTeacherCohortsImpl);
export const __getTeacherCohortsUncached = getTeacherCohortsImpl;

/**
 * ¿Este usuario dicta en alguna cohorte? Fuente única con el panel /docente:
 * si `getTeacherCohorts` devuelve algo, /docente le muestra algo. Cuando la
 * Fase 2 del rediseño del rol docente cambie la vía "instructor" por
 * `session_teachers`, esta función hereda el cambio sin tocarse.
 */
export async function isTeacherUser(userId: string): Promise<boolean> {
  return (await getTeacherCohorts(userId)).length > 0;
}

/** Nº de alumnos activos matriculados en las cohortes del docente (conteo, sin filas). */
export async function getTeacherStudentCount(cohortIds: string[]): Promise<number> {
  if (cohortIds.length === 0) return 0;
  const admin = createAdminClient();
  const { count } = await admin
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .in("cohort_id", cohortIds)
    .eq("status", "active");
  return count ?? 0;
}

export type TeacherSession = ClassSession & { resources: SessionResource[] };

/**
 * Sesiones de las cohortes del docente, con sus recursos iniciales adjuntos.
 * En cohortes donde el acceso es solo por vía instructor (`source:"instructor"`),
 * se listan únicamente las sesiones donde el usuario es el `teacher_id` — no
 * la agenda completa de la cohorte.
 */
export async function getTeacherSessions(userId: string): Promise<TeacherSession[]> {
  const admin = createAdminClient();
  const cohorts = await getTeacherCohorts(userId);
  const cohortIds = cohorts.map((c) => c.cohortId);
  if (cohortIds.length === 0) return [];

  const instructorOnlyCohortIds = new Set(
    cohorts.filter((c) => c.source === "instructor").map((c) => c.cohortId),
  );
  const instructorIds =
    instructorOnlyCohortIds.size > 0 ? await getInstructorIdsForProfile(userId) : [];

  const { data: sessions, error: sessionsError } = await admin
    .from("class_sessions")
    .select("id, cohort_id, title, starts_at, ends_at, modality, status, teacher_id")
    .in("cohort_id", cohortIds)
    .order("starts_at");
  if (sessionsError) {
    console.error("[getTeacherSessions] class_sessions error", sessionsError);
    throw sessionsError;
  }

  const sessionRows = ((sessions ?? []) as unknown as ClassSession[]).filter((s) => {
    if (!instructorOnlyCohortIds.has(s.cohort_id)) return true;
    return s.teacher_id !== null && instructorIds.includes(s.teacher_id);
  });
  const sessionIds = sessionRows.map((s) => s.id);

  const { data: resources, error: resourcesError } =
    sessionIds.length > 0
      ? await admin
          .from("session_resources")
          .select("id, session_id, title, type, url, storage_path, position")
          .in("session_id", sessionIds)
      : { data: [] as SessionResource[], error: null };
  if (resourcesError) {
    console.error("[getTeacherSessions] session_resources error", resourcesError);
  }

  const resourcesBySession = new Map<string, SessionResource[]>();
  for (const r of (resources ?? []) as unknown as SessionResource[]) {
    const list = resourcesBySession.get(r.session_id) ?? [];
    list.push(r);
    resourcesBySession.set(r.session_id, list);
  }

  return sessionRows.map((s) => ({
    ...s,
    resources: resourcesBySession.get(s.id) ?? [],
  }));
}

export type GradableEvaluation = {
  id: string;
  title: string;
  scope: "final" | "module" | "lesson" | "session";
  kind: "quiz" | "manual";
  cohortId: string;
  cohortName: string;
  isActive: boolean;
};

/**
 * Evaluaciones calificables (`kind` quiz o manual) de las cohortes del
 * docente, para el panel de calificación de `/docente/notas`. Input de la
 * auditoría de permisos (15-jul): el profe no usa `authorizeAdmin` (bloqueado
 * a ops/admin) — esta lectura usa `cohort_roles` del propio usuario, igual
 * que el resto de `lib/docente/queries.ts`; el guardado pasa por
 * `requireEvaluationStaff` (lib/auth/authorize-admin.ts).
 */
export async function getTeacherGradableEvaluations(userId: string): Promise<GradableEvaluation[]> {
  const admin = createAdminClient();
  const allCohorts = await getTeacherCohorts(userId);
  // Calificar es escritura: los guards (`requireEvaluationStaff`) solo miran
  // `cohort_roles`, así que incluir cohortes solo-instructor mostraría
  // evaluaciones cuyo guardado devuelve 403.
  const cohorts = allCohorts.filter((c) => c.source === "role");
  if (cohorts.length === 0) return [];

  const programIds = Array.from(new Set(cohorts.map((c) => c.programId)));
  const { data: evaluations } = await admin
    .from("evaluations")
    .select("id, title, scope, kind, program_id, is_active")
    .in("program_id", programIds)
    .in("kind", ["quiz", "manual"]);

  const result: GradableEvaluation[] = [];
  for (const cohort of cohorts) {
    for (const ev of evaluations ?? []) {
      if (ev.program_id !== cohort.programId) continue;
      result.push({
        id: ev.id,
        title: ev.title,
        scope: ev.scope as GradableEvaluation["scope"],
        kind: ev.kind as GradableEvaluation["kind"],
        cohortId: cohort.cohortId,
        cohortName: cohort.cohortName,
        isActive: ev.is_active ?? false,
      });
    }
  }
  // Orden determinista: activas primero, luego por cohorte y título.
  return result.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.cohortName !== b.cohortName) return a.cohortName.localeCompare(b.cohortName, "es");
    return a.title.localeCompare(b.title, "es");
  });
}
