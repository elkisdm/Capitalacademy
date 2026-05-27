"use client";

import { useRef, useEffect, useCallback } from "react";

const FLUSH_INTERVAL_MS = 15_000;

type UseVideoProgressOptions = {
  lessonId: string;
  durationSeconds: number;
  initialPosition?: number;
  onProgressUpdate?: (data: {
    watchPercentage: number;
    completed: boolean;
  }) => void;
};

export function useVideoProgress({
  lessonId,
  durationSeconds,
  initialPosition = 0,
  onProgressUpdate,
}: UseVideoProgressOptions) {
  const positionRef = useRef(initialPosition);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const isFlushing = useRef(false);

  const flush = useCallback(async () => {
    if (isFlushing.current || durationSeconds <= 0) return;
    isFlushing.current = true;

    try {
      const res = await fetch("/api/classroom/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          playbackPositionSeconds: positionRef.current,
          durationSeconds,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onProgressUpdate?.({
          watchPercentage: data.watch_percentage,
          completed: data.completed,
        });
      }
    } catch {
      // Silently fail — next flush will retry
    } finally {
      isFlushing.current = false;
    }
  }, [lessonId, durationSeconds, onProgressUpdate]);

  const handleTimeUpdate = useCallback((currentTime: number) => {
    positionRef.current = Math.floor(currentTime);
  }, []);

  const handlePause = useCallback(() => {
    flush();
  }, [flush]);

  const handleEnded = useCallback(() => {
    positionRef.current = durationSeconds;
    flush();
  }, [durationSeconds, flush]);

  useEffect(() => {
    timerRef.current = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      clearInterval(timerRef.current);
      flush();
    };
  }, [flush]);

  return {
    handleTimeUpdate,
    handlePause,
    handleEnded,
    flush,
  };
}
