import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import {
  getCohortWithProgram,
  getModulesWithLessons,
} from "@/lib/classroom/queries";
import { getClassroomAccess } from "@/lib/classroom/access";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { calculateModuleProgress, getLessonStatus } from "@/lib/classroom/progress";
import { fmtDuration } from "@/lib/classroom/format";
import { formatChile, formatDateOnly } from "@/lib/time";
import { BrandShapes, ProgressBar } from "@/components/classroom/primitives";
import { ModuleAccordionItem, type ClassRowData } from "@/components/classroom/module-accordion";
import type { LessonActivityType } from "@/lib/classroom/types";

// Fila mínima de class_sessions usada por esta página. `title` y `status` se
// agregan en migraciones posteriores a la generación de tipos de Supabase, por
// eso se castean explícitamente (mismo patrón que [moduleSlug]/page.tsx).
type SessionRowLite = {
  id: string;
  module_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  title: string | null;
  lesson_id: string | null;
};

function fmtUnlock(iso: string) {
  return formatChile(iso, { day: "numeric", month: "short" });
}

function fmtSessionShort(iso: string) {
  return formatChile(iso, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CohortDashboardPage(
  props: { params: Promise<{ cohortSlug: string }> },
) {
  const { cohortSlug } = await props.params;

  const cohortId = await resolveCohortSlug(cohortSlug);
  if (!cohortId) notFound();

  const supabase = await createClient();
  const { data: { user } } = await getAuthUser();
  if (!user) redirect("/login");

  const [access, cohort] = await Promise.all([
    getClassroomAccess(user.id, cohortId),
    getCohortWithProgram(cohortId),
  ]);
  if (!access) notFound();
  if (!cohort) notFound();

  const program = cohort.programs as { id: string; name: string; code: string; description: string | null; total_modules: number | null } | null;
  // Los fallos transitorios (p.ej. timeout de BD) ya lanzan dentro de
  // getCohortWithProgram; si llegamos aquí sin program es un dato faltante real.
  if (!program) notFound();
  const modules = await getModulesWithLessons(program.id, access.enrollment?.id ?? null);

  // Clases en vivo (class_sessions) por módulo de ESTA cohorte. Para programas
  // híbridos/presenciales el contenido del módulo son sus sesiones del
  // calendario, no lecciones grabadas; sin esto el módulo mostraba "0 lecciones".
  const sessionsByModule = new Map<string, SessionRowLite[]>();
  const moduleIds = modules.map((m) => m.id);
  if (moduleIds.length > 0) {
    const { data: sessionRows } = await supabase
      .from("class_sessions")
      .select("id, module_id, starts_at, ends_at, status, title, lesson_id")
      .eq("cohort_id", cohortId)
      .in("module_id", moduleIds)
      .neq("status", "cancelled");
    for (const r of (sessionRows ?? []) as unknown as SessionRowLite[]) {
      if (r.module_id) {
        const list = sessionsByModule.get(r.module_id) ?? [];
        list.push(r);
        sessionsByModule.set(r.module_id, list);
      }
    }
  }
  const totalSessions = Array.from(sessionsByModule.values()).reduce((s, arr) => s + arr.length, 0);

  const now = new Date();
  let nextSession: SessionRowLite | null = null;
  for (const list of sessionsByModule.values()) {
    for (const s of list) {
      if (s.status !== "cancelled" && new Date(s.starts_at) > now) {
        if (!nextSession || new Date(s.starts_at) < new Date(nextSession.starts_at)) {
          nextSession = s;
        }
      }
    }
  }

  const totalModules = modules.length;

  const currentModule = modules.find((m) => {
    const p = calculateModuleProgress(m.lessons);
    return p.percentage > 0 && p.percentage < 100;
  });
  const currentLesson = currentModule?.lessons.find((l) => {
    const st = getLessonStatus(l);
    return st === "in_progress";
  });

  const firstAvailableModule = modules.find((m) =>
    m.lessons.some((l) => !l.unlock_at || new Date(l.unlock_at) <= new Date()),
  );
  const firstAvailableLesson = firstAvailableModule?.lessons.find(
    (l) => !l.unlock_at || new Date(l.unlock_at) <= new Date(),
  );

  const resume = currentModule && currentLesson
    ? { mod: currentModule, lesson: currentLesson, pct: currentLesson.video_progress?.watch_percentage ?? 0, label: "Continuar" as const }
    : firstAvailableModule && firstAvailableLesson
      ? { mod: firstAvailableModule, lesson: firstAvailableLesson, pct: 0, label: "Comenzar programa" as const }
      : null;

  // Por módulo: filas del acordeón (grabadas o en vivo) + métricas de progreso.
  // Numerador y denominador comparten universo (grabadas + sesiones): una clase
  // en vivo PASADA cuenta como completada por tiempo, igual que el check verde
  // que ya muestra su fila en el acordeón.
  const moduleRowsData = new Map<string, {
    rows: ClassRowData[];
    contentCount: number;
    completed: number;
    pct: number;
    moduleStatus: "completed" | "in_progress" | "available" | "locked";
  }>();
  for (const mod of modules) {
    const moduleSessions = (sessionsByModule.get(mod.id) ?? [])
      .slice()
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const contentCount = mod.lessons.length + moduleSessions.length;
    const pastSessions = moduleSessions.filter((s) => new Date(s.ends_at) < now).length;

    const lessonRows: ClassRowData[] = mod.lessons.map((lesson) => {
      const lessonStatus = getLessonStatus(lesson);
      const status: ClassRowData["status"] = lessonStatus === "no_video" ? "available" : lessonStatus;
      return {
        key: lesson.id,
        title: lesson.title,
        status,
        href: status === "locked" ? null : `/classroom/${cohortSlug}/${mod.slug ?? mod.id}/${lesson.slug ?? lesson.id}`,
        durationOrDate: fmtDuration(lesson.video_duration_seconds),
        unlockLabel: status === "locked" && lesson.unlock_at ? `Desde ${fmtUnlock(lesson.unlock_at)}` : undefined,
        activityType: lesson.activity_type as LessonActivityType,
      };
    });
    const sessionRows: ClassRowData[] = moduleSessions.map((session) => {
      const start = new Date(session.starts_at);
      const end = new Date(session.ends_at);
      const status: ClassRowData["status"] = end < now ? "completed" : start <= now && now <= end ? "in_progress" : "available";
      return {
        key: session.id,
        title: session.title ?? "Sin título",
        status,
        href: `/classroom/${cohortSlug}/clase/${session.id}`,
        durationOrDate: fmtUnlock(session.starts_at),
        hasRecording: Boolean(session.lesson_id),
      };
    });
    const rows: ClassRowData[] = [...lessonRows, ...sessionRows];

    const progress = calculateModuleProgress(mod.lessons);
    const isLocked = mod.lessons.length > 0 && mod.lessons.every((l) => l.unlock_at && new Date(l.unlock_at) > new Date());
    const completedCount = progress.completed_lessons + pastSessions;
    const pct = contentCount > 0 ? Math.round((100 * completedCount) / contentCount) : 0;
    const isCompleted = completedCount === contentCount && contentCount > 0;
    const hasProgress = completedCount > 0;
    const moduleStatus = isCompleted ? "completed" : hasProgress ? "in_progress" : isLocked ? "locked" : "available";

    moduleRowsData.set(mod.id, {
      rows,
      contentCount,
      completed: completedCount,
      pct,
      moduleStatus,
    });
  }

  const completedModules = Array.from(moduleRowsData.values()).filter(
    (d) => d.moduleStatus === "completed",
  ).length;
  const overallPct = totalModules > 0
    ? Math.round(
        Array.from(moduleRowsData.values()).reduce((s, d) => s + d.pct, 0) / totalModules,
      )
    : 0;

  const totalLessons = modules.reduce((s, m) => s + m.lessons.length, 0);
  // "Contenido" del programa = lecciones grabadas + clases en vivo agendadas.
  const totalContent = totalLessons + totalSessions;
  const completedLessons = Array.from(moduleRowsData.values()).reduce((s, d) => s + d.completed, 0);

  return (
    <div className="ca-fade-up mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 md:gap-8 md:px-8 md:py-8">
      {/* Hero compacto */}
      <section
        className="relative overflow-hidden text-white"
        style={{
          background: "linear-gradient(135deg, var(--color-ca-navy-ink) 0%, var(--color-ca-navy-deep) 70%, var(--color-ca-violet-deep) 100%)",
          borderRadius: 28,
        }}
      >
        <BrandShapes variant="hero" />
        <div className="relative flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-8 md:py-6">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] backdrop-blur">
              <span className="shape-circle ca-pulse h-1.5 w-1.5 bg-ca-lime" />
              {program.code} · {cohort.name}
            </div>
            <h1 className="truncate text-2xl font-black tracking-[-0.03em] md:text-3xl">
              {program.name}
            </h1>
            <div className="mt-1.5 text-sm text-white/60">
              {formatDateOnly(cohort.start_date, { day: "numeric", month: "short", year: "numeric" })}
              {" – "}
              {formatDateOnly(cohort.end_date, { day: "numeric", month: "short", year: "numeric" })}
              {" · "}
              {totalModules} {totalModules === 1 ? "módulo" : "módulos"} · {totalContent} {totalContent === 1 ? "clase" : "clases"}
            </div>
          </div>

          <div className="shrink-0 md:w-56">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/65">Tu progreso</div>
            <div className="mb-2 text-[28px] font-black leading-none">
              {overallPct}<span className="text-[16px] opacity-70">%</span>
            </div>
            <ProgressBar value={overallPct} height={6} color="bg-ca-lime" track="bg-white/15" />
          </div>
        </div>
      </section>

      {/* Banda "Continuar" */}
      {resume && (
        <section className="ca-card relative overflow-hidden" style={{ background: "var(--color-ca-ink)", borderColor: "transparent" }}>
          <div className="shape-circle absolute -right-10 -top-10 h-32 w-32 bg-ca-violet opacity-40" />
          <div className="relative flex items-center gap-4 px-5 py-4">
            <div className="relative hidden h-[54px] w-24 shrink-0 overflow-hidden rounded-lg bg-white/5 sm:block">
              {resume.lesson.mux_playback_id ? (
                <Image
                  src={`https://image.mux.com/${resume.lesson.mux_playback_id}/thumbnail.webp?time=10&width=192&height=108&fit_mode=smartcrop`}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              ) : (
                <>
                  <span className="shape-circle absolute -right-4 -top-4 h-12 w-12 bg-white/15" />
                  <span className="shape-circle absolute -bottom-3 -left-3 h-10 w-10 bg-ca-lime opacity-70" />
                </>
              )}
            </div>
            <div className="min-w-0 flex-1 text-white">
              <div className="mb-0.5 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/65">
                <span className="shape-circle ca-pulse h-1.5 w-1.5 bg-ca-lime" />
                {resume.label === "Continuar" ? "Retomar donde lo dejaste" : "Empieza tu programa"}
              </div>
              <div className="truncate text-[15px] font-extrabold tracking-tight">{resume.lesson.title}</div>
              <div className="truncate text-[12px] font-semibold text-white/60">
                Módulo {resume.mod.position} · {resume.mod.title}
              </div>
            </div>
            <Link
              href={`/classroom/${cohortSlug}/${resume.mod.slug ?? resume.mod.id}/${resume.lesson.slug ?? resume.lesson.id}`}
              className="ca-btn-lime inline-flex shrink-0 items-center gap-2 px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.08em]"
            >
              <svg width={14} height={14} viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4z" fill="currentColor" /></svg>
              {resume.label === "Continuar" ? "Reanudar" : "Comenzar"}
            </Link>
          </div>
        </section>
      )}

      {/* Ruta de aprendizaje: acordeón denso de 2 columnas + aside de progreso */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="order-2 flex flex-col gap-4 lg:order-1">
          <div>
            <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
              {totalModules} {totalModules === 1 ? "módulo" : "módulos"} · {totalContent} {totalContent === 1 ? "clase" : "clases"}
            </div>
            <h2 className="mt-1 text-[26px] font-black tracking-tight text-ca-ink">
              Tu ruta de aprendizaje
            </h2>
          </div>

          <div className="flex flex-col gap-3">
            {modules.map((mod) => {
              const data = moduleRowsData.get(mod.id)!;
              return (
                <ModuleAccordionItem
                  key={mod.id}
                  position={mod.position}
                  title={mod.title}
                  teacherName={mod.teacher?.full_name}
                  pct={data.pct}
                  completed={data.completed}
                  contentCount={data.contentCount}
                  moduleStatus={data.moduleStatus}
                  isCurrent={mod.id === (currentModule?.id ?? firstAvailableModule?.id)}
                  rows={data.rows}
                />
              );
            })}
          </div>
        </div>

        <aside className="order-1 lg:sticky lg:top-6 lg:order-2 lg:self-start">
          <div className="ca-card p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">Progreso general</div>
            <div className="mt-1 text-[32px] font-black leading-none text-ca-ink">
              {overallPct}<span className="text-[16px] font-bold text-ca-ink-soft">%</span>
            </div>
            <div className="mt-3">
              <ProgressBar value={overallPct} completed={overallPct === 100} />
            </div>
            <div className="mt-4 flex flex-col gap-2 text-[12px] font-semibold text-ca-ink-soft">
              <div className="flex items-center justify-between">
                <span>Clases</span>
                <span className="font-mono font-bold text-ca-ink">{completedLessons}/{totalContent}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Módulos</span>
                <span className="font-mono font-bold text-ca-ink">{completedModules}/{totalModules}</span>
              </div>
            </div>
            {nextSession && (
              <Link
                href={`/classroom/${cohortSlug}/calendario`}
                className="mt-4 block rounded-xl bg-ca-bg-soft px-3 py-2.5 text-[12px] font-bold text-ca-ink transition-colors hover:bg-ca-violet/10"
              >
                Próxima: {fmtSessionShort(nextSession.starts_at)}
              </Link>
            )}
          </div>
        </aside>
      </div>

    </div>
  );
}
