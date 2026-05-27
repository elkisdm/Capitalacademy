import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getEnrollmentForUser,
  getLessonById,
  getLessonProgress,
  getModulesWithLessons,
  getCohortWithProgram,
} from "@/lib/classroom/queries";
import { getLessonStatus } from "@/lib/classroom/progress";
import { VideoPlayer } from "@/components/classroom/video-player";
import {
  StatusPill,
  ProgressBar,
  LessonStatusIcon,
  Breadcrumb,
  Avatar,
} from "@/components/classroom/primitives";
import { ResourceList } from "@/components/classroom/resource-list";
import type { LessonResource } from "@/lib/classroom/types";

function fmtDuration(seconds: number | null) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, "0")}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtTimePretty(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default async function LessonPage(
  props: { params: Promise<{ cohortId: string; moduleId: string; lessonId: string }> },
) {
  const { cohortId, moduleId, lessonId } = await props.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const enrollment = await getEnrollmentForUser(user.id, cohortId);
  if (!enrollment) notFound();

  const lesson = await getLessonById(lessonId);
  if (!lesson) notFound();

  const cohort = await getCohortWithProgram(cohortId);
  if (!cohort) notFound();

  const program = cohort.programs as { id: string; name: string };
  const modules = await getModulesWithLessons(program.id, enrollment.id);
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

  const progress = await getLessonProgress(enrollment.id, lessonId);

  const muxPlaybackId = (lesson as Record<string, unknown>).mux_playback_id as string | null;
  const videoDuration = (lesson as Record<string, unknown>).video_duration_seconds as number | null;

  const { data: resources } = await supabase
    .from("lesson_resources")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("position", { ascending: true });

  const watchPct = progress?.watch_percentage ?? 0;

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1600px] px-4 py-4 md:px-8 md:py-6">
      <div className="mb-5">
        <Breadcrumb items={[
          { label: program.name, onClick: undefined },
          { label: `Módulo ${String(currentModule?.position ?? 0).padStart(2, "0")}`, onClick: undefined },
          { label: `Lec. ${String(idx + 1).padStart(2, "0")} · ${lesson.title}` },
        ]} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT: video + meta + resources */}
        <div className="min-w-0">
          {muxPlaybackId && videoDuration ? (
            <VideoPlayer
              playbackId={muxPlaybackId}
              lessonId={lessonId}
              durationSeconds={videoDuration}
              initialPosition={progress?.playback_position_seconds ?? 0}
              title={lesson.title}
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

          {/* Title block */}
          <div className="mt-5 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                <span>Lección {String(idx + 1).padStart(2, "0")} de {siblingLessons.length}</span>
                <span className="opacity-40">·</span>
                <span>{fmtDuration(videoDuration)}</span>
                <span className="opacity-40">·</span>
                <StatusPill status={progress?.completed ? "completed" : progress ? "in_progress" : "available"} size="sm" />
              </div>
              <h1 className="text-[28px] font-black leading-tight tracking-tight text-ca-ink">
                {lesson.title}
              </h1>
              {lesson.description && (
                <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ca-ink-soft">
                  {lesson.description}
                </p>
              )}
            </div>
          </div>

          {/* Watch progress strip */}
          {videoDuration && (
            <div className="ca-card mt-5 flex items-center gap-4 p-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ca-violet/10 text-ca-violet">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-[12px] font-bold">
                  <span className="text-ca-ink">Visto: {Math.round(watchPct)}%</span>
                  <span className="font-mono text-ca-ink-soft">
                    {progress ? fmtTimePretty(progress.playback_position_seconds) : "00:00"} / {fmtTimePretty(videoDuration)} · Se marca completo al 90%
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar value={watchPct} showStripe height={6} />
                </div>
              </div>
            </div>
          )}

          {/* Resources */}
          {resources && resources.length > 0 && (
            <div className="mt-8">
              <div className="mb-4 border-b border-ca-ink/[0.08] pb-3">
                <span className="relative px-4 py-3 text-[13px] font-bold tracking-tight text-ca-ink">
                  Recursos
                  <span className="ml-1.5 rounded-full bg-ca-lime px-1.5 py-0.5 text-[10px] font-bold text-ca-ink">
                    {resources.length}
                  </span>
                  <span className="absolute inset-x-2 -bottom-px h-0.5 bg-ca-violet" />
                </span>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {((resources ?? []) as LessonResource[]).map((r) => {
                  const toneMap: Record<string, string> = { pdf: "#e11d48", link: "#5e17eb", template: "#a8d310", document: "#2a3287" };
                  const iconMap: Record<string, string> = { pdf: "M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M9 14h6M9 18h4", link: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.72M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71", template: "M3 3h18v18H3zM3 9h18M9 21V9" };
                  const tone = toneMap[r.type] ?? "#4a4f73";
                  const isExternal = r.type === "link";
                  return (
                    <a
                      key={r.id}
                      href={r.url}
                      target={isExternal ? "_blank" : undefined}
                      rel={isExternal ? "noopener noreferrer" : undefined}
                      download={!isExternal || undefined}
                      className="ca-card ca-card-hoverable group flex items-center gap-4 p-4"
                    >
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: `${tone}14`, color: tone }}>
                        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d={iconMap[r.type] ?? iconMap.pdf} />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold tracking-tight text-ca-ink">{r.title}</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ca-ink-soft">
                          {r.type === "link" ? "Link externo" : r.type === "template" ? "Plantilla editable" : r.type === "pdf" ? "PDF" : "Documento"}
                        </div>
                      </div>
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-ca-bg-soft text-ca-ink transition-transform group-hover:scale-110">
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d={isExternal ? "M5 12h14M12 5l7 7-7 7" : "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"} />
                        </svg>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Prev / Next */}
          <div className="mt-10 grid gap-3 md:grid-cols-2">
            {prevLesson ? (
              <Link href={`/classroom/${cohortId}/${moduleId}/${prevLesson.id}`} className="ca-card ca-card-hoverable p-4 text-left">
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
              <Link href={`/classroom/${cohortId}/${moduleId}/${nextLesson.id}`} className="ca-card ca-card-hoverable p-4 text-right">
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

        {/* RIGHT: playlist sidebar */}
        <div className="lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden">
          <aside className="ca-card flex h-full flex-col overflow-hidden">
            <div className="border-b border-ca-ink/[0.08] px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  Módulo {String(currentModule?.position ?? 0).padStart(2, "0")}
                </div>
                <span className="rounded-full bg-ca-bg-soft px-2 py-0.5 text-[10px] font-bold text-ca-ink">
                  {siblingLessons.filter((l) => getLessonStatus(l) === "completed").length}/{siblingLessons.length}
                </span>
              </div>
              <h3 className="mt-1 text-[15px] font-extrabold leading-tight tracking-tight text-ca-ink">
                {currentModule?.title}
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto">
              {siblingLessons.map((l, i) => {
                const st = getLessonStatus(l);
                const active = l.id === lessonId;
                const locked = st === "locked" || st === "no_video";
                return (
                  <Link
                    key={l.id}
                    href={locked ? "#" : `/classroom/${cohortId}/${moduleId}/${l.id}`}
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
                        Lec. {String(i + 1).padStart(2, "0")} · {l.video_duration_seconds ? `${Math.floor(l.video_duration_seconds / 60)} min` : "—"}
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
          </aside>
        </div>
      </div>
    </div>
  );
}
