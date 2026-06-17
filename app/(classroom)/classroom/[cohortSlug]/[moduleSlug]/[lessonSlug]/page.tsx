import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getLessonById,
  getLessonProgress,
  getModulesWithLessons,
  getCohortWithProgram,
} from "@/lib/classroom/queries";
import { getClassroomAccess } from "@/lib/classroom/access";
import { resolveCohortSlug, resolveModuleSlug, resolveLessonSlug } from "@/lib/classroom/resolve-slugs";
import { getLessonStatus } from "@/lib/classroom/progress";
import { LessonVideoSection } from "@/components/classroom/lesson-video-section";
import {
  StatusPill,
  ProgressBar,
  LessonStatusIcon,
  Breadcrumb,
  Avatar,
} from "@/components/classroom/primitives";
import { CollapsiblePlaylist } from "@/components/classroom/collapsible-playlist";
import { VideoSyncProvider } from "@/components/classroom/video-sync-context";
import type { LessonResource } from "@/lib/classroom/types";
import { fmtDuration } from "@/lib/classroom/format";

export default async function LessonPage(
  props: { params: Promise<{ cohortSlug: string; moduleSlug: string; lessonSlug: string }> },
) {
  const { cohortSlug, moduleSlug, lessonSlug } = await props.params;

  const [cohortId, moduleId, lessonId] = await Promise.all([
    resolveCohortSlug(cohortSlug),
    resolveModuleSlug(moduleSlug),
    resolveLessonSlug(lessonSlug),
  ]);
  if (!cohortId || !moduleId || !lessonId) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await getClassroomAccess(user.id, cohortId);
  if (!access) notFound();
  const enrollmentId = access.enrollment?.id ?? null;

  const [lesson, cohort] = await Promise.all([
    getLessonById(lessonId),
    getCohortWithProgram(cohortId),
  ]);
  if (!lesson) notFound();
  if (!cohort) notFound();

  const program = cohort.programs as { id: string; name: string };
  const [modules, progress] = await Promise.all([
    getModulesWithLessons(program.id, enrollmentId),
    getLessonProgress(enrollmentId, lessonId),
  ]);
  const currentModule = modules.find((m) => m.id === moduleId);
  const siblingLessons = currentModule?.lessons ?? [];
  const idx = siblingLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = siblingLessons[idx - 1];
  const nextLesson = siblingLessons[idx + 1];

  if (lesson.unlock_at && new Date(lesson.unlock_at) > new Date()) {
    return (
      <div className="ca-fade-up mx-auto max-w-3xl px-8 py-8">
        <div className="flex flex-col items-center justify-center rounded-3xl border border-ca-ink/[0.08] bg-ca-surface p-16 text-center">
          <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-ca-ink-soft">
            <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" />
          </svg>
          <h2 className="mt-4 text-lg font-black text-ca-ink">Lección bloqueada</h2>
          <p className="mt-2 text-ca-ink-soft">
            Disponible el{" "}
            {new Date(lesson.unlock_at).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
      </div>
    );
  }

  const muxPlaybackId = (lesson as Record<string, unknown>).mux_playback_id as string | null;
  const videoDuration = (lesson as Record<string, unknown>).video_duration_seconds as number | null;

  const [
    { data: resources },
    { data: transcript },
    { data: summary },
    { data: chapters },
    { count: commentCount },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("lesson_resources")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("position", { ascending: true }),
    supabase
      .from("lesson_transcripts")
      .select("content_vtt, corrected_vtt")
      .eq("lesson_id", lessonId)
      .eq("status", "ready")
      .maybeSingle(),
    supabase
      .from("lesson_summaries")
      .select("key_points, summary_text, glossary, model_used, generated_at")
      .eq("lesson_id", lessonId)
      .maybeSingle(),
    supabase
      .from("lesson_chapters")
      .select("position_seconds, title")
      .eq("lesson_id", lessonId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("lesson_comments")
      .select("id", { count: "exact", head: true })
      .eq("lesson_id", lessonId),
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .single(),
  ]);

  const transcriptVtt = transcript?.content_vtt ?? null;
  const transcriptCorrectedVtt = transcript?.corrected_vtt ?? null;
  const watchPct = progress?.watch_percentage ?? 0;

  const userName = profile?.full_name ?? user.email ?? "Usuario";
  const userInitials = userName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1600px] px-4 py-4 md:px-8 md:py-6">
      <div className="mb-5">
        <Breadcrumb items={[
          { label: program.name, href: `/classroom/${cohortSlug}` },
          { label: `Módulo ${String(currentModule?.position ?? 0).padStart(2, "0")}`, href: `/classroom/${cohortSlug}/${moduleSlug}` },
          { label: `Lec. ${String(idx + 1).padStart(2, "0")} · ${lesson.title}` },
        ]} />
      </div>

      {/* Title block — above the video */}
      <div className="mb-4 flex flex-col gap-3 md:mb-5 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft md:gap-2">
            <span>Lección {String(idx + 1).padStart(2, "0")} de {siblingLessons.length}</span>
            <span className="opacity-40">·</span>
            <span>{fmtDuration(videoDuration)}</span>
            <span className="opacity-40">·</span>
            <StatusPill status={progress?.completed ? "completed" : (progress && watchPct > 0) ? "in_progress" : "available"} size="sm" />
          </div>
          <h1 className="text-[22px] font-black leading-tight tracking-tight text-ca-ink md:text-[28px]">
            {lesson.title}
          </h1>
          {lesson.description && (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ca-ink-soft md:mt-2 md:text-[14px]">
              {lesson.description}
            </p>
          )}
        </div>
        {currentModule?.teacher?.full_name && (
          <div className="flex shrink-0 items-center gap-2.5">
            <Avatar initials={currentModule.teacher.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()} size={32} />
            <div className="md:text-right">
              <div className="text-[13px] font-bold tracking-tight text-ca-ink">{currentModule.teacher.full_name}</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ca-ink-soft">Instructor</div>
            </div>
          </div>
        )}
      </div>

      <VideoSyncProvider>
      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        {/* LEFT: video + meta + resources */}
        <div className="min-w-0">
          {muxPlaybackId && videoDuration ? (
            <LessonVideoSection
              playbackId={muxPlaybackId}
              lessonId={lessonId}
              lessonTitle={lesson.title}
              durationSeconds={videoDuration}
              initialPosition={progress?.playback_position_seconds ?? 0}
              initialWatchPercentage={watchPct}
              initialCompleted={progress?.completed ?? false}
              resources={(resources ?? []) as LessonResource[]}
              summary={summary ? {
                key_points: (summary.key_points ?? []) as string[],
                summary_text: summary.summary_text ?? "",
                glossary: (summary.glossary ?? []) as { term: string; definition: string }[],
                model_used: summary.model_used ?? "",
                generated_at: summary.generated_at ?? "",
              } : null}
              chapters={(chapters ?? []) as { position_seconds: number; title: string }[]}
              commentCount={commentCount ?? 0}
              currentUserId={user.id}
              currentUserName={userName}
              currentUserInitials={userInitials}
              currentUserAvatarUrl={profile?.avatar_url ?? null}
              hasTranscript={!!transcriptVtt}
            />
          ) : (
            <div className="video-stage flex aspect-video items-center justify-center rounded-[18px]">
              <div className="max-w-xl text-center">
                <div className="mb-4 mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/10">
                  <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5" />
                  </svg>
                </div>
                <h2 className="text-[28px] font-black leading-[1.05] tracking-tight text-white md:text-[36px]">
                  {lesson.title}
                </h2>
                <p className="mt-3 text-[13px] font-semibold text-white/55">
                  Video disponible próximamente
                </p>
                {currentModule?.teacher?.full_name && (
                  <div className="mt-4 flex items-center justify-center gap-2.5 text-white/70">
                    <Avatar initials={currentModule.teacher.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()} size={32} />
                    <span className="text-[13px] font-semibold">{currentModule.teacher.full_name}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Prev / Next */}
          <div className="mt-10 grid gap-3 md:grid-cols-2">
            {prevLesson ? (
              <Link href={`/classroom/${cohortSlug}/${moduleSlug}/${prevLesson.slug ?? prevLesson.id}`} className="ca-card ca-card-hoverable p-4 text-left">
                <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                  Anterior
                </div>
                <div className="mt-1 text-[14px] font-extrabold tracking-tight text-ca-ink">
                  Lec. {String(idx).padStart(2, "0")} · {prevLesson.title}
                </div>
              </Link>
            ) : <div />}
            {nextLesson ? (
              <Link href={`/classroom/${cohortSlug}/${moduleSlug}/${nextLesson.slug ?? nextLesson.id}`} className="ca-card ca-card-hoverable p-4 text-right">
                <div className="flex items-center justify-end gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  Siguiente
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </div>
                <div className="mt-1 text-[14px] font-extrabold tracking-tight text-ca-ink">
                  Lec. {String(idx + 2).padStart(2, "0")} · {nextLesson.title}
                </div>
              </Link>
            ) : <div />}
          </div>
        </div>

        {/* RIGHT: playlist sidebar (collapsible) */}
        <CollapsiblePlaylist
          lessonCount={siblingLessons.length}
          completedCount={siblingLessons.filter((l) => getLessonStatus(l) === "completed").length}
          moduleTitle={currentModule?.title ?? ""}
          modulePosition={currentModule?.position ?? 0}
          transcriptVtt={transcriptVtt}
          correctedVtt={transcriptCorrectedVtt}
        >
          {/* Module title (inside expanded header) */}
          <div className="px-5 pb-3">
            <span className="rounded-full bg-ca-bg-soft px-2 py-0.5 text-[10px] font-bold text-ca-ink">
              {siblingLessons.filter((l) => getLessonStatus(l) === "completed").length}/{siblingLessons.length}
            </span>
            <h3 className="mt-1 text-[15px] font-extrabold leading-tight tracking-tight text-ca-ink">
              {currentModule?.title}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto">
            {siblingLessons.map((l, i) => {
              const st = getLessonStatus(l);
              const active = l.id === lessonId;
              const locked = st === "locked";
              return (
                <Link
                  key={l.id}
                  href={locked ? "#" : `/classroom/${cohortSlug}/${moduleSlug}/${l.slug ?? l.id}`}
                  prefetch={false}
                  className={`group relative flex w-full items-start gap-3 border-b border-ca-ink/[0.08] px-4 py-3.5 text-left transition-colors ${
                    locked ? "cursor-not-allowed" : "hover:bg-ca-bg-soft"
                  }`}
                  style={{ background: active ? "rgba(94,23,235,0.06)" : "transparent" }}
                  aria-disabled={locked}
                  tabIndex={locked ? -1 : undefined}
                >
                  {active && <span className="absolute inset-y-3 left-0 w-1 rounded-r bg-ca-violet" />}
                  <div className="shrink-0"><LessonStatusIcon status={st} size={28} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
                      Lec. {String(i + 1).padStart(2, "0")} · {fmtDuration(l.video_duration_seconds)}
                    </div>
                    <div className={`mt-0.5 text-[13px] font-bold leading-snug ${locked ? "text-ca-ink-soft" : "text-ca-ink"}`}>
                      {l.title}
                    </div>
                    {st === "in_progress" && l.video_progress && (
                      <div className="mt-2"><ProgressBar value={l.video_progress.watch_percentage} height={3} /></div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="border-t border-ca-ink/[0.08] bg-ca-bg-soft px-5 py-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-ca-ink-soft">
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21 12a9 9 0 11-3-6.7L21 8" /><path d="M21 3v5h-5" />
              </svg>
              Tu progreso se guarda automáticamente
            </div>
          </div>
        </CollapsiblePlaylist>
      </div>
      </VideoSyncProvider>
    </div>
  );
}
