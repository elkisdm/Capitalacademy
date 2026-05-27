"use client";

import { useState, useCallback } from "react";
import MuxPlayer from "@mux/mux-player-react";
import { useVideoProgress } from "@/lib/classroom/use-video-progress";

type VideoPlayerProps = {
  playbackId: string;
  lessonId: string;
  durationSeconds: number;
  initialPosition?: number;
  title?: string;
};

export function VideoPlayer({
  playbackId,
  lessonId,
  durationSeconds,
  initialPosition = 0,
  title,
}: VideoPlayerProps) {
  const [watchPercentage, setWatchPercentage] = useState(0);
  const [completed, setCompleted] = useState(false);

  const onProgressUpdate = useCallback(
    (data: { watchPercentage: number; completed: boolean }) => {
      setWatchPercentage(data.watchPercentage);
      setCompleted(data.completed);
    },
    [],
  );

  const { handleTimeUpdate, handlePause, handleEnded } = useVideoProgress({
    lessonId,
    durationSeconds,
    initialPosition,
    onProgressUpdate,
  });

  return (
    <div className="space-y-2">
      <MuxPlayer
        playbackId={playbackId}
        startTime={initialPosition}
        metadata={{ video_title: title }}
        accentColor="#22c55e"
        className="aspect-video w-full rounded-lg"
        onTimeUpdate={(e: Event) => {
          const target = e.target as HTMLMediaElement;
          handleTimeUpdate(target.currentTime);
        }}
        onPause={handlePause}
        onEnded={handleEnded}
      />

      <div className="flex items-center gap-3 text-sm text-gray-500">
        <div className="flex-1">
          <div className="h-1.5 w-full rounded-full bg-gray-200">
            <div
              className="h-1.5 rounded-full bg-green-500 transition-all duration-300"
              style={{ width: `${Math.min(watchPercentage, 100)}%` }}
            />
          </div>
        </div>
        <span className="shrink-0 tabular-nums">
          {Math.round(watchPercentage)}% visto
        </span>
        {completed && (
          <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            Completado
          </span>
        )}
      </div>
    </div>
  );
}
