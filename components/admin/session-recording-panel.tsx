"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useToast } from "@/components/admin/toast";
import { MuxUploader } from "@/components/admin/mux-uploader";
import { LoaderIcon } from "@/components/admin/quiz/icons";

type RecordingState = {
  lessonId: string | null;
  recording: {
    id: string;
    mux_playback_id: string | null;
    video_duration_seconds: number | null;
    thumbnail_url: string | null;
  } | null;
  moduleMissing: boolean;
};

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")} min`;
}

/**
 * Panel de repetición de una clase EN VIVO, embebido en el editor de sesiones.
 * Crea (si no existe) la lección-repetición ligada a la sesión y reusa
 * `MuxUploader` para subir la grabación. Espeja `SessionQuizPanel`, pero el
 * target es el video de la clase. Ver migración 0041.
 */
export function SessionRecordingPanel({
  sessionId,
}: {
  sessionId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<RecordingState | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, ToastContainer } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/sessions/${sessionId}/recording`,
      );
      const data = (await res.json()) as RecordingState;
      setState(data);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const prepare = async () => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/sessions/${sessionId}/recording`,
        { method: "POST" },
      );
      const data = await res.json();
      if (res.ok) {
        await load();
      } else {
        toast(data.error ?? "Error al preparar la repetición", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/sessions/${sessionId}/recording`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (res.ok) {
        toast("Repetición eliminada", "success");
        await load();
      } else {
        toast(data.error ?? "Error al eliminar", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-8">
        <LoaderIcon />
      </div>
    );
  }

  if (state?.moduleMissing) {
    return (
      <div className="rounded-xl border border-ca-amber/40 bg-ca-amber/10 px-4 py-3 text-[13px] font-semibold text-[#8b6914]">
        Asigna un módulo a esta sesión para poder subir la repetición.
      </div>
    );
  }

  // Repetición lista: video procesado en Mux.
  if (state?.recording?.mux_playback_id) {
    const r = state.recording;
    return (
      <>
        <ToastContainer />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {r.thumbnail_url ? (
            <Image
              src={r.thumbnail_url}
              alt="Repetición"
              width={160}
              height={90}
              className="shape-circle h-[90px] w-[160px] rounded-xl object-cover"
              unoptimized
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-ca-lime/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink">
              <span className="shape-circle h-1.5 w-1.5 bg-ca-violet" />
              Repetición lista
            </div>
            <p className="mt-2 text-[13px] text-ca-ink-soft">
              {fmtDuration(r.video_duration_seconds)} · disponible para el alumno
              en la pantalla de la clase.
            </p>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="mt-3 text-[12px] font-bold uppercase tracking-[0.14em] text-red-500 transition-colors hover:text-red-600 disabled:opacity-40"
            >
              Quitar repetición
            </button>
          </div>
        </div>
      </>
    );
  }

  // Repetición preparada, esperando subida o procesamiento de Mux.
  if (state?.lessonId) {
    return (
      <>
        <ToastContainer />
        <MuxUploader lessonId={state.lessonId} onUploadComplete={load} />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[12px] text-ca-ink-soft">
            Tras subir, Mux procesa el video (~2-5 min). Actualiza para ver el
            estado.
          </p>
          <button
            type="button"
            onClick={load}
            disabled={busy}
            className="text-[12px] font-bold uppercase tracking-[0.14em] text-ca-violet disabled:opacity-40"
          >
            Actualizar
          </button>
        </div>
      </>
    );
  }

  // Sin repetición todavía.
  return (
    <>
      <ToastContainer />
      <div className="rounded-xl border-2 border-dashed border-ca-ink/[0.10] p-6 text-center">
        <p className="text-[14px] font-semibold text-ca-ink">
          Esta clase en vivo no tiene repetición.
        </p>
        <p className="mt-1 text-[13px] text-ca-ink-soft">
          Sube la grabación a Mux para que el alumno pueda verla después de la
          sesión.
        </p>
        <button
          onClick={prepare}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-ca-ink transition-colors disabled:opacity-40"
          style={{ background: "var(--color-ca-lime)" }}
        >
          {busy ? <LoaderIcon /> : null}
          Preparar y subir repetición
        </button>
      </div>
    </>
  );
}
