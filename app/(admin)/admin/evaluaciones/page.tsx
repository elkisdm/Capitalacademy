import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getActiveEnv, resolveProgramScope } from "@/lib/admin/active-env";
import { formatChile } from "@/lib/time";
import { groupEvaluations, type EvaluationRow } from "@/lib/admin/evaluation-list";
import { EvaluationsListClient } from "./evaluations-list-client";

type RawEvaluation = {
  id: string;
  scope: "final" | "module" | "lesson" | "session";
  kind: "quiz" | "manual";
  title: string;
  is_active: boolean;
  opens_at: string | null;
  closes_at: string | null;
  weight_pct: number | null;
  module_id: string | null;
  lesson_id: string | null;
  session_id: string | null;
  quiz_questions?: { count: number }[];
};

export default async function AdminEvaluacionesPage(props: {
  searchParams: Promise<{ program?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: programs } = await supabase.from("programs").select("id, name").order("name");
  const programOptions = (programs ?? []) as { id: string; name: string }[];

  if (programOptions.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Operaciones · Evaluación
        </div>
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">Evaluaciones</h1>
        <p className="mt-4 text-ca-ink-soft">No hay programas configurados.</p>
      </div>
    );
  }

  const { program: programParam } = await props.searchParams;
  const activeEnv = await getActiveEnv();
  const programId = resolveProgramScope(programParam, activeEnv, programOptions)!;

  // 4 queries acotadas por programa, sin embeds encadenados desde `evaluations`
  // (dos FKs a program_modules en la cadena lessons→program_modules piden hint
  // explícito y son frágiles) — se arma el join en JS.
  const [{ data: evaluations }, { data: modules }] = await Promise.all([
    supabase
      .from("evaluations")
      .select(
        "id, scope, kind, title, is_active, opens_at, closes_at, weight_pct, module_id, lesson_id, session_id, quiz_questions(count)",
      )
      .eq("program_id", programId),
    supabase.from("program_modules").select("id, title, position").eq("program_id", programId).order("position"),
  ]);

  const evalRows = (evaluations ?? []) as unknown as RawEvaluation[];
  const moduleList = (modules ?? []) as { id: string; title: string; position: number }[];
  const moduleTitleById = new Map(moduleList.map((m) => [m.id, m.title]));
  const moduleOrder = moduleList.map((m) => m.id);

  const lessonIds = evalRows.filter((e) => e.scope === "lesson" && e.lesson_id).map((e) => e.lesson_id!);
  const sessionIds = evalRows.filter((e) => e.scope === "session" && e.session_id).map((e) => e.session_id!);

  const [{ data: lessons }, { data: sessions }] = await Promise.all([
    lessonIds.length > 0
      ? supabase.from("lessons").select("id, title, module_id").in("id", lessonIds)
      : Promise.resolve({ data: [] as { id: string; title: string; module_id: string }[] }),
    sessionIds.length > 0
      ? supabase
          .from("class_sessions")
          .select("id, title, starts_at, module_id, cohort_id, cohorts(name)")
          .in("id", sessionIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            title: string | null;
            starts_at: string;
            module_id: string | null;
            cohort_id: string;
            cohorts: { name: string } | null;
          }[],
        }),
  ]);

  const lessonById = new Map(
    ((lessons ?? []) as { id: string; title: string; module_id: string }[]).map((l) => [l.id, l]),
  );
  const sessionById = new Map(
    (
      (sessions ?? []) as {
        id: string;
        title: string | null;
        starts_at: string;
        module_id: string | null;
        cohort_id: string;
        cohorts: { name: string } | null;
      }[]
    ).map((s) => [s.id, s]),
  );

  const rows: EvaluationRow[] = evalRows.map((e) => {
    const questionCount = e.quiz_questions?.[0]?.count ?? 0;
    let moduleId: string | null = null;
    let targetLabel: string | null = null;

    if (e.scope === "module") {
      moduleId = e.module_id;
    } else if (e.scope === "lesson" && e.lesson_id) {
      const lesson = lessonById.get(e.lesson_id);
      moduleId = lesson?.module_id ?? null;
      targetLabel = lesson ? `Lección: ${lesson.title}` : null;
    } else if (e.scope === "session" && e.session_id) {
      const session = sessionById.get(e.session_id);
      moduleId = session?.module_id ?? null;
      if (session) {
        const displayTitle = session.title?.trim() || "Clase en vivo";
        targetLabel = `${displayTitle} — ${formatChile(session.starts_at, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}`;
      }
    }

    return {
      id: e.id,
      scope: e.scope,
      kind: e.kind,
      title: e.title,
      is_active: e.is_active,
      opens_at: e.opens_at,
      closes_at: e.closes_at,
      weight_pct: e.weight_pct,
      questionCount,
      moduleId,
      moduleTitle: moduleId ? (moduleTitleById.get(moduleId) ?? null) : null,
      lessonId: e.lesson_id,
      sessionId: e.session_id,
      targetLabel,
    };
  });

  const groups = groupEvaluations(rows, moduleOrder);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <div className="mb-7">
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Operaciones · Evaluación
        </div>
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">Evaluaciones</h1>
        <p className="mt-1 text-[14px] text-ca-ink-soft">
          Crea y configura las evaluaciones del programa: quizzes autocorregidos y notas manuales
        </p>
      </div>
      <EvaluationsListClient programId={programId} groups={groups} />
    </div>
  );
}
