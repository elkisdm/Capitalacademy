import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import {
  getTeacherCohorts,
  getTeacherSessions,
  getTeacherStudentCount,
} from "@/lib/docente/queries";
import { DocentePanelClient } from "./docente-panel-client";

export const metadata = {
  title: "Panel del profesor",
};

/** Panel del docente: solo lectura de SUS sesiones + asistencia + recursos. */
export default async function DocentePage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const [cohorts, sessions] = await Promise.all([
    getTeacherCohorts(user.id),
    getTeacherSessions(user.id),
  ]);
  const studentCount = await getTeacherStudentCount(cohorts.map((c) => c.cohortId));

  const nowMs = Date.now();
  const upcomingSessions = sessions
    .filter((s) => new Date(s.ends_at).getTime() >= nowMs)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const pastSessions = sessions
    .filter((s) => new Date(s.ends_at).getTime() < nowMs)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  // Un programa por cohorte (el docente puede tener varias cohortes del mismo
  // programa; se deduplica por programId para no repetir el link).
  const programsById = new Map<
    string,
    { programId: string; programName: string; conversationsHref: string }
  >();
  for (const c of cohorts) {
    if (!programsById.has(c.programId)) {
      programsById.set(c.programId, {
        programId: c.programId,
        programName: c.programName,
        conversationsHref: `/classroom/${c.cohortSlug ?? c.cohortId}/conversaciones`,
      });
    }
  }

  return (
    <DocentePanelClient
      cohorts={cohorts}
      programs={Array.from(programsById.values())}
      upcomingSessions={upcomingSessions}
      pastSessions={pastSessions}
      stats={{ nextSession: upcomingSessions[0] ?? null, studentCount }}
    />
  );
}
