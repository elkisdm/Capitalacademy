"use client";

import { createContext, useContext, useRef, useState, useCallback, useMemo, type ReactNode, type MutableRefObject } from "react";

/**
 * El sync de video está partido en DOS contextos a propósito:
 *
 * - `VideoSyncActionsContext`: acciones y refs ESTABLES (`setCurrentTime`,
 *   `seekRef`, `openTranscriptRef`). Su value se memoiza, así que NO cambia
 *   mientras el video reproduce → quien solo consume acciones (ej. la sección
 *   de la lección con el player + pestañas) NO se re-renderiza cada 400ms.
 * - `VideoSyncTimeContext`: el `currentTime` que avanza cada ~400ms. Solo lo
 *   consume quien realmente lo necesita (el panel de transcripción, para
 *   resaltar la línea actual), acotando ahí el re-render de alta frecuencia.
 */

type VideoSyncActions = {
  setCurrentTime: (t: number) => void;
  seekRef: MutableRefObject<((time: number) => void) | null>;
  openTranscriptRef: MutableRefObject<(() => void) | null>;
};

const VideoSyncActionsContext = createContext<VideoSyncActions | null>(null);
const VideoSyncTimeContext = createContext<number>(0);

export function VideoSyncProvider({ children }: { children: ReactNode }) {
  const [currentTime, setCurrentTimeState] = useState(0);
  const seekRef = useRef<((time: number) => void) | null>(null);
  const openTranscriptRef = useRef<(() => void) | null>(null);
  const lastSync = useRef(0);

  const setCurrentTime = useCallback((t: number) => {
    const now = Date.now();
    if (now - lastSync.current > 400) {
      lastSync.current = now;
      setCurrentTimeState(t);
    }
  }, []);

  // Value estable: solo cambia si cambia setCurrentTime (nunca). Los refs son
  // estables por definición. Así los consumidores de acciones no re-renderizan.
  const actions = useMemo<VideoSyncActions>(
    () => ({ setCurrentTime, seekRef, openTranscriptRef }),
    [setCurrentTime],
  );

  return (
    <VideoSyncActionsContext.Provider value={actions}>
      <VideoSyncTimeContext.Provider value={currentTime}>
        {children}
      </VideoSyncTimeContext.Provider>
    </VideoSyncActionsContext.Provider>
  );
}

/** Acciones/refs estables del sync de video (no re-renderiza con el tiempo). */
export function useVideoSyncActions() {
  const ctx = useContext(VideoSyncActionsContext);
  if (!ctx) throw new Error("useVideoSyncActions must be used within VideoSyncProvider");
  return ctx;
}

/** Tiempo actual del video (~400ms). Solo úsalo si realmente lo necesitas. */
export function useVideoSyncTime() {
  return useContext(VideoSyncTimeContext);
}
