/**
 * Lecturas del panel del docente (`/docente`).
 *
 * Todo con service_role (`createAdminClient`): el llamador (server component
 * de `app/(docente)/`) valida antes que el usuario es teacher/assistant de al
 * menos una cohorte. Cada función parte de `cohort_roles` del propio usuario,
 * así que un docente nunca ve sesiones de cohortes ajenas.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { ClassSession, SessionResource } from "@/lib/classroom/types";

export type TeacherCohort = {
  cohortId: string;
  cohortName: string;
  cohortSlug: string | null;
  programId: string;
  programName: string;
};

/** Cohortes donde el usuario es teacher o assistant (cohort_roles). */
export async function getTeacherCohorts(userId: string): Promise<TeacherCohort[]> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("cohort_roles")
    .select("cohort_id, cohorts(id, name, slug, program_id, programs(id, name))")
    .eq("user_id", userId)
    .in("role", ["teacher", "assistant"]);

  type Row = {
    cohort_id: string;
    cohorts: {
      id: string;
      name: string;
      slug: string | null;
      program_id: string;
      programs: { id: string; name: string } | null;
    } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.cohorts && r.cohorts.programs)
    .map((r) => ({
      cohortId: r.cohorts!.id,
      cohortName: r.cohorts!.name,
      cohortSlug: r.cohorts!.slug,
      programId: r.cohorts!.programs!.id,
      programName: r.cohorts!.programs!.name,
    }));
}

export type TeacherSession = ClassSession & { resources: SessionResource[] };

/** Sesiones de las cohortes del docente, con sus recursos iniciales adjuntos. */
export async function getTeacherSessions(userId: string): Promise<TeacherSession[]> {
  const admin = createAdminClient();
  const cohorts = await getTeacherCohorts(userId);
  const cohortIds = cohorts.map((c) => c.cohortId);
  if (cohortIds.length === 0) return [];

  const { data: sessions } = await admin
    .from("class_sessions")
    .select("id, cohort_id, title, starts_at, ends_at, modality, status")
    .in("cohort_id", cohortIds)
    .order("starts_at");

  const sessionRows = (sessions ?? []) as unknown as ClassSession[];
  const sessionIds = sessionRows.map((s) => s.id);

  const { data: resources } =
    sessionIds.length > 0
      ? await admin
          .from("session_resources")
          .select("id, session_id, title, type, url, storage_path, position")
          .in("session_id", sessionIds)
      : { data: [] as SessionResource[] };

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
