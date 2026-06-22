import { createClient } from "@/lib/supabase/server";
import { AddLessonButton } from "@/components/admin/add-lesson-button";
import { LessonReorderList } from "@/components/admin/lesson-reorder-list";
import { AddModuleButton } from "@/components/admin/add-module-button";
import { ModuleEditForm } from "@/components/admin/module-edit-form";
import { ProgramFilter } from "@/components/admin/program-filter";

export default async function AdminLessonsPage(props: {
  searchParams: Promise<{ program?: string }>;
}) {
  const supabase = await createClient();

  const { data: programs } = await supabase
    .from("programs")
    .select("id, name")
    .order("name", { ascending: true });
  const programOptions = (programs ?? []) as { id: string; name: string }[];

  if (programOptions.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
        <h1 className="text-2xl font-bold text-ca-ink">Gestión de lecciones</h1>
        <p className="mb-4 mt-4 text-ca-ink-soft">No hay programas configurados.</p>
      </div>
    );
  }

  // Scope por programa (el tenant): cada programa gestiona sus módulos/lecciones
  // por separado. Sin el filtro se mezclaban todos los programas en una lista.
  const { program: programParam } = await props.searchParams;
  const selectedProgramId =
    programOptions.find((p) => p.id === programParam)?.id ?? programOptions[0].id;

  const { data: modules } = await supabase
    .from("program_modules")
    .select(
      `
      *,
      programs(name, code),
      lessons(*)
    `,
    )
    .eq("program_id", selectedProgramId)
    .order("position", { ascending: true });

  if (!modules || modules.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-ca-ink">Gestión de lecciones</h1>
          <AddModuleButton programs={programOptions} />
        </div>
        <ProgramFilter
          programs={programOptions}
          selectedProgramId={selectedProgramId}
          basePath="/admin/lessons"
        />
        <p className="mb-4 mt-4 text-ca-ink-soft">
          Este programa no tiene módulos configurados aún. Crea el primero.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ca-ink">Gestión de lecciones</h1>
        <AddModuleButton programs={programOptions} />
      </div>
      <div className="mb-8">
        <ProgramFilter
          programs={programOptions}
          selectedProgramId={selectedProgramId}
          basePath="/admin/lessons"
        />
      </div>

      <div className="space-y-8">
        {modules.map((mod) => {
          const program = mod.programs as { name: string; code: string } | null;
          const lessons = (
            (mod.lessons ?? []) as Array<Record<string, unknown>>
          ).sort(
            (a, b) => (a.position as number) - (b.position as number),
          );

          return (
            <section key={mod.id}>
              <div className="mb-3 border-b border-ca-ink/[0.08] pb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-ca-ink-soft">
                  {program?.name ?? "Programa"}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-ca-ink">
                    {mod.code} — {mod.title}
                  </h2>
                  <ModuleEditForm
                    module={{
                      id: mod.id as string,
                      code: mod.code as string,
                      title: mod.title as string,
                      description: (mod.description as string | null) ?? null,
                    }}
                  />
                </div>
              </div>

              {lessons.length === 0 ? (
                <p className="text-sm text-ca-ink-soft">
                  Sin lecciones en este módulo.
                </p>
              ) : (
                <LessonReorderList
                  moduleId={mod.id as string}
                  lessons={lessons.map((lesson) => ({
                    id: lesson.id as string,
                    title: lesson.title as string,
                    kind: lesson.kind as string,
                    hasVideo: !!(lesson.mux_playback_id as string | null),
                  }))}
                />
              )}
              <AddLessonButton moduleId={mod.id as string} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
