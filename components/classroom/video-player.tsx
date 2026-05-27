"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
  const [playerMode, setPlayerMode] = useState<"mux" | "mp4" | "loading">("loading");
  const videoRef = useRef<HTMLVideoElement>(null);

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

  useEffect(() => {
    const mp4Url = `https://stream.mux.com/${playbackId}/medium.mp4`;
    fetch(mp4Url, { method: "HEAD" })
      .then((res) => {
        setPlayerMode(res.ok ? "mp4" : "mux");
      })
      .catch(() => {
        setPlayerMode("mux");
      });
  }, [playbackId]);

  useEffect(() => {
    if (playerMode === "mp4" && videoRef.current && initialPosition > 0) {
      videoRef.current.currentTime = initialPosition;
    }
  }, [playerMode, initialPosition]);

  if (playerMode === "loading") {
    return (
      <div className="video-stage flex aspect-video items-center justify-center rounded-[18px]">
        <div className="ca-spin-slow h-8 w-8 rounded-full border-2 border-white border-r-transparent" />
      </div>
    );
  }

  if (playerMode === "mp4") {
    return (
      <div className="space-y-2">
        <video
          ref={videoRef}
          controls
          className="aspect-video w-full rounded-[18px] bg-black"
          src={`https://stream.mux.com/${playbackId}/medium.mp4`}
          poster={`https://image.mux.com/${playbackId}/thumbnail.webp?time=30`}
          onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget.currentTime)}
          onPause={handlePause}
          onEnded={handleEnded}
        />
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--color-ca-ink-soft)" }}>
          <div className="flex-1">
            <div className="shape-circle h-1.5 w-full overflow-hidden" style={{ background: "var(--color-ca-ink, rgba(20,22,58,0.08))" }}>
              <div
                className="h-1.5 rounded-full bg-ca-violet transition-all duration-300"
                style={{ width: `${Math.min(watchPercentage, 100)}%` }}
              />
            </div>
          </div>
          <span className="shrink-0 font-mono text-[12px] tabular-nums">
            {Math.round(watchPercentage)}% visto
          </span>
          {completed && (
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(168,211,16,0.18)", color: "#3f5a05" }}>
              Completado
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <mux-player
          playback-id={playbackId}
          start-time={String(initialPosition)}
          stream-type="on-demand"
          accent-color="#5e17eb"
          className="aspect-video w-full rounded-[18px]"
          style={{ aspectRatio: "16/9", width: "100%", borderRadius: 18 }}
        />
      </div>
      <div className="flex items-center gap-3 text-sm" style={{ color: "var(--color-ca-ink-soft)" }}>
        <div className="flex-1">
          <div className="shape-circle h-1.5 w-full overflow-hidden" style={{ background: "var(--color-ca-ink, rgba(20,22,58,0.08))" }}>
            <div
              className="h-1.5 rounded-full bg-ca-violet transition-all duration-300"
              style={{ width: `${Math.min(watchPercentage, 100)}%` }}
            />
          </div>
        </div>
        <span className="shrink-0 font-mono text-[12px] tabular-nums">
          {Math.round(watchPercentage)}% visto
        </span>
        {completed && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(168,211,16,0.18)", color: "#3f5a05" }}>
            Completado
          </span>
        )}
      </div>
    </div>
  );
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "mux-player": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "playback-id"?: string;
          "start-time"?: string;
          "stream-type"?: string;
          "accent-color"?: string;
        },
        HTMLElement
      >;
    }
  }
}
