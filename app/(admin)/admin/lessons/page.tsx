import Link from "next/link";
import { Video, VideoOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AddLessonButton } from "@/components/admin/add-lesson-button";
import { AddModuleButton } from "@/components/admin/add-module-button";
import { ModuleEditForm } from "@/components/admin/module-edit-form";

export default async function AdminLessonsPage() {
  const supabase = await createClient();

  const [{ data: modules }, { data: programs }] = await Promise.all([
    supabase
      .from("program_modules")
      .select(
        `
      *,
      programs(name, code),
      lessons(*)
    `,
      )
      .order("position", { ascending: true }),
    supabase.from("programs").select("id, name").order("name", { ascending: true }),
  ]);

  const programOptions = (programs ?? []) as { id: string; name: string }[];

  if (!modules || modules.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
        <h1 className="text-2xl font-bold text-ca-ink">
          Gestión de lecciones
        </h1>
        <p className="mb-4 mt-4 text-ca-ink-soft">
          No hay módulos configurados aún. Crea el primero.
        </p>
        <AddModuleButton programs={programOptions} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ca-ink">Gestión de lecciones</h1>
        <AddModuleButton programs={programOptions} />
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
                <div className="space-y-2">
                  {lessons.map((lesson, index) => {
                    const hasVideo = !!(lesson.mux_playback_id as string | null);
                    return (
                      <Link
                        key={lesson.id as string}
                        href={`/admin/lessons/${lesson.id as string}`}
                        className="flex items-center gap-4 rounded-lg border border-ca-ink/[0.08] bg-ca-surface p-4 transition-colors hover:border-ca-violet/30 hover:bg-ca-violet/[0.04]"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ca-bg-soft text-xs font-semibold text-ca-ink-soft">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-ca-ink">
                            {lesson.title as string}
                          </p>
                          <p className="text-xs text-ca-ink-soft">
                            {lesson.kind as string}
                            {(lesson.duration_minutes as number | null) &&
                              ` · ${lesson.duration_minutes as number} min`}
                          </p>
                        </div>
                        {hasVideo ? (
                          <span className="flex items-center gap-1 rounded-full bg-ca-lime-mist px-2 py-0.5 text-xs font-medium text-ca-lime-deep">
                            <Video className="h-3 w-3" />
                            Video
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded-full bg-ca-bg-soft px-2 py-0.5 text-xs text-ca-ink-soft">
                            <VideoOff className="h-3 w-3" />
                            Sin video
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
              <AddLessonButton moduleId={mod.id as string} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
