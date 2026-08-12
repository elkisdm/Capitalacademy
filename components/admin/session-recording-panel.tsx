"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useToast } from "@/components/admin/toast";
import { MuxUploader } from "@/components/admin/mux-uploader";
import { LoaderIcon } from "@/components/admin/quiz/icons";
import { Button } from "@/components/ui/button";
import { ESTADOS_EN_PROCESO } from "@/lib/livekit/egress-estado";

type RecordingState = {
  lessonId: string | null;
  recording: {
    id: string;
    mux_upload_id: string | null;
    mux_playback_id: string | null;
    mux_error: string | null;
    video_duration_seconds: number | null;
    thumbnail_url: string | null;
  } | null;
  moduleMissing: boolean;
  /** Última grabación automática de la sala (ADR-0034); null si nunca hubo. */
  nativa: {
    estado: string;
    error: string | null;
    iniciadaEn: string;
    terminadaEn: string | null;
  } | null;
};

/** Estados en que la grabación automática sigue trabajando en la repetición. */
const NATIVA_EN_CURSO = new Set<string>(ESTADOS_EN_PROCESO);

/**
 * Cuánto se le cree a una grabación "en curso" antes de devolver la subida
 * manual. Si el webhook de cierre se pierde Y la reconciliación no puede
 * correr, la fila queda `uploaded` para siempre — y sin este vencimiento el
 * panel quedaría bloqueado sin NINGUNA forma de publicar la repetición.
 * Una ingesta sana termina en minutos; una hora es holgura de sobra.
 */
const NATIVA_BLOQUEO_MAX_MS = 60 * 60_000;

function nativaSigueFresca(nativa: NonNullable<RecordingState["nativa"]>): boolean {
  const referencia = nativa.terminadaEn ?? nativa.iniciadaEn;
  const t = referencia ? Date.parse(referencia) : NaN;
  // Sin timestamp legible se asume vencida: bloquear para siempre es el modo
  // de fallo caro; subir a mano encima de una ingesta viva lo absorbe E8.
  if (Number.isNaN(t)) return false;
  return Date.now() - t < NATIVA_BLOQUEO_MAX_MS;
}

// Polling mientras Mux procesa: cada 8s, hasta ~6 min (45 intentos).
const POLL_INTERVAL_MS = 8000;
const POLL_MAX_ATTEMPTS = 45;

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")} min`;
}

/**
 * Panel de repetición de una clase EN VIVO, embebido en el editor de sesiones.
 * Crea (si no existe) la lección-repetición ligada a la sesión y reusa
 * `MuxUploader` para subir la grabación. Tras la subida hace polling automático
 * hasta que el webhook de Mux deja lista la repetición (sin refresco manual).
 * Espeja `SessionQuizPanel`, pero el target es el video. Ver migración 0041.
 */
