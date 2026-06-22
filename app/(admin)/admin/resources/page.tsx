import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResourcesAdmin } from "@/components/admin/resources-admin";

export default async function AdminResourcesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: modules } = await supabase
    .from("program_modules")
    .select("id, title, position, program_id, programs(name), lessons(*)")
    .order("position", { ascending: true });

  if (!modules || modules.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-8">
        <h1 className="text-2xl font-black text-ca-ink">Recursos por lección</h1>
        <p className="mt-4 text-ca-ink-soft">No hay módulos configurados.</p>
      </div>
    );
  }

  const allLessonIds = modules.flatMap((m) =>
    ((m.lessons ?? []) as Array<{ id: string }>).map((l) => l.id),
  );

  let resourcesByLesson: Record<string, Array<{
    id: string; lesson_id: string; title: string; type: string; url: string | null;
    storage_path: string | null; file_size_bytes: number | null; position: number;
  }>> = {};

  if (allLessonIds.length > 0) {
    const { data: resources } = await supabase
      .from("lesson_resources")
      .select("*")
      .in("lesson_id", allLessonIds)
      .order("position", { ascending: true });

    if (resources) {
      for (const r of resources) {
        const list = resourcesByLesson[r.lesson_id] ?? [];
        list.push(r);
        resourcesByLesson[r.lesson_id] = list;
      }
    }
  }

  const modulesData = modules.map((m) => ({
    id: m.id,
    title: m.title,
    position: m.position,
    programName: (m.programs as { name: string } | null)?.name ?? "Programa",
    lessons: ((m.lessons ?? []) as Array<{
      id: string; title: string; position: number; video_duration_seconds: number | null;
    }>)
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        id: l.id,
        title: l.title,
        position: l.position,
        durationMin: l.video_duration_seconds ? Math.floor(l.video_duration_seconds / 60) : null,
        resourceCount: (resourcesByLesson[l.id] ?? []).length,
      })),
  }));

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
            Operaciones · Contenido
          </div>
          <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">
            Recursos por lección
          </h1>
          <p className="mt-1 text-[13px] font-semibold text-ca-ink-soft">
            Sube PDFs, plantillas y links externos. Los alumnos los ven debajo del video.
          </p>
        </div>
      </div>

      <ResourcesAdmin modules={modulesData} initialResources={resourcesByLesson} />
    </div>
  );
}
