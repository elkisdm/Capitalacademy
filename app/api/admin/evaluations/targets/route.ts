import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { getSessionRecordingLessonIds } from "@/lib/classroom/queries";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET  /api/admin/evaluations/targets?programId=xxx
//   Módulos y lecciones del programa, para los selectores de creación de
//   evaluaciones (scope=module / scope=lesson) en el admin central de quizes.
//   Solo identidad y orden — no entrega contenido de la lección.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");
  if (!programId) {
    return NextResponse.json({ error: "programId es requerido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: modules, error } = await admin
    .from("program_modules")
    .select("id, title, position, lessons(id, title, position)")
    .eq("program_id", programId)
    .order("position", { ascending: true });

  if (error) {
    console.error("Error fetching evaluation targets:", error);
    return NextResponse.json({ error: "Error al obtener módulos y lecciones" }, { status: 500 });
  }

  type RawLesson = { id: string; title: string; position: number };
  const mods = (modules ?? []).map((m) => ({ id: m.id, title: m.title }));
  const moduleTitleById = new Map(mods.map((m) => [m.id, m.title]));
  const allLessonIds = (modules ?? []).flatMap((m) =>
    ((m.lessons ?? []) as RawLesson[]).map((l) => l.id),
  );
  const recordingIds = await getSessionRecordingLessonIds(allLessonIds);
  const lessons = (modules ?? []).flatMap((m) =>
    ((m.lessons ?? []) as RawLesson[])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        id: l.id,
        title: l.title,
        moduleId: m.id,
        moduleTitle: m.title,
        isRecording: recordingIds.has(l.id),
      })),
  );

  const { data: cohorts, error: cohortsError } = await admin
    .from("cohorts")
    .select("id, name")
    .eq("program_id", programId);
  if (cohortsError) {
    console.error("Error fetching cohorts for evaluation targets:", cohortsError);
  }
  const cohortList = (cohorts ?? []) as { id: string; name: string }[];
  const cohortNameById = new Map(cohortList.map((c) => [c.id, c.name]));
  const cohortIds = cohortList.map((c) => c.id);

  type RawSession = {
    id: string;
    title: string | null;
    starts_at: string;
    module_id: string | null;
    cohort_id: string;
  };
  let sessions: {
    id: string;
    title: string | null;
    startsAt: string;
    moduleTitle: string | null;
    cohortName: string;
  }[] = [];
  if (cohortIds.length > 0) {
    const { data: sessionRows, error: sessionsError } = await admin
      .from("class_sessions")
      .select("id, title, starts_at, module_id, cohort_id")
      .in("cohort_id", cohortIds)
      .order("starts_at", { ascending: true });
    if (sessionsError) {
      console.error("Error fetching class sessions for evaluation targets:", sessionsError);
    }
    sessions = ((sessionRows ?? []) as RawSession[]).map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      moduleTitle: row.module_id ? moduleTitleById.get(row.module_id) ?? null : null,
      cohortName: cohortNameById.get(row.cohort_id) ?? "",
    }));
  }

  return NextResponse.json({ modules: mods, lessons, sessions, cohorts: cohortList });
}