export function SessionRecordingPanel({
  sessionId,
  onReady,
}: {
  sessionId: string;
  /** Se dispara UNA vez cuando la repetición pasa a lista (para refrescar listas del server). */
  onReady?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<RecordingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [justUploaded, setJustUploaded] = useState(false);
  const [pollExhausted, setPollExhausted] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const { toast, ToastContainer } = useToast();
  const attemptsRef = useRef(0);
  const wasReadyRef = useRef(false);
  const wasErrorRef = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const res = await fetch(`/api/admin/sessions/${sessionId}/recording`);
        const data = (await res.json()) as RecordingState;
        setState(data);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const rec = state?.recording ?? null;
  const isReady = Boolean(rec?.mux_playback_id);
  const hasLesson = Boolean(state?.lessonId);
  // Mux falló al procesar: no es "procesando", es error (detiene el polling).
  const hasError = !isReady && Boolean(rec?.mux_error);
  // Procesando = hay lección, sin playback, sin error, y ya se subió un archivo
  // (justUploaded en esta sesión, o mux_upload_id persistido de una subida previa).
  const isProcessing =
    hasLesson &&
    !isReady &&
    !hasError &&
    (justUploaded || Boolean(rec?.mux_upload_id));

  // La grabación nativa trabaja SIN mux_upload_id (crea el asset por ingesta de
  // URL), así que el gate de arriba nunca la ve: sin esta condición el panel
  // muestra "se está grabando / preparando" y no vuelve a consultar jamás —
  // congelado hasta que alguien recargue la página.
  const nativaActiva = Boolean(
    !isReady &&
      state?.nativa &&
      NATIVA_EN_CURSO.has(state.nativa.estado) &&
      nativaSigueFresca(state.nativa),
  );

  // Avisa una sola vez cuando la repetición pasa a lista.
  useEffect(() => {
    if (isReady && !wasReadyRef.current) {
      wasReadyRef.current = true;
      toast("Repetición lista", "success");
      onReady?.();
    } else if (!isReady) {
      wasReadyRef.current = false;
    }
  }, [isReady, toast, onReady]);

  // Avisa una sola vez cuando Mux reporta un error de procesamiento.
  useEffect(() => {
    if (hasError && !wasErrorRef.current) {
      wasErrorRef.current = true;
      toast(rec?.mux_error ?? "Error al procesar el video", "error");
    } else if (!hasError) {
      wasErrorRef.current = false;
    }
  }, [hasError, rec?.mux_error, toast]);

  // Polling automático mientras Mux procesa.
  useEffect(() => {
    if (!isProcessing && !nativaActiva) return;
    attemptsRef.current = 0;
    const id = setInterval(() => {
      if (attemptsRef.current >= POLL_MAX_ATTEMPTS) {
        clearInterval(id);
        setPollExhausted(true);
        return;
      }
      attemptsRef.current += 1;
      void load({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isProcessing, nativaActiva, load]);

  const prepare = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/recording`, {
        method: "POST",
      });
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
      const res = await fetch(`/api/admin/sessions/${sessionId}/recording`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        toast("Repetición eliminada", "success");
        setJustUploaded(false);
        setPollExhausted(false);
        setRetrying(false);
        wasReadyRef.current = false;
        wasErrorRef.current = false;
        await load();
      } else {
        toast(data.error ?? "Error al eliminar", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleUploaded = useCallback(() => {
    setJustUploaded(true);
    setPollExhausted(false);
    setRetrying(false);
    void load({ silent: true });
  }, [load]);

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

  // La sala se grabó (o se está grabando) automáticamente: la repetición viene
  // en camino sola. Subir un archivo a mano encima haría chocar los dos caminos
  // — la ingesta nativa se detiene si la lección ya tiene video. El bloqueo
  // VENCE (nativaSigueFresca): una fila colgada no puede secuestrar el panel.
  if (nativaActiva && state?.nativa) {
    return (
      <>
        <ToastContainer />
        <div
          role="status"
          className="rounded-xl border border-ca-violet/30 bg-ca-violet/10 px-4 py-3 text-[13px] leading-relaxed text-ca-ink"
        >
          <span className="font-bold">
            {state.nativa.estado === "starting" || state.nativa.estado === "active"
              ? "Esta clase se está grabando automáticamente."
              : "La grabación automática de esta clase está preparando la repetición."}
          </span>{" "}
          No subas un archivo a mano: la repetición se publicará sola cuando termine de
          procesarse. Si algo falla, este panel volverá a ofrecer la subida manual.
        </div>
      </>
    );
  }

  // Repetición lista: video procesado en Mux.
  if (isReady && rec) {
    return (
      <>
        <ToastContainer />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {rec.thumbnail_url ? (
            <Image
              src={rec.thumbnail_url}
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
              {fmtDuration(rec.video_duration_seconds)} · disponible para el
              alumno en la pantalla de la clase.
            </p>
            <Button
              type="button"
              variant="ghost"
              onClick={remove}
              disabled={busy}
              className="!h-auto !w-auto mt-3 !px-0 !py-0 text-[12px] uppercase tracking-[0.14em] text-red-500 hover:!bg-transparent hover:text-red-600"
            >
              Quitar repetición
            </Button>
          </div>
        </div>
      </>
    );
  }

  // Mux falló al procesar: muestra el motivo y permite reintentar la subida.
  if (hasError && !retrying) {
    return (
      <>
        <ToastContainer />
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-100 text-red-500">
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <h3 className="mt-3 text-[15px] font-extrabold text-ca-ink">
            No se pudo procesar el video
          </h3>
          <p className="mt-1 text-[13px] text-ca-ink-soft">
            {rec?.mux_error}
          </p>
          <Button
            type="button"
            onClick={() => setRetrying(true)}
            className="!h-auto mt-4 gap-2 rounded-xl px-5 py-2.5 text-[13px]"
          >
            Reintentar subida
          </Button>
        </div>
      </>
    );
  }

  // Procesando en Mux: polling automático, sin refresco manual.
  if (isProcessing) {
    return (
      <>
        <ToastContainer />
        <div className="ca-card overflow-hidden p-8 text-center">
          <div className="relative mx-auto grid h-16 w-16 place-items-center">
            <div
              className="ca-spin-slow absolute inset-0 rounded-full"
              style={{
                background:
                  "conic-gradient(var(--color-ca-violet) 0%, var(--color-ca-lime) 60%, transparent 60%)",
              }}
            />
            <div className="absolute inset-1.5 grid place-items-center rounded-full bg-ca-surface text-ca-violet">
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5" />
              </svg>
            </div>
          </div>
          <h3 className="mt-4 text-[16px] font-extrabold tracking-tight text-ca-ink">
            Procesando en Mux…
          </h3>
          {pollExhausted ? (
            <>
              <p className="mt-1 text-[13px] text-ca-ink-soft">
                Está tardando más de lo normal. Puedes seguir trabajando; se
                marcará lista cuando termine.
              </p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPollExhausted(false);
                  void load({ silent: true });
                }}
                disabled={busy}
                className="!h-auto !w-auto mt-3 !px-0 !py-0 text-[12px] uppercase tracking-[0.14em] text-ca-violet hover:!bg-transparent"
              >
                Reintentar
              </Button>
            </>
          ) : (
            <p className="mt-1 text-[13px] text-ca-ink-soft">
              Generando transcoding y thumbnails (~2-5 min). Se actualiza solo;
              no necesitas refrescar.
            </p>
          )}
        </div>
      </>
    );
  }

  // La grabación automática falló o quedó colgada: la subida manual sigue
  // disponible abajo, pero ops tiene que saber POR QUÉ está subiendo a mano.
  const nativaColgada =
    state?.nativa && NATIVA_EN_CURSO.has(state.nativa.estado) && !nativaSigueFresca(state.nativa);
  const avisoNativaFallida =
    state?.nativa?.estado === "failed" ? (
      <div className="mb-3 rounded-xl border border-ca-amber/40 bg-ca-amber/10 px-4 py-3 text-[13px] leading-relaxed text-[#8b6914]">
        <span className="font-bold">La grabación automática de esta clase falló:</span>{" "}
        {state.nativa.error ?? "sin motivo registrado"}. Sube la repetición a mano.
      </div>
    ) : nativaColgada ? (
      <div className="mb-3 rounded-xl border border-ca-amber/40 bg-ca-amber/10 px-4 py-3 text-[13px] leading-relaxed text-[#8b6914]">
        <span className="font-bold">
          La grabación automática quedó a medio camino (sin confirmación hace más de una
          hora).
        </span>{" "}
        Puedes subir la repetición a mano; si la automática se completa después, no pisará
        lo que subas.
      </div>
    ) : null;

  // Repetición preparada, lista para subir el archivo.
  if (hasLesson && state?.lessonId) {
    return (
      <>
        <ToastContainer />
        {avisoNativaFallida}
        <MuxUploader lessonId={state.lessonId} onUploadComplete={handleUploaded} />
      </>
    );
  }

  // Sin repetición todavía.
  return (
    <>
      <ToastContainer />
      {avisoNativaFallida}
      <div className="rounded-xl border-2 border-dashed border-ca-ink/[0.10] p-6 text-center">
        <p className="text-[14px] font-semibold text-ca-ink">
          Esta clase en vivo no tiene repetición.
        </p>
        <p className="mt-1 text-[13px] text-ca-ink-soft">
          Sube la grabación a Mux para que el alumno pueda verla después de la
          sesión.
        </p>
        <Button
          variant="lime"
          onClick={prepare}
          disabled={busy}
          className="!h-auto mt-4 gap-2 rounded-xl px-5 py-2.5 text-[13px]"
        >
          {busy ? <LoaderIcon /> : null}
          Preparar y subir repetición
        </Button>
      </div>
    </>
  );
}
