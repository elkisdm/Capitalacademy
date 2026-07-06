import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import {
  getSessionForStudent,
  getLessonProgress,
  getCohortWithProgram,
} from "@/lib/classroom/queries";
import { getClassroomAccess } from "@/lib/classroom/access";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { LessonVideoSection } from "@/components/classroom/lesson-video-section";
import { EvaluationRunner } from "@/components/classroom/evaluation/evaluation-runner";
import { VideoSyncProvider } from "@/components/classroom/video-sync-context";
import { Breadcrumb, Avatar } from "@/components/classroom/primitives";
import type { SessionResourceType } from "@/lib/classroom/types";

const TZ = "America/Santiago";

const MODALITY_LABEL: Record<string, string> = {
  live_in_person: "Presencial",
  live_online: "Online",
  recorded: "Grabada",
};

const RESOURCE_ICON: Record<SessionResourceType | "other", string> = {
  pdf: "📄",
  link: "🔗",
  template: "📋",
  document: "📝",
  other: "📎",
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

export default async function ClassSessionPage(
  props: { params: Promise<{ cohortSlug: string; sessionId: string }> },
) {
  const { cohortSlug, sessionId } = await props.params;

  const cohortId = await resolveCohortSlug(cohortSlug);
  if (!cohortId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const access = await getClassroomAccess(user.id, cohortId);
  if (!access) notFound();
  const enrollmentId = access.enrollment?.id ?? null;

  const [session, cohort] = await Promise.all([
    getSessionForStudent(sessionId),
    getCohortWithProgram(cohortId),
  ]);
  if (!session || !cohort) notFound();
  // Defensa en profundidad sobre la RLS: la sesión debe pertenecer a la cohorte
  // de la URL (evita entrar a una clase de otra cohorte por id directo).
  if (session.cohort_id !== cohortId) notFound();

  const program = cohort.programs as { id: string; name: string };
  const title = (session as { title?: string | null }).title ?? "Clase en vivo";

  const now = new Date();
  const start = new Date(session.starts_at);
  const end = new Date(session.ends_at);
  const isLive = start <= now && now <= end;
  const isUpcoming = start > now;
  const meetingUrl = (session as { meeting_url?: string | null }).meeting_url ?? null;

  const recording = session.recording;
  const hasVideo = !!(recording?.mux_playback_id && recording.video_duration_seconds);

  // Datos auxiliares de la repetición (mismas fuentes que el reproductor de
  // lección): se cargan solo si hay video listo.
  let videoBlock: React.ReactNode = null;
  if (hasVideo && recording) {
    const [
      progress,
      { data: resources },
      { data: transcript },
      { data: summary },
      { data: chapters },
      { count: commentCount },
      { data: profile },
    ] = await Promise.all([
      getLessonProgress(enrollmentId, recording.id),
      supabase
        .from("lesson_resources")
        .select("*")
        .eq("lesson_id", recording.id)
        .order("position", { ascending: true }),
      supabase
        .from("lesson_transcripts")
        .select("content_vtt, corrected_vtt")
        .eq("lesson_id", recording.id)
        .eq("status", "ready")
        .maybeSingle(),
      supabase
        .from("lesson_summaries")
        .select("key_points, summary_text, glossary, model_used, generated_at")
        .eq("lesson_id", recording.id)
        .maybeSingle(),
      supabase
        .from("lesson_chapters")
        .select("position_seconds, title")
        .eq("lesson_id", recording.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("lesson_comments")
        .select("id", { count: "exact", head: true })
        .eq("lesson_id", recording.id),
      supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .single(),
    ]);

    const userName = profile?.full_name ?? user.email ?? "Usuario";
    const userInitials = userName
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    videoBlock = (
      <VideoSyncProvider>
        <LessonVideoSection
          playbackId={recording.mux_playback_id!}
          lessonId={recording.id}
          lessonTitle={title}
          durationSeconds={recording.video_duration_seconds!}
          initialPosition={progress?.playback_position_seconds ?? 0}
          initialWatchPercentage={progress?.watch_percentage ?? 0}
          initialCompleted={progress?.completed ?? false}
          resources={resources ?? []}
          summary={
            summary
              ? {
                  key_points: (summary.key_points ?? []) as string[],
                  summary_text: summary.summary_text ?? "",
                  glossary: (summary.glossary ?? []) as {
                    term: string;
                    definition: string;
                  }[],
                  model_used: summary.model_used ?? "",
                  generated_at: summary.generated_at ?? "",
                }
              : null
          }
          chapters={(chapters ?? []) as { position_seconds: number; title: string }[]}
          commentCount={commentCount ?? 0}
          currentUserId={user.id}
          currentUserName={userName}
          currentUserInitials={userInitials}
          currentUserAvatarUrl={profile?.avatar_url ?? null}
          hasTranscript={!!transcript?.content_vtt}
        />
      </VideoSyncProvider>
    );
  }

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1200px] px-4 py-4 md:px-8 md:py-6">
      <div className="mb-5">
        <Breadcrumb
          items={[
            { label: program.name, href: `/classroom/${cohortSlug}` },
            { label: "Calendario", href: `/classroom/${cohortSlug}/calendario` },
            { label: title },
          ]}
        />
      </div>

      {/* Header de la clase */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft md:gap-2">
            <span>{fmtSessionDate(session.starts_at)}</span>
            <span className="opacity-40">·</span>
            <span>{MODALITY_LABEL[session.modality] ?? session.modality}</span>
          </div>
          <h1 className="text-[22px] font-black leading-tight tracking-tight text-ca-ink md:text-[28px]">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {(isLive || isUpcoming) && meetingUrl && (
            <a
              href={meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-ca-lime px-4 py-2 text-[12px] font-bold text-ca-ink transition-transform hover:scale-[1.02]"
            >
              Entrar a la clase
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            </a>
          )}
          {session.teacher?.full_name && (
            <div className="flex items-center gap-2.5">
              <Avatar initials={session.teacher.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()} size={32} />
              <div className="md:text-right">
                <div className="text-[13px] font-bold tracking-tight text-ca-ink">{session.teacher.full_name}</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ca-ink-soft">Instructor</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Repetición */}
      <section>
        <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Repetición
        </div>
        {hasVideo ? (
          videoBlock
        ) : (
          <div className="video-stage flex aspect-video items-center justify-center rounded-[18px]">
            <div className="max-w-xl text-center">
              <div className="mb-4 mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/10">
                <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5" />
                </svg>
              </div>
              <h2 className="text-[22px] font-black leading-[1.05] tracking-tight text-white md:text-[28px]">
                Aún no hay repetición
              </h2>
              <p className="mt-3 text-[13px] font-semibold text-white/55">
                {isUpcoming
                  ? "La grabación estará disponible después de la clase."
                  : "La grabación se publicará pronto."}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Material de la clase */}
      {session.resources.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
            Material de la clase
          </div>
          <div className="flex flex-wrap gap-2">
            {session.resources.map((r) => (
              <a
                key={r.id}
                href={r.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={r.url ? undefined : true}
                className={`inline-flex items-center gap-1.5 rounded-xl border border-ca-ink/[0.1] bg-ca-surface px-3 py-1.5 text-[12px] font-bold text-ca-ink transition-colors hover:border-ca-violet hover:text-ca-violet${r.url ? "" : " pointer-events-none opacity-60"}`}
              >
                <span>{RESOURCE_ICON[r.type] ?? RESOURCE_ICON.other}</span>
                {r.title}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Quiz de la clase */}
      {session.evaluation && (
        <section className="mt-8">
          <EvaluationRunner
            evaluationId={session.evaluation.id}
            title={session.evaluation.title}
          />
        </section>
      )}
    </div>
  );
}
