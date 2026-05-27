import Link from "next/link";
import { Video, VideoOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLessonsPage() {
  const supabase = await createClient();

  const { data: modules } = await supabase
    .from("program_modules")
    .select(
      `
      *,
      programs(name, code),
      lessons(*)
    `,
    )
    .order("position", { ascending: true });

  if (!modules || modules.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Gestión de lecciones
        </h1>
        <p className="mt-4 text-gray-500">
          No hay módulos configurados aún. Crea un programa y sus módulos
          primero.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-8 text-2xl font-bold text-gray-900">
        Gestión de lecciones
      </h1>

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
              <div className="mb-3 border-b border-gray-200 pb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {program?.name ?? "Programa"}
                </p>
                <h2 className="text-lg font-semibold text-gray-900">
                  {mod.code} — {mod.title}
                </h2>
              </div>

              {lessons.length === 0 ? (
                <p className="text-sm text-gray-400">
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
                        className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/30"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-gray-900">
                            {lesson.title as string}
                          </p>
                          <p className="text-xs text-gray-400">
                            {lesson.kind as string}
                            {(lesson.duration_minutes as number | null) &&
                              ` · ${lesson.duration_minutes as number} min`}
                          </p>
                        </div>
                        {hasVideo ? (
                          <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            <Video className="h-3 w-3" />
                            Video
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
                            <VideoOff className="h-3 w-3" />
                            Sin video
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
