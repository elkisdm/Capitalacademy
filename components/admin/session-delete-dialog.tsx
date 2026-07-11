"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ClassSession } from "@/lib/classroom/types";

function AlertIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * Confirmación de borrado de una sesión, calcada de DeactivateModal: lista la
 * cascada real (asistencia, repetición/Mux, recursos, quiz) antes de eliminar.
 */
export function SessionDeleteDialog({
  open,
  session,
  resourceCount,
  deleting,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  session: ClassSession | null;
  resourceCount: number;
  deleting: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!session) return null;

  const hasRecording = Boolean(session.lesson_id || session.recording_url);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-label="Eliminar clase"
      className="w-full max-w-[460px] overflow-hidden overscroll-contain p-0"
    >
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-6">
        <div
          className="grid h-12 w-12 place-items-center rounded-full text-red-600"
          style={{ background: "rgba(225,29,72,0.10)" }}
        >
          <AlertIcon />
        </div>
        <Button type="button" variant="ghost" onClick={onClose} aria-label="Cerrar" className="h-10 w-10 p-0">
          <CloseIcon />
        </Button>
      </div>

      {/* Body */}
      <div className="px-6 pb-6 pt-4">
        <h2 className="text-[20px] font-black tracking-tight text-ca-ink">
          Eliminar clase
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ca-ink-soft">
          Vas a eliminar &ldquo;{session.title ?? "Sin título"}&rdquo;. Esto también elimina:
        </p>

        {/* Consequences */}
        <div className="mt-5 flex flex-col gap-2.5">
          <div className="flex items-start gap-3">
            <span className="shape-circle mt-1 h-2 w-2 shrink-0" style={{ background: "#e11d48" }} />
            <span className="text-[12px] font-semibold leading-snug text-ca-ink-soft">
              La sesión y todo su registro de asistencia.
            </span>
          </div>
          {hasRecording && (
            <div className="flex items-start gap-3">
              <span className="shape-circle mt-1 h-2 w-2 shrink-0" style={{ background: "#e11d48" }} />
              <span className="text-[12px] font-semibold leading-snug text-ca-ink-soft">
                La repetición y el video subido a Mux.
              </span>
            </div>
          )}
          {resourceCount > 0 && (
            <div className="flex items-start gap-3">
              <span className="shape-circle mt-1 h-2 w-2 shrink-0" style={{ background: "#e11d48" }} />
              <span className="text-[12px] font-semibold leading-snug text-ca-ink-soft">
                {resourceCount} recurso{resourceCount > 1 ? "s" : ""} adjunto{resourceCount > 1 ? "s" : ""} a la clase.
              </span>
            </div>
          )}
          <div className="flex items-start gap-3">
            <span className="shape-circle mt-1 h-2 w-2 shrink-0" style={{ background: "#e11d48" }} />
            <span className="text-[12px] font-semibold leading-snug text-ca-ink-soft">
              El quiz formativo de la clase y las respuestas de los alumnos, si los hay.
            </span>
          </div>
        </div>

        <p className="mt-4 text-[12px] font-bold text-ca-ink">
          Esta acción no se puede deshacer.
        </p>

        {error && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 rounded-xl border border-ca-amber/40 bg-ca-amber/10 px-4 py-3 text-[12px] font-semibold text-[#8b6914]"
          >
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 border-t border-ca-ink/[0.08] px-6 py-4" style={{ background: "var(--color-ca-bg-soft)" }}>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" variant="destructive" onClick={onConfirm} disabled={deleting}>
          {deleting ? "Eliminando…" : "Eliminar clase"}
        </Button>
      </div>
    </Dialog>
  );
}
