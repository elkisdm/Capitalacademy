"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input, Textarea } from "@/components/ui/field";
// `@/components/admin/toast` y NO `@/components/ui/toast`: el segundo exige un
// <ToastProvider> que no se monta en ninguna parte de la aplicación, así que
// `useToast` lanza al renderizar y se lleva la pantalla entera por delante.
// Este es un hook con estado propio: hay que pintar su <ToastContainer />.
import { useToast } from "@/components/admin/toast";
import { DetailSectionTitle } from "@/components/admin/students/shared";
import { formatLeadDate, formatLeadDateFull } from "@/lib/admin/leads-format";
import { isoToChileWallTime, chileWallTimeToIso } from "@/lib/time";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_ACTIVITY_LABELS,
  LEAD_CALL_OUTCOME_LABELS,
  urgenciaDeTarea,
  type LeadStage,
  type LeadCallOutcome,
} from "@/lib/admin/leads-pipeline";
import type { LeadActivityRow, LeadTaskRow } from "@/lib/admin/leads-queries";

/**
 * El bloque de seguimiento del detalle de un lead: etapa, historial de
 * contacto, notas y tareas.
 *
 * Vive aparte de `leads-panel.tsx` porque el panel es lectura y filtrado —
 * síncrono y sin red — mientras que esto escribe. Separarlos deja el listado
 * (que renderiza decenas de filas) libre del estado de los formularios.
 *
 * Después de cada escritura se llama a `router.refresh()`: la página es un
 * componente de servidor, así que el refresco vuelve a leer y el detalle se
 * repinta con lo que quedó realmente en la base, no con lo que creemos que
 * quedó.
 */
export function LeadSeguimiento({
  leadId,
  leadEmail,
  stage,
  activity,
  tasks,
}: {
  leadId: string;
  /** Sin correo no hay a quién mandarle la invitación: la reunión se oculta. */
  leadEmail: string | null;
  stage: LeadStage;
  activity: LeadActivityRow[];
  tasks: LeadTaskRow[];
}) {
  const router = useRouter();
  const { toast, ToastContainer } = useToast();
  const [guardando, setGuardando] = useState(false);

  async function escribir(url: string, init: RequestInit, exito: string) {
    if (guardando) return false;
    setGuardando(true);
    try {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast(err.error ?? "No se pudo guardar", "error");
        return false;
      }
      toast(exito, "success");
      router.refresh();
      return true;
    } catch {
      // Sin esto, un `fetch` que rechaza (sin red, DNS caído) no muestra nada:
      // el spinner se apaga y quien mueve la etapa asume que se movió.
      toast("Sin conexión: no se pudo guardar", "error");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <ToastContainer />

      <EtapaSelector
        stage={stage}
        disabled={guardando}
        onChange={(nueva) =>
          escribir(
            `/api/admin/leads/${leadId}`,
            { method: "PATCH", body: JSON.stringify({ stage: nueva }) },
            `Movido a ${LEAD_STAGE_LABELS[nueva]}`,
          )
        }
      />

      <Tareas
        tasks={tasks}
        disabled={guardando}
        puedeAgendarReunion={Boolean(leadEmail)}
        onCrear={(title, dueAt, duracion) =>
          duracion === null
            ? escribir(
                `/api/admin/leads/${leadId}/tasks`,
                { method: "POST", body: JSON.stringify({ title, due_at: dueAt }) },
                "Tarea agendada",
              )
            : escribir(
                `/api/admin/leads/${leadId}/meetings`,
                {
                  method: "POST",
                  body: JSON.stringify({ title, due_at: dueAt, duration_minutes: duracion }),
                },
                "Reunión agendada",
              )
        }
        onCompletar={(taskId, done) =>
          escribir(
            `/api/admin/leads/tasks/${taskId}`,
            { method: "PATCH", body: JSON.stringify({ done }) },
            done ? "Tarea lista" : "Tarea reabierta",
          )
        }
        onBorrar={(taskId) =>
          escribir(
            `/api/admin/leads/tasks/${taskId}`,
            { method: "DELETE" },
            "Tarea borrada",
          )
        }
      />

      <Historial
        activity={activity}
        disabled={guardando}
        onRegistrar={(payload, exito) =>
          escribir(
            `/api/admin/leads/${leadId}/activity`,
            { method: "POST", body: JSON.stringify(payload) },
            exito,
          )
        }
      />
    </div>
  );
}

// -----------------------------------------------------------------------------

