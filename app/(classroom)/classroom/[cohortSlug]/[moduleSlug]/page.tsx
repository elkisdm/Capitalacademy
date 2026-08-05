import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getAuthUser } from "@/lib/supabase/auth";
import {
  getModulesWithLessons,
  getCohortWithProgram,
  getModuleSessionsForCohort,
} from "@/lib/classroom/queries";
import { getClassroomAccess } from "@/lib/classroom/access";
import { getInstructorIdsByProfileIds } from "@/lib/instructors/queries";
import { resolveCohortSlug, resolveModuleSlug } from "@/lib/classroom/resolve-slugs";
import { calculateModuleProgress, getLessonStatus } from "@/lib/classroom/progress";
import {
  StatusPill,
  ProgressBar,
  Avatar,
  LessonStatusIcon,
  BrandShapes,
} from "@/components/classroom/primitives";
import type { LessonWithProgress, ScheduleSession } from "@/lib/classroom/types";
import { fmtDuration } from "@/lib/classroom/format";
import { ClassMaterial } from "@/components/classroom/class-material";

function ChapterRow({ lesson, index, cohortSlug, moduleSlug, isLast }: {
  lesson: LessonWithProgress;
  index: number;
  cohortSlug: string;
  moduleSlug: string;
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
          {lesson.cover_image_url ? (
            <Image
              src={lesson.cover_image_url}
              alt=""
              fill
              sizes="112px"
              className="object-cover"
              loading="lazy"
            />
          ) : lesson.mux_playback_id ? (
            <Image
              src={`https://image.mux.com/${lesson.mux_playback_id}/thumbnail.webp?time=30&width=224&height=128&fit_mode=smartcrop`}
              alt=""
              fill
              sizes="112px"
              className="object-cover"
              loading="lazy"
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
        <span className="mb-1 flex items-center gap-2 font-sans text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
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
        <span className="mt-2 flex items-center gap-2.5">
          <span className="block max-w-[280px] flex-1">
            <ProgressBar value={progress} completed={status === "completed"} />
          </span>
          <span
            className="font-mono text-[11px] font-bold"
            style={{ color: status === "completed" ? "var(--color-ca-lime-deep)" : progress > 0 ? "var(--color-ca-ink)" : "var(--color-ca-ink-soft)" }}
          >
            {status === "available" && progress === 0 ? "No iniciada" : `${Math.round(progress)}%`}
          </span>
        </span>
      </span>

      <span className="hidden shrink-0 sm:flex">
        {!isLocked && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold text-white transition-transform group-hover:scale-[1.03]"
            style={{ background: isActive ? "var(--color-ca-violet)" : status === "completed" ? "var(--color-ca-lime-deep)" : "var(--color-ca-ink)" }}
          >
            {status === "completed" ? "Revisar" : isActive ? "Continuar" : "Empezar"}
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        )}
      </span>
    </span>
  );

  if (isLocked) return <div className="border-b border-ca-ink/[0.08]">{inner}</div>;

  return (
    <Link href={`/classroom/${cohortSlug}/${moduleSlug}/${lesson.slug ?? lesson.id}`} prefetch={false} className="block border-b border-ca-ink/[0.08]" aria-label={`${isActive ? "Continuar" : status === "completed" ? "Revisar" : "Empezar"} lección: ${lesson.title}`}>
      {inner}
    </Link>
  );
}

const TZ = "America/Santiago";

const MODALITY_LABEL: Record<string, string> = {
  live_in_person: "Presencial",
  live_online: "Online",
  recorded: "Grabada",
};

function fmtSessionDate(iso: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function SessionRow({ session, isLast, cohortSlug }: { session: ScheduleSession; isLast: boolean; cohortSlug: string }) {
  const now = new Date();
  const start = new Date(session.starts_at);
  const end = new Date(session.ends_at);
  const isPast = end < now;
  const isLive = start <= now && now <= end;
  const classHref = `/classroom/${cohortSlug}/clase/${session.id}`;
  const hasRecording = Boolean(
    (session as unknown as { lesson_id?: string | null }).lesson_id,
  );

  const statusColor = isLive
    ? "bg-ca-lime text-ca-ink"
    : isPast
      ? "bg-ca-bg-soft text-ca-ink-soft"
      : "bg-ca-violet/10 text-ca-violet";
  const statusLabel = isLive ? "En curso" : isPast ? "Finalizada" : "Programada";

  return (
    <div className={`flex flex-col gap-3 px-6 py-5 ${!isLast ? "border-b border-ca-ink/[0.08]" : ""}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-sans text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
              {fmtSessionDate(session.starts_at)}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor}`}>
              {statusLabel}
            </span>
            <span className="rounded-full bg-ca-bg-soft px-2 py-0.5 text-[10px] font-bold text-ca-ink-soft">
              {MODALITY_LABEL[session.modality] ?? session.modality}
            </span>
          </div>
          <Link
            href={classHref}
            className="text-[15px] font-extrabold tracking-tight text-ca-ink transition-colors hover:text-ca-violet"
          >
            {(session as unknown as { title?: string }).title ?? "Sin título"}
          </Link>
          {session.teacher && (
            <Link
              href={`/classroom/${cohortSlug}/docente/${session.teacher.id}`}
              className="w-fit text-[12px] font-medium text-ca-ink-soft transition-colors hover:text-ca-violet hover:underline underline-offset-2"
            >
              {session.teacher.full_name}
            </Link>
          )}
        </div>
        {isLive && (session as unknown as { meeting_url?: string }).meeting_url && (
          <a
            href={(session as unknown as { meeting_url: string }).meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-ca-lime px-4 py-2 text-[12px] font-bold text-ca-ink transition-transform hover:scale-[1.02]"
          >
            Entrar
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
          </a>
        )}
      </div>
      {session.resources.length > 0 && <ClassMaterial resources={session.resources} />}
      <Link
        href={classHref}
        className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-ca-ink/[0.06] px-3 py-1.5 text-[11px] font-bold text-ca-ink transition-colors hover:bg-ca-ink hover:text-white"
      >
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 9l5 3-5 3z" />
        </svg>
        {hasRecording ? "Ver repetición" : "Ver clase"}
      </Link>
      {session.evaluation && session.status !== "cancelled" && (
        <Link
          href={`/classroom/quiz/${session.evaluation.id}`}
          className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-ca-violet/10 px-3 py-1.5 text-[11px] font-bold text-ca-violet transition-colors hover:bg-ca-violet hover:text-white"
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          Responder quiz
        </Link>
      )}
    </div>
  );
}

export default async function ModulePage(
  props: { params: Promise<{ cohortSlug: string; moduleSlug: string }> },
) {
  const { cohortSlug, moduleSlug } = await props.params;

  const [cohortId, moduleId] = await Promise.all([
    resolveCohortSlug(cohortSlug),
    resolveModuleSlug(moduleSlug),
  ]);
  if (!cohortId || !moduleId) notFound();

  const { data: { user } } = await getAuthUser();
  if (!user) redirect("/login");

  const [access, cohort] = await Promise.all([
    getClassroomAccess(user.id, cohortId),
    getCohortWithProgram(cohortId),
  ]);
  if (!access) notFound();
  if (!cohort) notFound();

  const program = cohort.programs as { id: string; name: string };
  const [modules, sessions] = await Promise.all([
    getModulesWithLessons(program.id, access.enrollment?.id ?? null),
    getModuleSessionsForCohort(cohortId, moduleId),
  ]);
  const mod = modules.find((m) => m.id === moduleId);
  if (!mod) notFound();

  // La card "Profesor" del módulo sale de `program_modules.teacher_id`, que
  // apunta a `profiles` y NO a `instructors` (ADR-0028 §4). Se resuelve el
  // puente por `profile_id` para poder enlazarla al perfil; si el docente no
  // tiene ficha visible en el catálogo, el nombre queda como texto plano.
  const teacherInstructorId = mod.teacher_id
    ? ((await getInstructorIdsByProfileIds([mod.teacher_id])).get(mod.teacher_id) ?? null)
    : null;

  const progress = calculateModuleProgress(mod.lessons);
  const isCompleted = progress.percentage === 100 && progress.total_lessons > 0;
  const status = isCompleted ? "completed" : progress.percentage > 0 ? "in_progress" : "available";
  const thumb = mod.position % 3 === 1 ? "thumb-diplomado" : mod.position % 3 === 2 ? "thumb-liderazgo" : "thumb-ruta";

  const prev = modules.find((m) => m.position === mod.position - 1);
  const next = modules.find((m) => m.position === mod.position + 1);

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      {/* Hero */}
      <section className="relative grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <nav className="flex items-center gap-2 text-[12px] font-semibold tracking-tight text-ca-ink-soft">
            <Link href={`/classroom/${cohortSlug}`} className="transition-colors hover:text-ca-violet">
              {program.name}
            </Link>
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            <span className="text-ca-ink">Módulo {String(mod.position).padStart(2, "0")}</span>
          </nav>

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
                {teacherInstructorId ? (
                  <Link
                    href={`/classroom/${cohortSlug}/docente/${teacherInstructorId}`}
                    className="text-[16px] font-extrabold tracking-tight text-ca-ink transition-colors hover:text-ca-violet hover:underline underline-offset-2"
                  >
                    {mod.teacher.full_name}
                  </Link>
                ) : (
                  <div className="text-[16px] font-extrabold tracking-tight text-ca-ink">{mod.teacher.full_name}</div>
                )}
              </div>
              <StatusPill status={status} />
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="ca-card flex items-center gap-3 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ca-violet/10 text-ca-violet">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>
              </span>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
                  {mod.lessons.length === 0 && sessions.length > 0 ? "Clases" : "Lecciones"}
                </div>
                <div className="font-mono text-[20px] font-black tracking-tight text-ca-ink">
                  {mod.lessons.length === 0 && sessions.length > 0 ? sessions.length : mod.lessons.length}
                </div>
              </div>
            </div>
            <div className="ca-card flex items-center gap-3 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ca-violet/10 text-ca-violet">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
              </span>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">Avance</div>
                <div className="font-mono text-[20px] font-black tracking-tight" style={{ color: isCompleted ? "var(--color-ca-lime-deep)" : "var(--color-ca-ink)" }}>{progress.percentage}%</div>
              </div>
            </div>
            <div className="ca-card flex items-center gap-3 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ca-lime-deep/10 text-ca-lime-text">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>
              </span>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">Completadas</div>
                <div className="font-mono text-[20px] font-black tracking-tight text-ca-ink">{progress.completed_lessons} / {progress.total_lessons}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={`relative overflow-hidden rounded-3xl ${thumb}`} style={{ minHeight: 240, background: undefined }}>
          <div className="shape-circle absolute -right-8 -top-8 h-40 w-40 bg-ca-violet opacity-85" />
          <div className="shape-half-right absolute -left-6 bottom-8 h-16 w-8 bg-ca-lime" />
          <div className="shape-circle absolute bottom-8 right-10 h-3 w-3 bg-ca-lime" />
          <div className="relative flex h-full flex-col justify-between p-6 text-white">
            <div className="flex items-baseline gap-3">
              <div className="font-black leading-none tracking-[-0.04em]" style={{ fontSize: 120 }}>
                {String(mod.position).padStart(2, "0")}
              </div>
              <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-white/65">Módulo</div>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/65">
                {progress.completed_lessons} de {progress.total_lessons} lecciones completadas
              </div>
              <ProgressBar value={progress.percentage} track="bg-white/15" color="bg-ca-lime" height={6} />
            </div>
          </div>
        </div>
      </section>

      {/* Lessons / Sessions */}
      {mod.lessons.length > 0 && (
        <section className="mt-10">
          <div className="mb-4">
            <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">Contenido</div>
            <h2 className="mt-1 text-[22px] font-black tracking-tight text-ca-ink">
              {mod.lessons.length} lecciones
            </h2>
          </div>
          <div className="ca-card divide-y divide-ca-ink/[0.08]">
            {mod.lessons.map((l, i) => (
              <div key={l.id} className="ca-fade-up ca-stagger" style={{ "--i": i } as React.CSSProperties}>
                <ChapterRow
                  lesson={l}
                  index={i}
                  cohortSlug={cohortSlug}
                  moduleSlug={moduleSlug}
                  isLast={i === mod.lessons.length - 1}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {sessions.length > 0 && (
        <section className="mt-10">
          <div className="mb-4">
            <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
              {mod.lessons.length > 0 ? "Clases en vivo" : "Contenido"}
            </div>
            <h2 className="mt-1 text-[22px] font-black tracking-tight text-ca-ink">
              {sessions.length} {sessions.length === 1 ? "clase" : "clases"}
            </h2>
          </div>
          <div className="ca-card overflow-hidden">
            {sessions.map((s, i) => (
              <SessionRow key={s.id} session={s} isLast={i === sessions.length - 1} cohortSlug={cohortSlug} />
            ))}
          </div>
        </section>
      )}

      {mod.lessons.length === 0 && sessions.length === 0 && (
        <section className="mt-10">
          <div className="ca-card grid place-items-center gap-2 p-12 text-center">
            <div
              className="mb-2 grid h-14 w-14 place-items-center rounded-2xl"
              style={{ background: "var(--color-ca-bg-soft)" }}
            >
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-ca-ink-soft">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              </svg>
            </div>
            <div className="text-[15px] font-bold text-ca-ink">Este módulo aún no tiene contenido disponible</div>
            <p className="text-[13px] text-ca-ink-soft">Las clases y materiales aparecerán aquí cuando sean publicados.</p>
          </div>
        </section>
      )}

      {/* Pager */}
      <section className="mt-10 grid gap-3 md:grid-cols-2">
        {prev ? (
          <Link href={`/classroom/${cohortSlug}/${prev.slug ?? prev.id}`} className="ca-card ca-card-hoverable p-5 text-left">
            <div className="flex items-center gap-2 font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              Anterior
            </div>
            <div className="mt-2 text-[15px] font-extrabold tracking-tight text-ca-ink">
              {prev.position}. {prev.title}
            </div>
          </Link>
        ) : <div />}
        {next ? (
          <Link href={`/classroom/${cohortSlug}/${next.slug ?? next.id}`} className="ca-card ca-card-hoverable p-5 text-right">
            <div className="flex items-center justify-end gap-2 font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
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
