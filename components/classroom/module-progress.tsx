import type { ModuleProgress } from "@/lib/classroom/types";

type ModuleProgressBarProps = {
  progress: ModuleProgress;
  showLabel?: boolean;
};

export function ModuleProgressBar({
  progress,
  showLabel = true,
}: ModuleProgressBarProps) {
  const { completed_lessons, total_with_video, percentage } = progress;

  return (
    <div className="space-y-1">
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-green-500 transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-gray-500">
          {completed_lessons} de {total_with_video} lecciones completadas
        </p>
      )}
    </div>
  );
}
