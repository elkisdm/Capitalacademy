"use client";

import { useState, useEffect, useCallback } from "react";
import { useFocusTrap } from "@/lib/utils/use-focus-trap";
import { TranscriptPanel } from "@/components/classroom/transcript-panel";
import { useVideoSyncActions, useVideoSyncTime } from "@/components/classroom/video-sync-context";

type ClassTranscriptPanelProps = {
  transcriptVtt: string;
  correctedVtt?: string | null;
};

/**
 * Panel de transcripción para la vista de repetición de clase en vivo.
 * A diferencia de `CollapsiblePlaylist` (usado en lecciones pregrabadas, que
 * tiene sidebar de playlist), la clase no tiene lecciones hermanas: este
 * componente solo cablea `openTranscriptRef` y muestra el `TranscriptPanel`
 * en un drawer, sin arrastrar UI de playlist.
 */
export function ClassTranscriptPanel({
  transcriptVtt,
  correctedVtt,
}: ClassTranscriptPanelProps) {
  const [open, setOpen] = useState(false);
  const [transcriptKey, setTranscriptKey] = useState(0);
  const { seekRef, openTranscriptRef } = useVideoSyncActions();
  const currentTime = useVideoSyncTime();
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    openTranscriptRef.current = () => {
      setOpen(true);
      setTranscriptKey((k) => k + 1);
    };
    return () => { openTranscriptRef.current = null; };
  }, [openTranscriptRef]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(15, 19, 64, 0.45)",
          backdropFilter: "blur(4px)",
        }}
        onClick={close}
      />
      {/* Drawer from right */}
      <aside ref={trapRef} className="ca-slide-in-right absolute bottom-0 right-0 top-0 flex w-[380px] max-w-[90vw] flex-col bg-ca-surface pb-[env(safe-area-inset-bottom)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-ca-ink/[0.08] px-5 py-4">
          <div className="text-[14px] font-extrabold leading-tight tracking-tight text-ca-ink">
            Transcripción
          </div>
          <button
            type="button"
            onClick={close}
            className="grid h-9 w-9 place-items-center rounded-xl text-ca-ink-soft transition-colors hover:bg-ca-bg-soft"
            aria-label="Cerrar transcripción"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <TranscriptPanel
            key={transcriptKey}
            vttContent={transcriptVtt}
            correctedVtt={correctedVtt}
            currentTime={currentTime}
            onSeek={(time) => seekRef.current?.(time)}
            fill
          />
        </div>
      </aside>
    </div>
  );
}
