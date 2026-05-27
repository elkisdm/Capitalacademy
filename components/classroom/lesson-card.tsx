import Link from "next/link";
import { Lock, Play, CheckCircle2, Circle, VideoOff } from "lucide-react";
import type { LessonWithProgress, LessonStatus } from "@/lib/classroom/types";
import { getLessonStatus } from "@/lib/classroom/progress";

const STATUS_CONFIG: Record<
  LessonStatus,
  { icon: typeof Play; label: string; color: string }
> = {
  completed: {
    icon: CheckCircle2,
    label: "Completada",
    color: "text-green-600",
  },
  in_progress: { icon: Play, label: "En progreso", color: "text-blue-600" },
  available: { icon: Circle, label: "Disponible", color: "text-gray-400" },
  locked: { icon: Lock, label: "Bloqueada", color: "text-gray-300" },
  no_video: { icon: VideoOff, label: "Próximamente", color: "text-gray-300" },
};

type LessonCardProps = {
  lesson: LessonWithProgress;
  cohortId: string;
  moduleId: string;
  index: number;
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function LessonCard({
  lesson,
  cohortId,
  moduleId,
  index,
}: LessonCardProps) {
  const status = getLessonStatus(lesson);
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const isClickable = status !== "locked" && status !== "no_video";

  const progress = lesson.video_progress?.watch_percentage ?? 0;

  const content = (
    <div
      className={`group flex items-center gap-4 rounded-lg border p-4 transition-colors ${
        isClickable
          ? "cursor-pointer border-gray-200 hover:border-blue-300 hover:bg-blue-50/50"
          : "cursor-not-allowed border-gray-100 bg-gray-50/50 opacity-60"
      }`}
    >
      <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-md bg-gray-100">
        {lesson.thumbnail_url ? (
          <img
            src={lesson.thumbnail_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <VideoOff className="h-6 w-6 text-gray-300" />
          </div>
        )}
        {status === "in_progress" && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-400">Lección {index + 1}</p>
        <h4 className="truncate font-medium text-gray-900">{lesson.title}</h4>
        {lesson.video_duration_seconds && (
          <p className="text-sm text-gray-500">
            {formatDuration(lesson.video_duration_seconds)}
          </p>
        )}
        {status === "locked" && lesson.unlock_at && (
          <p className="text-xs text-gray-400">
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
      href={`/classroom/${cohortId}/${moduleId}/${lesson.id}`}
      prefetch={false}
    >
      {content}
    </Link>
  );
}
