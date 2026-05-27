import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getEnrollmentForUser,
  getModulesWithLessons,
  getCohortWithProgram,
} from "@/lib/classroom/queries";
import { calculateModuleProgress, getLessonStatus } from "@/lib/classroom/progress";
import {
  StatusPill,
  ProgressBar,
  Avatar,
  LessonStatusIcon,
  Breadcrumb,
  BrandShapes,
} from "@/components/classroom/primitives";
import type { LessonWithProgress } from "@/lib/classroom/types";
import { fmtDuration } from "@/lib/classroom/format";

function ChapterRow({ lesson, index, cohortId, moduleId, isLast }: {
  lesson: LessonWithProgress;
  index: number;
  cohortId: string;
  moduleId: string;
  isLast: boolean;
}) {
  const status = getLessonStatus(lesson);
  const isLocked = status === "locked";
  const isActive = status === "in_progress";
  const progress = lesson.video_progress?.watch_percentage ?? 0;

  const inner = (
    <span
      className={`group relative flex w-full items-center gap-5 px-6 py-5 text-left transition-colors ${
        isLocked ? "cursor-not-allowed" : "cursor-pointer hover:bg-ca-bg-soft"
      }`}
      style={{ background: isActive ? "rgba(94,23,235,0.04)" : "transparent" }}
    >
      <span className="relative flex shrink-0 flex-col items-center">
        <LessonStatusIcon status={status} size={36} />
        {!isLast && (
          <span
            className="mt-2 h-12 w-0.5"
            style={{ background: status === "completed" ? "var(--color-ca-lime-deep)" : "var(--color-ca-outline, rgba(20,22,58,0.08))" }}
          />
        )}
      </span>

      <span className="hidden sm:block">
        <span
          className={`relative block h-16 w-28 overflow-hidden rounded-xl bg-ca-ink/5`}
          style={{ filter: isLocked ? "grayscale(0.7) brightness(0.7)" : "none" }}
        >
          {lesson.mux_playback_id ? (
            <img
              src={`https://image.mux.com/${lesson.mux_playback_id}/thumbnail.webp?time=30&width=224&height=128&fit_mode=smartcrop`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <>
              <span className="shape-circle absolute -right-2 -top-2 h-8 w-8 bg-white/15" />
              <span className="shape-circle absolute -bottom-2 -left-2 h-8 w-8 bg-ca-lime opacity-70" />
            </>
          )}
          <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
            {fmtDuration(lesson.video_duration_seconds)}
          </span>
          {isLocked && (
            <span className="absolute inset-0 grid place-items-center bg-black/40">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" />
              </svg>
            </span>
          )}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="mb-1 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
          <span>Lección {String(index + 1).padStart(2, "0")}</span>
          <span className="opacity-40">·</span>
          <span>{lesson.kind === "recorded" ? "Video" : lesson.kind === "live_in_person" ? "Presencial" : "Online"}</span>
        </span>
        <span
          className="block text-[15px] font-bold leading-tight tracking-tight"
          style={{ color: isLocked ? "var(--color-ca-ink-soft)" : "var(--color-ca-ink)" }}
        >
          {lesson.title}
        </span>
        {(isActive || status === "completed" || progress > 0) && (
          <span className="mt-2 flex items-center gap-2.5">
            <span className="block max-w-[280px] flex-1">
              <ProgressBar value={progress} completed={status === "completed"} />
            </span>
            <span
              className="font-mono text-[10px] font-bold"
              style={{ color: status === "completed" ? "var(--color-ca-lime-deep)" : "var(--color-ca-ink-soft)" }}
            >
              {Math.round(progress)}%
            </span>
          </span>
        )}
      </span>

      <span className="hidden shrink-0 items-center gap-3 sm:flex">
        <span className="text-right">
          <span className="block font-mono text-[11px] font-bold text-ca-ink">{fmtDuration(lesson.video_duration_seconds)}</span>
        </span>
        {!isLocked && (
          <span
            className="grid h-10 w-10 place-items-center rounded-full text-white transition-transform group-hover:scale-110"
            style={{ background: isActive ? "var(--color-ca-violet)" : "var(--color-ca-ink)" }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        )}
      </span>
    </span>
  );

  if (isLocked) return <div className="border-b border-ca-ink/[0.08]">{inner}</div>;

  return (
    <Link href={`/classroom/${cohortId}/${moduleId}/${lesson.id}`} prefetch={false} className="block border-b border-ca-ink/[0.08]">
      {inner}
    </Link>
  );
}

export default async function ModulePage(
  props: { params: Promise<{ cohortId: string; moduleId: string }> },
) {
  const { cohortId, moduleId } = await props.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const enrollment = await getEnrollmentForUser(user.id, cohortId);
  if (!enrollment) notFound();

  const cohort = await getCohortWithProgram(cohortId);
  if (!cohort) notFound();

  const program = cohort.programs as { id: string; name: string };
  const modules = await getModulesWithLessons(program.id, enrollment.id);
  const mod = modules.find((m) => m.id === moduleId);
  if (!mod) notFound();

  const progress = calculateModuleProgress(mod.lessons);
  const isCompleted = progress.percentage === 100 && progress.total_with_video > 0;
  const status = isCompleted ? "completed" : progress.percentage > 0 ? "in_progress" : "available";
  const thumb = mod.position % 3 === 1 ? "thumb-diplomado" : mod.position % 3 === 2 ? "thumb-liderazgo" : "thumb-ruta";

  const prev = modules.find((m) => m.position === mod.position - 1);
  const next = modules.find((m) => m.position === mod.position + 1);

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      {/* Hero */}
      <section className="relative grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <Breadcrumb items={[
            { label: program.name, onClick: undefined },
            { label: `Módulo ${String(mod.position).padStart(2, "0")}` },
          ]} />

          <h1 className="mt-3 text-[28px] font-black leading-[1] tracking-[-0.035em] text-ca-ink md:text-[42px]">
            {mod.title}
          </h1>
          {mod.description && (
            <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ca-ink-soft">{mod.description}</p>
          )}

          {mod.teacher?.full_name && (
            <div className="ca-card mt-6 flex items-center gap-4 p-4">
              <Avatar initials={mod.teacher.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()} size={56} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">Profesor</div>
                <div className="text-[16px] font-extrabold tracking-tight text-ca-ink">{mod.teacher.full_name}</div>
              </div>
              <StatusPill status={status} />
            </div>
          )}

          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { label: "Lecciones", value: `${mod.lessons.length}` },
              { label: "Avance", value: `${progress.percentage}%`, accent: true },
              { label: "Completadas", value: `${progress.completed_lessons}` },
            ].map((m) => (
              <div key={m.label} className="ca-card p-4 text-left">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">{m.label}</div>
                <div
                  className="mt-1 font-mono text-[24px] font-black tracking-tight"
                  style={{ color: m.accent && isCompleted ? "var(--color-ca-lime-deep)" : "var(--color-ca-ink)" }}
                >
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`relative overflow-hidden rounded-3xl ${thumb}`} style={{ minHeight: 340, background: undefined }}>
          <div className="shape-circle absolute -right-12 -top-12 h-56 w-56 bg-ca-violet opacity-85" />
          <div className="shape-half-right absolute -left-8 bottom-12 h-24 w-12 bg-ca-lime" />
          <div className="shape-circle absolute bottom-10 right-14 h-4 w-4 bg-ca-lime" />
          <div className="relative flex h-full flex-col justify-between p-7 text-white">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white/65">Módulo</div>
              <div className="mt-2 font-black leading-none tracking-[-0.04em]" style={{ fontSize: 200 }}>
                {String(mod.position).padStart(2, "0")}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/65">
                {progress.completed_lessons} de {progress.total_lessons} lecciones completadas
              </div>
              <ProgressBar value={progress.percentage} track="bg-white/15" color="bg-ca-lime" height={8} />
            </div>
          </div>
        </div>
      </section>

      {/* Lessons timeline */}
      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">Contenido</div>
            <h2 className="mt-1 text-[22px] font-black tracking-tight text-ca-ink">
              {mod.lessons.length} lecciones
            </h2>
          </div>
        </div>

        <div className="ca-card divide-y divide-ca-ink/[0.08]">
          {mod.lessons.map((l, i) => (
            <ChapterRow
              key={l.id}
              lesson={l}
              index={i}
              cohortId={cohortId}
              moduleId={moduleId}
              isLast={i === mod.lessons.length - 1}
            />
          ))}
        </div>
      </section>

      {/* Pager */}
      <section className="mt-10 grid gap-3 md:grid-cols-2">
        {prev ? (
          <Link href={`/classroom/${cohortId}/${prev.id}`} className="ca-card ca-card-hoverable p-5 text-left">
            <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              Anterior
            </div>
            <div className="mt-2 text-[15px] font-extrabold tracking-tight text-ca-ink">
              {prev.position}. {prev.title}
            </div>
          </Link>
        ) : <div />}
        {next ? (
          <Link href={`/classroom/${cohortId}/${next.id}`} className="ca-card ca-card-hoverable p-5 text-right">
            <div className="flex items-center justify-end gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
              Siguiente
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </div>
            <div className="mt-2 text-[15px] font-extrabold tracking-tight text-ca-ink">
              {next.position}. {next.title}
            </div>
          </Link>
        ) : <div />}
      </section>
    </div>
  );
}
