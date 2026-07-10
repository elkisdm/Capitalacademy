"use client";

import { useState, useTransition } from "react";
import { registrarAsistencia, type CheckinStatus } from "./checkin-action";
import {
  BEFORE_WINDOW_LABEL,
  EXPIRED_WINDOW_LABEL,
  type WindowState,
} from "@/lib/asistencia/window";

const TZ = "America/Santiago";

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

type Tone = "neutral" | "success" | "info" | "warn" | "error";

const TONE_STYLE: Record<Tone, { bg: string; color: string }> = {
  neutral: { bg: "var(--color-ca-bg-soft)", color: "var(--color-ca-ink)" },
  success: { bg: "var(--color-ca-lime)", color: "var(--color-ca-ink)" },
  info: { bg: "var(--color-ca-violet-mist)", color: "var(--color-ca-violet-deep)" },
  warn: { bg: "#fef3d7", color: "#8b6914" },
  error: { bg: "#fdebef", color: "var(--color-ca-rose)" },
};

function statusTone(status: CheckinStatus): Tone {
  switch (status) {
    case "ok":
      return "success";
    case "already":
      return "info";
    case "not_enrolled":
      return "warn";
    case "outside_window":
      return "warn";
    default:
      return "error";
  }
}

export function CheckinClient({
  sessionId,
  title,
  startsAt,
  cohortName,
  alreadyRegistered,
  windowState,
}: {
  sessionId: string;
  title: string;
  startsAt: string;
  cohortName: string | null;
  alreadyRegistered: boolean;
  windowState: WindowState;
}) {
  const [result, setResult] = useState<{ status: CheckinStatus; message: string } | null>(
    alreadyRegistered
      ? { status: "already", message: "Tu asistencia ya estaba registrada." }
      : null,
  );
  const [isPending, startTransition] = useTransition();

  const done =
    result !== null && (result.status === "ok" || result.status === "already");

  // Aviso proactivo cuando la ventana no está abierta y el alumno todavía no
  // se registró: evita que tenga que hacer clic para enterarse. El Server
  // Action ('outside_window') sigue siendo la defensa en profundidad si la
  // ventana cambia entre el render y el clic.
  const gateBlock =
    !alreadyRegistered && windowState !== "open"
      ? {
          tone: (windowState === "closed" ? "warn" : "info") as Tone,
          message: windowState === "closed" ? EXPIRED_WINDOW_LABEL : BEFORE_WINDOW_LABEL,
        }
      : null;

  function handleClick() {
    startTransition(async () => {
      const r = await registrarAsistencia(sessionId);
      setResult(r);
    });
  }

  return (
    <div
      className="grid min-h-screen place-items-center px-4 py-10"
      style={{ background: "var(--color-ca-bg)" }}
    >
      <article className="ca-card w-full max-w-[440px] overflow-hidden">
        <div
          className="px-6 py-5"
          style={{ background: "var(--color-ca-ink)", color: "#fff" }}
        >
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60">
            Registro de asistencia
          </div>
          <h1 className="mt-1 text-[20px] font-black leading-tight tracking-tight">
            {title}
          </h1>
        </div>

        <div className="p-6">
          <dl className="grid gap-3 text-[13px]">
            <div>
              <dt className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                Fecha y hora
              </dt>
              <dd className="mt-0.5 font-semibold capitalize text-ca-ink">
                {fmtDateTime(startsAt)}
              </dd>
            </div>
            {cohortName && (
              <div>
                <dt className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                  Cohorte
                </dt>
                <dd className="mt-0.5 font-semibold text-ca-ink">{cohortName}</dd>
              </div>
            )}
          </dl>

          {result && (
            <div
              role="status"
              aria-live="polite"
              className="mt-5 rounded-xl px-4 py-3 text-[13px] font-semibold"
              style={{
                background: TONE_STYLE[statusTone(result.status)].bg,
                color: TONE_STYLE[statusTone(result.status)].color,
              }}
            >
              {result.status === "ok" || result.status === "already" ? "✓ " : ""}
              {result.message}
            </div>
          )}

          {!result && gateBlock && (
            <div
              role="status"
              aria-live="polite"
              className="mt-5 rounded-xl px-4 py-3 text-[13px] font-semibold"
              style={{
                background: TONE_STYLE[gateBlock.tone].bg,
                color: TONE_STYLE[gateBlock.tone].color,
              }}
            >
              {gateBlock.message}
            </div>
          )}

          {!done && !gateBlock && (
            <button
              onClick={handleClick}
              disabled={isPending}
              className="ca-btn-lime mt-5 inline-flex h-12 w-full items-center justify-center text-[14px] font-bold uppercase tracking-[0.06em] disabled:opacity-60"
            >
              {isPending ? "Registrando…" : "Registrar mi asistencia"}
            </button>
          )}
        </div>

        <div
          className="border-t px-6 py-3 text-center text-[10.5px] font-medium text-ca-ink-soft"
          style={{ borderColor: "var(--color-ca-outline)" }}
        >
          Capital Academy
        </div>
      </article>
    </div>
  );
}