function EtapaSelector({
  stage,
  disabled,
  onChange,
}: {
  stage: LeadStage;
  disabled: boolean;
  onChange: (stage: LeadStage) => void;
}) {
  return (
    <section>
      <DetailSectionTitle>Etapa</DetailSectionTitle>
      <div className="mt-2">
        <Select
          value={stage}
          onChange={(v) => v !== stage && onChange(v as LeadStage)}
          disabled={disabled}
          aria-label="Etapa del lead"
          options={LEAD_STAGES.map((s) => ({ value: s, label: LEAD_STAGE_LABELS[s] }))}
        />
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------

const URGENCIA_TONO = {
  vencida: "destructive",
  hoy: "lime",
  proxima: "neutral",
} as const;

const URGENCIA_TEXTO = {
  vencida: "Vencida",
  hoy: "Hoy",
  proxima: "",
} as const;

function Tareas({
  tasks,
  disabled,
  puedeAgendarReunion,
  onCrear,
  onCompletar,
  onBorrar,
}: {
  tasks: LeadTaskRow[];
  disabled: boolean;
  puedeAgendarReunion: boolean;
  /** `duracion === null` = recordatorio interno; un número = reunión real. */
  onCrear: (title: string, dueAt: string, duracion: number | null) => Promise<boolean>;
  onCompletar: (taskId: string, done: boolean) => Promise<boolean>;
  onBorrar: (taskId: string) => Promise<boolean>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [esReunion, setEsReunion] = useState(false);
  const [duracion, setDuracion] = useState(45);
  const [title, setTitle] = useState("");
  // Arranca mañana a las 10:00 de Chile: es el próximo paso más habitual y
  // evita que agendar cueste tocar el calendario cada vez.
  const [cuando, setCuando] = useState(() => {
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return `${isoToChileWallTime(manana.toISOString()).slice(0, 10)}T10:00`;
  });

  const pendientes = tasks.filter((t) => !t.done_at);
  const hechas = tasks.filter((t) => t.done_at);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    // `cuando` también se valida: vaciar el selector de fecha deja el campo en
    // "" y `chileWallTimeToIso("")` revienta al partir el string, dejando el
    // formulario mudo (sin aviso y sin petición).
    if (!title.trim() || !cuando) return;
    const ok = await onCrear(
      title.trim(),
      chileWallTimeToIso(cuando),
      esReunion ? duracion : null,
    );
    if (ok) {
      setTitle("");
      setEsReunion(false);
      setAbierto(false);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <DetailSectionTitle>Próximos pasos</DetailSectionTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAbierto((v) => !v)}
          disabled={disabled}
        >
          {abierto ? "Cancelar" : "Agendar"}
        </Button>
      </div>

      {abierto && (
        <form onSubmit={enviar} className="mt-2 flex flex-col gap-2">
          {puedeAgendarReunion && (
            <div className="flex gap-1.5" role="radiogroup" aria-label="Tipo">
              {[
                { v: false, label: "Recordatorio" },
                { v: true, label: "Reunión" },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  role="radio"
                  aria-checked={esReunion === o.v}
                  onClick={() => setEsReunion(o.v)}
                  className={cn(
                    "ca-btn-interactive rounded-full border px-3 py-1 text-[12px] font-bold",
                    esReunion === o.v
                      ? "border-transparent bg-ca-ink text-ca-surface"
                      : "border-ca-ink/[0.14] text-ca-ink-soft hover:bg-ca-bg-soft",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={esReunion ? "Reunión de admisión" : "Llamar para confirmar interés"}
            maxLength={200}
            aria-label="Qué hay que hacer"
            autoFocus
          />
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={cuando}
              onChange={(e) => setCuando(e.target.value)}
              aria-label="Cuándo"
            />
            {esReunion && (
              <Select
                value={String(duracion)}
                onChange={(v) => setDuracion(Number(v))}
                aria-label="Duración"
                className="w-32 shrink-0"
                options={[30, 45, 60, 90].map((m) => ({ value: String(m), label: `${m} min` }))}
              />
            )}
            <Button type="submit" size="sm" disabled={disabled || !title.trim() || !cuando}>
              Agendar
            </Button>
          </div>

          {/* El lead recibe un correo real de Google: decirlo antes evita la
              sorpresa de haber contactado a un prospecto sin querer. */}
          {esReunion && (
            <p className="text-[11px] leading-relaxed text-ca-ink-soft">
              Se creará en el calendario de la profesora y{" "}
              <strong className="font-bold">al lead le llegará una invitación</strong> con
              enlace de Meet.
            </p>
          )}
        </form>
      )}

      {pendientes.length === 0 && hechas.length === 0 ? (
        <p className="mt-2 text-[13px] text-ca-ink-soft">
          Sin nada agendado para este lead.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {[...pendientes, ...hechas].map((task) => {
            const urgencia = urgenciaDeTarea(task.due_at);
            const hecha = Boolean(task.done_at);
            return (
              <li
                key={task.id}
                className="flex items-start gap-2.5 rounded-xl border border-ca-ink/[0.08] p-3"
              >
                <input
                  type="checkbox"
                  checked={hecha}
                  disabled={disabled}
                  onChange={() => onCompletar(task.id, !hecha)}
                  aria-label={hecha ? `Reabrir ${task.title}` : `Marcar ${task.title} como hecha`}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-ca-lime-deep"
                />
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "break-words text-[13px] font-bold text-ca-ink",
                      hecha && "text-ca-ink-soft line-through",
                    )}
                  >
                    {task.title}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-ca-ink-soft">
                      {formatLeadDate(task.due_at)}
                      {task.kind === "meeting" && task.duration_minutes
                        ? ` · ${task.duration_minutes} min`
                        : ""}
                    </span>
                    {!hecha && urgencia !== "proxima" && (
                      <Badge tone={URGENCIA_TONO[urgencia]} size="sm">
                        {URGENCIA_TEXTO[urgencia]}
                      </Badge>
                    )}
                    {task.meet_url && (
                      <a
                        href={task.meet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold text-ca-violet underline"
                      >
                        Meet
                      </a>
                    )}
                    {/* Nunca dar por agendado lo que no llegó al calendario. */}
                    {task.kind === "meeting" && task.sync_error && (
                      <Badge tone="amber" size="sm" title={task.sync_error}>
                        No llegó al calendario
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onBorrar(task.id)}
                  aria-label={`Borrar ${task.title}`}
                  className="h-8 shrink-0 px-2 text-ca-ink-soft"
                >
                  ×
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------

type RegistroPayload =
  | { kind: "note"; body: string }
  | { kind: "call"; outcome: LeadCallOutcome }
  | { kind: "email" | "whatsapp" };

function Historial({
  activity,
  disabled,
  onRegistrar,
}: {
  activity: LeadActivityRow[];
  disabled: boolean;
  onRegistrar: (payload: RegistroPayload, exito: string) => Promise<boolean>;
}) {
  const [nota, setNota] = useState("");

  async function guardarNota(e: FormEvent) {
    e.preventDefault();
    if (!nota.trim()) return;
    const ok = await onRegistrar({ kind: "note", body: nota.trim() }, "Nota guardada");
    if (ok) setNota("");
  }

  return (
    <section>
      <DetailSectionTitle>Seguimiento</DetailSectionTitle>

      {/* Registrar el contacto es un clic: el punto es que quede constancia,
          no que haya que llenar un formulario cada vez que se marca un número. */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onRegistrar({ kind: "call", outcome: "answered" }, "Llamada registrada")}
        >
          Contestó
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onRegistrar({ kind: "call", outcome: "no_answer" }, "Llamada registrada")}
        >
          No contestó
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onRegistrar({ kind: "whatsapp" }, "WhatsApp registrado")}
        >
          Le escribí
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onRegistrar({ kind: "email" }, "Correo registrado")}
        >
          Le mandé correo
        </Button>
      </div>

      <form onSubmit={guardarNota} className="mt-2.5 flex flex-col gap-2">
        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Qué dijo, qué quedó pendiente…"
          rows={2}
          maxLength={2000}
          aria-label="Nota sobre el lead"
        />
        <Button type="submit" size="sm" disabled={disabled || !nota.trim()} className="self-start">
          Guardar nota
        </Button>
      </form>

      {activity.length === 0 ? (
        <p className="mt-3 text-[13px] text-ca-ink-soft">Todavía no hay contactos registrados.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {activity.map((a) => (
            <li key={a.id} className="rounded-xl border border-ca-ink/[0.08] p-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ca-ink">
                  {LEAD_ACTIVITY_LABELS[a.kind]}
                </span>
                {a.outcome && (
                  <span className="text-[11px] font-bold text-ca-ink-soft">
                    · {LEAD_CALL_OUTCOME_LABELS[a.outcome]}
                  </span>
                )}
                <span
                  className="ml-auto font-mono text-[11px] text-ca-ink-soft"
                  title={formatLeadDateFull(a.created_at)}
                >
                  {formatLeadDate(a.created_at)}
                </span>
              </div>
              {a.body && (
                <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-ca-ink">
                  {a.body}
                </p>
              )}
              {a.author_name && (
                <p className="mt-1 text-[11px] text-ca-ink-soft">{a.author_name}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
