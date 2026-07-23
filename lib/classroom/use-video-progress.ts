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
  const flushPending = useRef(false);

  const flush = useCallback(async () => {
    if (durationSeconds <= 0) return;
    if (isFlushing.current) {
      // Ya hay un flush en vuelo (p.ej. el del timer de 15s): no lo
      // pisamos ni lo perdemos — se re-encola y corre apenas termine el
      // actual, con la posición más reciente.
      flushPending.current = true;
      return;
    }
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
      if (flushPending.current) {
        flushPending.current = false;
        flush();
      }
    }
  }, [lessonId, durationSeconds, onProgressUpdate]);

  const flushOnUnload = useCallback(() => {
    if (durationSeconds <= 0) return;
    if (isFlushing.current) {
      // Respeta el mismo mutex que flush(): si ya hay un PATCH en vuelo
      // (p.ej. el del timer de 15s), no disparamos uno independiente —
      // se re-encola y corre con la posición más reciente.
      flushPending.current = true;
      return;
    }
    isFlushing.current = true;
    try {
      fetch("/api/classroom/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          playbackPositionSeconds: positionRef.current,
          durationSeconds,
        }),
        keepalive: true,
      })
        .catch(() => {
          // Best-effort save on unload
        })
        .finally(() => {
          isFlushing.current = false;
          if (flushPending.current) {
            flushPending.current = false;
            flush();
          }
        });
    } catch {
      isFlushing.current = false;
    }
  }, [lessonId, durationSeconds, flush]);

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

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushOnUnload();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", flushOnUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", flushOnUnload);
    };
  }, [flushOnUnload]);

  return {
    handleTimeUpdate,
    handlePause,
    handleEnded,
    flush,
  };
}
