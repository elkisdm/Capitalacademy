import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { FolderOpen, FileVideo, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getClassroomAccess } from "@/lib/classroom/access";
import {
  getCohortWithProgram,
  getModulesWithLessons,
  getCohortSchedule,
} from "@/lib/classroom/queries";
import { resolveResourceUrls } from "@/lib/classroom/resource-urls";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { ResourceList, type DisplayResource } from "@/components/classroom/resource-list";
import type { LessonResource } from "@/lib/classroom/types";

export const metadata: Metadata = {
  title: "Recursos del programa · Capital Academy",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "long" });

export default async function RecursosPage(
  props: { params: Promise<{ cohortSlug: string }> },
) {
  const { cohortSlug } = await props.params;
  const cohortId = await resolveCohortSlug(cohortSlug);
  if (!cohortId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const [access, cohort] = await Promise.all([
    getClassroomAccess(user.id, cohortId),
    getCohortWithProgram(cohortId),
  ]);
  if (!access) notFound();
  if (!cohort) notFound();
  const enrollmentId = access.enrollment?.id ?? null;
  const program = cohort.programs as { id: string; name: string };

  // 1. Recursos de lecciones grabadas, agrupados por módulo → lección.
  const modules = await getModulesWithLessons(program.id, enrollmentId);
  const lessonIds = modules.flatMap((m) => m.lessons.map((l) => l.id));

  const lessonResourcesByLesson = new Map<string, DisplayResource[]>();
  if (lessonIds.length > 0) {
    const { data: rows } = await supabase
      .from("lesson_resources")
      .select("id, lesson_id, title, type, url, storage_path, position")
      .in("lesson_id", lessonIds)
      .order("position", { ascending: true });
    const resolved = await resolveResourceUrls((rows ?? []) as LessonResource[]);
    for (const r of resolved) {
      const arr = lessonResourcesByLesson.get(r.lesson_id) ?? [];
      arr.push(r);
      lessonResourcesByLesson.set(r.lesson_id, arr);
    }
  }

  const lessonGroups = modules
    .map((m) => ({
      module: m,
      lessons: m.lessons
        .map((l) => ({ lesson: l, resources: lessonResourcesByLesson.get(l.id) ?? [] }))
        .filter((x) => x.resources.length > 0),
    }))
    .filter((g) => g.lessons.length > 0);

  // 2. Recursos de clases en vivo (mismas sesiones que ve en su calendario).
  const sessions = await getCohortSchedule(cohortId);
  const sessionGroups = sessions
    .map((s) => ({ session: s, resources: (s.resources ?? []) as DisplayResource[] }))
    .filter((x) => x.resources.length > 0);

  const total =
    lessonGroups.reduce((n, g) => n + g.lessons.reduce((k, l) => k + l.resources.length, 0), 0) +
    sessionGroups.reduce((n, g) => n + g.resources.length, 0);

  return (
    <div className="ca-fade-up mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-10">
      <div className="mb-7">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-ca-violet/[0.08] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-ca-violet">
          <FolderOpen className="h-3.5 w-3.5" />
          Recursos del programa
        </div>
        <h1 className="text-[28px] font-black leading-tight tracking-tight text-ca-ink md:text-[34px]">
          Todo el material de {program.name}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ca-ink-soft">
          Aquí reunimos en un solo lugar los archivos, plantillas y enlaces de tus clases —grabadas
          y en vivo— para que los encuentres rápido.
        </p>
      </div>

      {total === 0 ? (
        <div className="ca-card flex flex-col items-center justify-center p-16 text-center">
          <FolderOpen className="h-10 w-10 text-ca-ink-soft/40" />
          <p className="mt-3 text-[14px] font-bold text-ca-ink">Aún no hay material publicado</p>
          <p className="mt-1 text-[13px] text-ca-ink-soft">
            Cuando tus clases tengan archivos o enlaces, aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {lessonGroups.length > 0 && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-[16px] font-black tracking-tight text-ca-ink">
                <FileVideo className="h-4.5 w-4.5 text-ca-violet" />
                Clases grabadas
              </h2>
              <div className="flex flex-col gap-6">
                {lessonGroups.map((g) => (
                  <div key={g.module.id}>
                    <h3 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                      Módulo {String(g.module.position).padStart(2, "0")} · {g.module.title}
                    </h3>
                    <div className="flex flex-col gap-4">
                      {g.lessons.map(({ lesson, resources }) => (
                        <div key={lesson.id}>
                          <Link
                            href={`/classroom/${cohortSlug}/${g.module.slug ?? g.module.id}/${lesson.slug ?? lesson.id}`}
                            className="mb-2 inline-block text-[13.5px] font-bold text-ca-ink hover:text-ca-violet"
                          >
                            {lesson.title}
                          </Link>
                          <ResourceList resources={resources} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {sessionGroups.length > 0 && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-[16px] font-black tracking-tight text-ca-ink">
                <CalendarDays className="h-4.5 w-4.5 text-ca-violet" />
                Clases en vivo
              </h2>
              <div className="flex flex-col gap-5">
                {sessionGroups.map(({ session, resources }) => {
                  const s = session as { id: string; title?: string | null; starts_at: string };
                  return (
                    <div key={s.id}>
                      <div className="mb-2">
                        <span className="text-[13.5px] font-bold text-ca-ink">
                          {s.title ?? "Clase en vivo"}
                        </span>
                        <span className="ml-2 text-[12px] text-ca-ink-soft">{fmtDate(s.starts_at)}</span>
                      </div>
                      <ResourceList resources={resources} />
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
