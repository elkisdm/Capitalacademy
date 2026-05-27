"use client";

import { createContext, useContext, useRef, useState, useCallback, type ReactNode, type MutableRefObject } from "react";

type VideoSyncContextValue = {
  currentTime: number;
  setCurrentTime: (t: number) => void;
  seekRef: MutableRefObject<((time: number) => void) | null>;
};

const VideoSyncContext = createContext<VideoSyncContextValue | null>(null);

export function VideoSyncProvider({ children }: { children: ReactNode }) {
  const [currentTime, setCurrentTimeState] = useState(0);
  const seekRef = useRef<((time: number) => void) | null>(null);
  const lastSync = useRef(0);

  const setCurrentTime = useCallback((t: number) => {
    const now = Date.now();
    if (now - lastSync.current > 400) {
      lastSync.current = now;
      setCurrentTimeState(t);
    }
  }, []);

  return (
    <VideoSyncContext.Provider value={{ currentTime, setCurrentTime, seekRef }}>
      {children}
    </VideoSyncContext.Provider>
  );
}

export function useVideoSync() {
  const ctx = useContext(VideoSyncContext);
  if (!ctx) throw new Error("useVideoSync must be used within VideoSyncProvider");
  return ctx;
}
