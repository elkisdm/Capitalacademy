"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";

export type AvisoKind = "rescheduled" | "cancelled";

export type AvisoTarget = {
  sessionId: string;
  title: string;
  kind: AvisoKind;
  /** Horario que los alumnos tienen hoy (el que ya salió por correo). */
  previousStartsAt: string;
  previousEndsAt: string;
  /** Horario nuevo. Ausente en una cancelación. */
  newStartsAt?: string | null;
  newEndsAt?: string | null;
};

type Props = {
  target: AvisoTarget | null;
  onClose: () => void;
  /** Se llama al terminar (haya avisado o no) con el resultado para el toast. */
  onDone: (mensaje: string | null) => void;
};

const TZ = "America/Santiago";

function fmt(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * Pregunta si avisarle a los alumnos que la clase se movió o se canceló.
 *
 * No se dispara solo a propósito: reacomodar el calendario de una cohorte mueve
 * varias clases seguidas, y un aviso automático mandaría una tanda de correos
 * por cada una. Quien edita sabe cuáles vale la pena comunicar.
 *
 * En una CANCELACIÓN este diálogo corre ANTES de borrar la clase: el aviso
 * necesita la fila para saber a quién escribirle.
 */
export function SessionChangeNoticeDialog({ target, onClose, onDone }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El efecto SOLO consulta. El estado no se limpia acá: el padre remonta este
  // componente con `key` por clase, así que cada apertura nace con el motivo
  // vacío y sin el error de la anterior.
  useEffect(() => {
    if (!target) return;
    const controller = new AbortController();

    fetch(`/api/admin/sessions/${target.sessionId}/aviso`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setCount(typeof d.count === "number" ? d.count : null))
      .catch((err: Error) => {
        if (err.name !== "AbortError") setCount(null);
      });

    return () => controller.abort();
  }, [target]);

  async function avisar() {
    if (!target) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sessions/${target.sessionId}/aviso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: target.kind,
          previousStartsAt: target.previousStartsAt,
          previousEndsAt: target.previousEndsAt,
          motivo: motivo.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: number;
        failed?: number;
      };

      if (!res.ok) {
        setError(data.error ?? "No se pudo enviar el aviso.");
        return;
      }

      onDone(
        data.failed
          ? `Avisamos a ${data.sent} personas; ${data.failed} no recibieron el correo.`
          : `Avisamos a ${data.sent} ${data.sent === 1 ? "persona" : "personas"}.`,
      );
      onClose();
    } catch {
      setError("Error de red al enviar el aviso.");
    } finally {
      setEnviando(false);
    }
  }

  const cancelada = target?.kind === "cancelled";

  return (
    <Dialog
      open={target !== null}
      onClose={enviando ? () => {} : onClose}
      aria-label="Avisar del cambio"
      className="w-full max-w-md"
    >
      {target && (
        <div className="space-y-4 p-6">
          <h2 className="text-[19px] font-black tracking-tight text-ca-ink">
            {cancelada ? "¿Avisar que se canceló?" : "¿Avisar del cambio de horario?"}
          </h2>

          <div className="rounded-xl bg-ca-bg-soft px-4 py-3 text-[13px] text-ca-ink">
            <p className="font-bold">{target.title}</p>
            <p className="mt-1.5 text-ca-ink-soft">
              <span className="line-through">{fmt(target.previousStartsAt)}</span>
              {!cancelada && target.newStartsAt && (
                <>
                  {" → "}
                  <strong className="font-black text-ca-ink">{fmt(target.newStartsAt)}</strong>
                </>
              )}
            </p>
          </div>

          <p className="text-[14px] leading-relaxed text-ca-ink-soft">
            {count === null ? (
              "Calculando a cuántos alumnos alcanza…"
            ) : (
              <>
                Se le enviará un correo a{" "}
                <strong className="text-ca-ink">
                  {count} {count === 1 ? "alumno" : "alumnos"}
                </strong>{" "}
                con matrícula activa.{" "}
                {cancelada
                  ? "El correo dice que la clase no se realizará."
                  : "El correo muestra el horario anterior tachado y el nuevo."}
              </>
            )}
          </p>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
              Motivo (opcional)
            </span>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={cancelada ? "Se reagenda para la próxima semana" : "Se corre por el feriado"}
              maxLength={300}
              disabled={enviando}
            />
          </label>

          {error && (
            <p className="flex items-start gap-2 rounded-xl bg-ca-destructive/10 px-4 py-3 text-[13px] text-ca-destructive">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={enviando}>
              No avisar
            </Button>
            <Button onClick={avisar} disabled={enviando || count === null || count === 0}>
              {enviando ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              Sí, avisar
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
