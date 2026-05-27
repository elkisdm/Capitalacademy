"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Hls from "hls.js";
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
}: VideoPlayerProps) {
  const [watchPercentage, setWatchPercentage] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

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

  const hlsUrl = `https://stream.mux.com/${playbackId}.m3u8`;
  const posterUrl = `https://image.mux.com/${playbackId}/thumbnail.webp?time=30`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.addEventListener("loadedmetadata", () => {
        if (initialPosition > 0) video.currentTime = initialPosition;
      }, { once: true });
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ startPosition: initialPosition });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError(true);
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    setError(true);
  }, [playbackId, hlsUrl, initialPosition]);

  if (error) {
    return (
      <div className="video-stage flex aspect-video items-center justify-center rounded-[18px]">
        <div className="max-w-md text-center">
          <div className="mb-3 mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/10">
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <p className="text-[14px] font-semibold text-white/80">
            No se pudo cargar el video
          </p>
          <p className="mt-1 text-[12px] text-white/50">
            Intenta recargar la página o verifica tu conexión a internet
          </p>
          <button
            onClick={() => {
              setError(false);
              const video = videoRef.current;
              if (!video) return;
              if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
              }
              if (Hls.isSupported()) {
                const hls = new Hls({ startPosition: initialPosition });
                hlsRef.current = hls;
                hls.loadSource(hlsUrl);
                hls.attachMedia(video);
                hls.on(Hls.Events.ERROR, (_event, data) => {
                  if (data.fatal) setError(true);
                });
              }
            }}
            className="mt-4 rounded-full bg-white/10 px-5 py-2 text-[12px] font-bold text-white transition-colors hover:bg-white/20"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        controls
        playsInline
        poster={posterUrl}
        className="aspect-video w-full rounded-[18px] bg-black"
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
