"use client";

import { useState, useEffect, useCallback } from "react";
import { useFocusTrap } from "@/lib/utils/use-focus-trap";
import { TranscriptPanel } from "@/components/classroom/transcript-panel";
import { useVideoSync } from "@/components/classroom/video-sync-context";

const LS_KEY = "ca-playlist-collapsed";

type SidebarMode = "playlist" | "transcript";

type CollapsiblePlaylistProps = {
  children: React.ReactNode;
  lessonCount: number;
  completedCount: number;
  moduleTitle: string;
  modulePosition: number;
  transcriptVtt?: string | null;
  correctedVtt?: string | null;
};

export function CollapsiblePlaylist({
  children,
  lessonCount,
  completedCount,
  moduleTitle,
  modulePosition,
  transcriptVtt,
  correctedVtt,
}: CollapsiblePlaylistProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mode, setMode] = useState<SidebarMode>("playlist");
  const [transcriptKey, setTranscriptKey] = useState(0);
  const { currentTime, seekRef, openTranscriptRef } = useVideoSync();
  const trapRef = useFocusTrap(mobileOpen);
  const hasTranscript = !!transcriptVtt;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored === "true") setCollapsed(true);
    } catch {
      /* SSR or storage blocked */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasTranscript) return;
    openTranscriptRef.current = () => {
      setCollapsed(false);
      setMobileOpen(true);
      setMode("transcript");
      setTranscriptKey((k) => k + 1);
      try {
        localStorage.setItem(LS_KEY, "false");
      } catch { /* noop */ }
    };
    return () => { openTranscriptRef.current = null; };
  }, [hasTranscript, openTranscriptRef]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LS_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // ---------- Mobile: always collapsed -> opens as slide-over ----------
  // On mobile (<lg) we only show the toggle pill. Tapping opens a drawer.

  return (
    <>
      {/* -------- Desktop (lg+) -------- */}
      <div
        className="hidden lg:block lg:self-start lg:sticky lg:top-4 lg:overflow-hidden"
        style={{
          width: hydrated ? (collapsed ? 48 : 360) : 360,
          transition: hydrated ? "width 240ms cubic-bezier(0.4,0,0.2,1)" : "none",
        }}
      >
        {/* Expanded */}
        <div
          style={{
            opacity: collapsed ? 0 : 1,
            pointerEvents: collapsed ? "none" : "auto",
            transition: "opacity 160ms ease",
            maxHeight: "calc(100vh - 6rem)",
          }}
        >
          <aside className="ca-card flex max-h-[inherit] flex-col overflow-hidden">
            {/* Header with mode toggle + collapse button */}
            <div className="border-b border-ca-ink/[0.08] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setMode("playlist")}
                    className="relative rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors"
                    style={{
                      background: mode === "playlist" ? "rgba(94,23,235,0.08)" : "transparent",
                      color: mode === "playlist" ? "var(--color-ca-ink)" : "var(--color-ca-ink-soft, #4a4f73)",
                    }}
                  >
                    Lecciones
                    {mode === "playlist" && (
                      <span className="absolute inset-x-1 -bottom-3 h-0.5 rounded-full bg-ca-violet" />
                    )}
                  </button>
                  {hasTranscript && (
                    <button
                      type="button"
                      onClick={() => setMode("transcript")}
                      className="relative rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors"
                      style={{
                        background: mode === "transcript" ? "rgba(94,23,235,0.08)" : "transparent",
                        color: mode === "transcript" ? "var(--color-ca-ink)" : "var(--color-ca-ink-soft, #4a4f73)",
                      }}
                    >
                      Transcripción
                      {mode === "transcript" && (
                        <span className="absolute inset-x-1 -bottom-3 h-0.5 rounded-full bg-ca-violet" />
                      )}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={toggle}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ca-ink-soft transition-[background,color,transform] duration-[150ms] hover:bg-ca-bg-soft hover:text-ca-ink hover:scale-110 active:scale-95"
                  aria-label="Minimizar panel"
                  title="Minimizar panel"
                >
                  <span className="block transition-transform duration-[240ms] ease-[cubic-bezier(0.4,0,0.2,1)]">
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 17l5-5-5-5" /><path d="M6 17l5-5-5-5" />
                    </svg>
                  </span>
                </button>
              </div>
            </div>
            {/* Content: Playlist or Transcript */}
            {mode === "playlist" && children}
            {mode === "transcript" && transcriptVtt && (
              <div className="flex-1 overflow-y-auto">
                <TranscriptPanel
                  key={transcriptKey}
                  vttContent={transcriptVtt}
                  correctedVtt={correctedVtt}
                  currentTime={currentTime}
                  onSeek={(time) => seekRef.current?.(time)}
                />
              </div>
            )}
          </aside>
        </div>

        {/* Collapsed pill */}
        <div
          className="absolute inset-0 flex items-start justify-center pt-4"
          style={{
            opacity: collapsed ? 1 : 0,
            pointerEvents: collapsed ? "auto" : "none",
            transition: "opacity 160ms ease",
          }}
        >
          <button
            type="button"
            onClick={toggle}
            className="ca-card flex flex-col items-center gap-2.5 px-2.5 py-4 transition-shadow hover:shadow-md"
            aria-label="Expandir playlist"
            title={`${moduleTitle} - ${lessonCount} lecciones`}
          >
            {/* Playlist icon */}
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-ca-ink"
            >
              <path d="M3 6h18M3 12h12M3 18h18" />
            </svg>
            {/* Vertical count pill */}
            <span className="rounded-full bg-ca-bg-soft px-1.5 py-0.5 text-[10px] font-bold text-ca-ink">
              {completedCount}/{lessonCount}
            </span>
            {/* Chevron left to hint "expand" */}
            <svg
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-ca-ink-soft"
            >
              <path d="M18 17l-5-5 5-5" />
              <path d="M11 17l-5-5 5-5" />
            </svg>
          </button>
        </div>
      </div>

      {/* -------- Mobile (<lg): toggle pill + slide-over -------- */}
      <div className="lg:hidden">
        {/* Floating pill button */}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="ca-card ca-card-hoverable flex w-full items-center gap-3 px-4 py-3"
        >
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-ca-ink"
          >
            <path d="M3 6h18M3 12h12M3 18h18" />
          </svg>
          <span className="flex-1 text-left text-[13px] font-bold text-ca-ink">
            {lessonCount} lecciones
          </span>
          <span className="rounded-full bg-ca-bg-soft px-2 py-0.5 text-[10px] font-bold text-ca-ink">
            {completedCount}/{lessonCount}
          </span>
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-ca-ink-soft"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        {/* Slide-over drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50">
            {/* Backdrop */}
            <div
              className="absolute inset-0"
              style={{
                background: "rgba(15, 19, 64, 0.45)",
                backdropFilter: "blur(4px)",
              }}
              onClick={() => setMobileOpen(false)}
            />
            {/* Drawer from right */}
            <aside ref={trapRef} className="ca-slide-in-right absolute bottom-0 right-0 top-0 flex w-[320px] max-w-[85vw] flex-col bg-ca-surface shadow-2xl">
              {/* Drawer header */}
              <div className="flex items-center justify-between border-b border-ca-ink/[0.08] px-5 py-4">
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                    Mod. {String(modulePosition).padStart(2, "0")}
                  </div>
                  <div className="mt-0.5 text-[14px] font-extrabold leading-tight tracking-tight text-ca-ink">
                    {moduleTitle}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="grid h-9 w-9 place-items-center rounded-xl text-ca-ink-soft transition-colors hover:bg-ca-bg-soft"
                  aria-label="Cerrar playlist"
                >
                  <svg
                    width={18}
                    height={18}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Mode toggle */}
              {hasTranscript && (
                <div className="flex gap-1 border-b border-ca-ink/[0.08] px-4 py-2">
                  <button type="button" onClick={() => setMode("playlist")}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors"
                    style={{ background: mode === "playlist" ? "rgba(94,23,235,0.08)" : "transparent", color: mode === "playlist" ? "var(--color-ca-ink)" : "var(--color-ca-ink-soft, #4a4f73)" }}>
                    Lecciones
                  </button>
                  <button type="button" onClick={() => setMode("transcript")}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors"
                    style={{ background: mode === "transcript" ? "rgba(94,23,235,0.08)" : "transparent", color: mode === "transcript" ? "var(--color-ca-ink)" : "var(--color-ca-ink-soft, #4a4f73)" }}>
                    Transcripción
                  </button>
                </div>
              )}
              {/* Content */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {mode === "playlist" && children}
                {mode === "transcript" && transcriptVtt && (
                  <div className="flex-1 overflow-y-auto">
                    <TranscriptPanel
                      vttContent={transcriptVtt}
                      correctedVtt={correctedVtt}
                      currentTime={currentTime}
                      onSeek={(time) => seekRef.current?.(time)}
                    />
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
