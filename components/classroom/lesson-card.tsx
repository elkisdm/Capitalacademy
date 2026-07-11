import Link from "next/link";
import Image from "next/image";
import type { LessonWithProgress, LessonStatus } from "@/lib/classroom/types";
import { getLessonStatus } from "@/lib/classroom/progress";
import { fmtDuration } from "@/lib/classroom/format";

/* ── Inline SVG icons (matches classroom design pattern) ─────── */

type IconProps = { size?: number; className?: string };

function PlayIcon({ size = 20, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function CheckCircleIcon({ size = 20, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function CircleIcon({ size = 20, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function LockIcon({ size = 20, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function VideoOffIcon({ size = 20, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.66 5H14a2 2 0 012 2v2.34l1 1L22 7v10" />
      <path d="M16 16a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2h1.34" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

type StatusIcon = (props: IconProps) => React.ReactNode;

const STATUS_CONFIG: Record<
  LessonStatus,
  { icon: StatusIcon; label: string; color: string }
> = {
  completed: {
    icon: CheckCircleIcon,
    label: "Completada",
    color: "text-ca-lime-text",
  },
  in_progress: { icon: PlayIcon, label: "En progreso", color: "text-ca-violet" },
  available: { icon: CircleIcon, label: "Disponible", color: "text-ca-ink-soft" },
  locked: { icon: LockIcon, label: "Bloqueada", color: "text-ca-ink-soft/60" },
  no_video: { icon: VideoOffIcon, label: "Próximamente", color: "text-ca-ink-soft/60" },
};

type LessonCardProps = {
  lesson: LessonWithProgress;
  cohortSlug: string;
  moduleSlug: string;
  index: number;
};

export function LessonCard({
  lesson,
  cohortSlug,
  moduleSlug,
  index,
}: LessonCardProps) {
  const status = getLessonStatus(lesson);
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const isClickable = status !== "locked" && status !== "no_video";

  const progress = lesson.video_progress?.watch_percentage ?? 0;

  const content = (
    <div
      className={`group flex items-center gap-4 rounded-lg border p-4 ${
        isClickable
          ? "cursor-pointer border-ca-ink/[0.08] transition-[transform,box-shadow,border-color,background] duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:border-ca-violet/30 hover:bg-ca-violet/[0.04] hover:shadow-[0_8px_24px_rgba(20,22,58,0.08)] active:translate-y-0 active:shadow-none active:duration-[60ms]"
          : "cursor-not-allowed border-ca-ink/[0.06] bg-ca-bg-soft/50 opacity-60"
      }`}
    >
      <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-md bg-ca-bg-soft">
        {lesson.thumbnail_url ? (
          <Image
            src={lesson.thumbnail_url}
            alt={lesson.title}
            fill
            sizes="144px"
            className="object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ca-ink-soft/60">
            <VideoOffIcon size={24} />
          </div>
        )}
        {status === "in_progress" && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-ca-ink/[0.08]">
            <div
              className="h-full bg-ca-violet transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs text-ca-ink-soft">Lección {index + 1}</p>
        <h4 className="truncate font-medium text-ca-ink">{lesson.title}</h4>
        {lesson.video_duration_seconds && (
          <p className="text-sm text-ca-ink-soft">
            {fmtDuration(lesson.video_duration_seconds)}
          </p>
        )}
        {status === "locked" && lesson.unlock_at && (
          <p className="text-xs text-ca-ink-soft">
            Disponible{" "}
            {new Date(lesson.unlock_at).toLocaleDateString("es-CL", {
              day: "numeric",
              month: "short",
            })}
          </p>
        )}
      </div>

      <div className={`shrink-0 ${config.color}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  );

  if (!isClickable) return content;

  return (
    <Link
      href={`/classroom/${cohortSlug}/${moduleSlug}/${lesson.slug ?? lesson.id}`}
      prefetch={false}
    >
      {content}
    </Link>
  );
}
