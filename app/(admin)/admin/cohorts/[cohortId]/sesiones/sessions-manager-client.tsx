"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ClassSession,
  SessionInstructor,
  SessionResource,
  SessionResourceType,
} from "@/lib/classroom/types";
import { MonthCalendar } from "@/components/classroom/month-calendar";
import { SessionQuizPanel } from "@/components/admin/quiz/session-quiz-panel";
import { SessionRecordingPanel } from "@/components/admin/session-recording-panel";
import { SessionQrButton } from "@/components/admin/session-qr";
import { SessionAttendanceButton } from "@/components/admin/session-attendance-button";
import { SessionDeleteDialog } from "@/components/admin/session-delete-dialog";
import {
  SessionChangeNoticeDialog,
  type AvisoTarget,
} from "@/components/admin/session-change-notice-dialog";
import { SessionResourcesPanel } from "@/components/admin/session-resources-panel";
import { CoverImageField } from "@/components/admin/cover-image-field";
import {
  ArrowLeftIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CalendarIcon,
  UploadIcon,
} from "@/components/admin/icons";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import { chileWallTimeToIso, isoToChileWallTime } from "@/lib/time";
import { needsRecordingUpload } from "@/lib/classroom/session-recording";
import { meetingPath } from "@/lib/livekit/meeting-code";

const TZ = "America/Santiago";

type Modality = "live_in_person" | "live_online" | "recorded";
type Audience = "all" | "capital_inteligente";
type SessionStatus = "scheduled" | "in_progress" | "finished" | "cancelled";

type CohortInfo = { id: string; name: string; code: string };

type FormState = {
  title: string;
  starts_at: string; // valor datetime-local (hora de Santiago)
  ends_at: string; // valor datetime-local (hora de Santiago)
  modality: Modality;
  teacher_id: string; // "" = sin docente
  module_id: string; // "" = sin módulo
  meeting_url: string;
  audience: Audience;
  status: SessionStatus;
  /** Sala abierta a invitados sin cuenta (0099). */
  guest_access: boolean;
};

const MODALITY_LABELS: Record<Modality, string> = {
  live_online: "Online en vivo",
  live_in_person: "Presencial",
  recorded: "Grabada",
};

const AUDIENCE_LABELS: Record<Audience, string> = {
  all: "Toda la cohorte",
  capital_inteligente: "Solo Capital Inteligente",
};

const STATUS_LABELS: Record<SessionStatus, string> = {
  scheduled: "Programada",
  in_progress: "En curso",
  finished: "Finalizada",
  cancelled: "Cancelada",
};

const STATUS_PILL: Record<SessionStatus, string> = {
  scheduled: "bg-ca-violet/10 text-ca-violet",
  in_progress: "bg-ca-lime text-ca-ink",
  finished: "bg-ca-bg-soft text-ca-ink-soft",
  cancelled: "bg-ca-amber/15 text-[#8b6914]",
};

// --- Helpers de fecha (NO se ejecutan en el cuerpo del render) ---------------
// La conversión hora de pared (Chile) ↔ ISO vive en lib/time.ts
// (isoToChileWallTime / chileWallTimeToIso) — ver ese archivo para el porqué
// de las dos pasadas en la conversión de vuelta a ISO.

function fmtRange(startsAt: string, endsAt: string): string {
  const day = new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(startsAt));
  const start = new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(startsAt));
  const end = new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(endsAt));
  return `${day} · ${start}–${end}`;
}

function CollapsibleSection({
  title,
  icon,
  subtitle,
  summary,
  defaultOpen,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="ca-card group mb-4 overflow-hidden" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 hover:bg-ca-bg-soft [&::-webkit-details-marker]:hidden">
        {icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ca-violet/10 text-ca-violet">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold text-ca-ink">{title}</p>
          {subtitle && (
            <p className="mt-0.5 truncate text-[11px] text-ca-ink-soft">{subtitle}</p>
          )}
        </div>
        {summary && (
          <span className="shrink-0 text-[11px] font-semibold text-ca-ink-soft">{summary}</span>
        )}
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 shrink-0 text-ca-ink-soft transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="border-t border-ca-ink/[0.06] px-5 py-4">{children}</div>
    </details>
  );
}

type TimeState = "live" | "upcoming" | "past";

function timeStateOf(s: ClassSession, nowMs: number): TimeState {
  const start = new Date(s.starts_at).getTime();
  const end = new Date(s.ends_at).getTime();
  if (start <= nowMs && nowMs <= end) return "live";
  if (start > nowMs) return "upcoming";
  return "past";
}

const TIME_STATE_PILL: Record<TimeState, string> = {
  live: "bg-ca-lime text-ca-ink",
  upcoming: "bg-ca-violet/10 text-ca-violet",
  past: "bg-ca-bg-soft text-ca-ink-soft",
};

const TIME_STATE_LABEL: Record<TimeState, string> = {
  live: "En vivo",
  upcoming: "Próxima",
  past: "Finalizada",
};

function emptyForm(): FormState {
  return {
    title: "",
    starts_at: "",
    ends_at: "",
    modality: "live_online",
    teacher_id: "",
    module_id: "",
    meeting_url: "",
    audience: "all",
    status: "scheduled",
    guest_access: false,
  };
}

function formFromSession(s: ClassSession): FormState {
  return {
    title: s.title ?? "",
    starts_at: isoToChileWallTime(s.starts_at),
    ends_at: isoToChileWallTime(s.ends_at),
    modality: s.modality as Modality,
    teacher_id: s.teacher_id ?? "",
    module_id: (s as unknown as { module_id?: string }).module_id ?? "",
    meeting_url: s.meeting_url ?? "",
    audience: (s.audience as Audience) ?? "all",
    status: s.status as SessionStatus,
    guest_access: Boolean(s.guest_access),
  };
}

type ModuleOption = { id: string; title: string; position: number };

export function SessionsManagerClient({
  cohort,
  programId,
  programName,
  initialSessions,
  instructors,
  initialResources,
  modules = [],
  focusSessionId = null,
  abrirCreacion = false,
  readyRecordingSessionIds = [],
}: {
  cohort: CohortInfo;
  programId: string | null;
  programName: string;
  initialSessions: ClassSession[];
  instructors: SessionInstructor[];
  initialResources: SessionResource[];
  modules?: ModuleOption[];
  focusSessionId?: string | null;
  abrirCreacion?: boolean;
  /** Clases cuya repetición ya está publicada: no se les ofrece el atajo. */
  readyRecordingSessionIds?: string[];
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<ClassSession[]>(initialSessions);
  const [resources, setResources] = useState<SessionResource[]>(initialResources);
  const [editing, setEditing] = useState<ClassSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "month">("list");
  const [now, setNow] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClassSession | null>(null);
  // Aviso de reprogramación / cancelación (0094). Se ofrece DESPUÉS de guardar
  // un cambio de horario y ANTES de borrar una clase.
  const [avisoTarget, setAvisoTarget] = useState<AvisoTarget | null>(null);
  const [avisoMsg, setAvisoMsg] = useState<string | null>(null);
  // Enlace de sala recién copiado (id de la sesión), para el swap "¡Copiado!".
  const [salaCopiada, setSalaCopiada] = useState<string | null>(null);
  // El panel de grabación vive dentro de la edición y nadie lo encontraba: el
  // atajo de la fila abre la edición y deja ese panel abierto y a la vista.
  // Contador y no booleano: el segundo clic en "Subir grabación" sobre la
  // MISMA clase debe volver a abrir la sección y scrollear — con un booleano
  // ya en true, React descarta el set y el clic era un no-op.
  const [recordingFocus, setRecordingFocus] = useState(0);
  const recordingSectionRef = useRef<HTMLDivElement | null>(null);
  const readyRecordings = new Set(readyRecordingSessionIds);

  async function copiarSala(s: ClassSession) {
    const base =
      typeof window !== "undefined" ? window.location.origin : "https://capitalacademy.cl";
    try {
      await navigator.clipboard.writeText(`${base}${meetingPath(s.code)}`);
      setSalaCopiada(s.id);
      setTimeout(() => setSalaCopiada((prev) => (prev === s.id ? null : prev)), 2000);
    } catch {
      // El portapapeles puede estar bloqueado por el navegador; no es fatal.
    }
  }

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const teacherName = (id: string | null) =>
    id ? (instructors.find((i) => i.id === id)?.full_name ?? "Sin docente") : "Sin docente";

  function openCreate() {
    setForm(emptyForm());
    setError(null);
    setEditing(null);
    setCreating(true);
  }

  function openEdit(s: ClassSession) {
    setForm(formFromSession(s));
    setError(null);
    setCreating(false);
    setRecordingFocus(0);
    setEditing(s);
  }

  // Atajo "Subir grabación" de la fila: misma edición, pero con el panel de
  // repetición abierto y desplazado a la vista.
  function openRecording(s: ClassSession) {
    openEdit(s);
    setRecordingFocus((n) => n + 1);
  }

  useEffect(() => {
    if (recordingFocus === 0 || !editing) return;
    recordingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [recordingFocus, editing]);

  // Deep-link desde el calendario del admin (?nueva=1): abre el formulario de
  // creación de una vez — quien llegó acá desde "+ Nueva clase" no tiene que
  // encontrar el botón de nuevo. Solo al montar.
  const creacionAbierta = useRef(false);
  useEffect(() => {
    if (!abrirCreacion || creacionAbierta.current) return;
    creacionAbierta.current = true;
    openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirCreacion]);

  // Deep-link desde el editor de Lecciones (?session=<id>): abre directamente el
  // formulario de edición de esa clase. Solo una vez al montar.
  const focusHandled = useRef(false);
  useEffect(() => {
    if (focusHandled.current || !focusSessionId) return;
    const target = initialSessions.find((s) => s.id === focusSessionId);
    if (target) {
      focusHandled.current = true;
      openEdit(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSessionId]);

  // Crear desde la grilla: prefija el día clickeado (09:00–11:00 hora Chile).
  function openCreateForDay(dayKey: string) {
    setForm({ ...emptyForm(), starts_at: `${dayKey}T09:00`, ends_at: `${dayKey}T11:00` });
    setError(null);
    setEditing(null);
    setCreating(true);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setError(null);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // La portada se guarda por su propio endpoint, fuera del PATCH del formulario.
  // Sin esto la fila en memoria queda con la portada vieja y al reabrir la
  // edición el campo aparecería vacío aunque la imagen sí exista.
  function applyCoverChange(sessionId: string, url: string | null) {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, cover_image_url: url } : s)),
    );
    setEditing((prev) => (prev && prev.id === sessionId ? { ...prev, cover_image_url: url } : prev));
  }

  async function reloadSessions() {
    try {
      const res = await fetch(`/api/admin/sessions?cohort_id=${cohort.id}`);
      if (!res.ok) {
        setError("No se pudo recargar la lista de sesiones.");
        return;
      }
      const json = (await res.json()) as { sessions: ClassSession[] };
      setSessions(json.sessions ?? []);
    } catch {
      setError("No se pudo recargar la lista de sesiones.");
    }
  }

  async function handleSubmit() {
    setError(null);

    if (!form.title.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    if (!form.starts_at || !form.ends_at) {
      setError("Debes indicar inicio y término.");
      return;
    }
    if (chileWallTimeToIso(form.ends_at) <= chileWallTimeToIso(form.starts_at)) {
      setError("La hora de término debe ser posterior al inicio.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      starts_at: chileWallTimeToIso(form.starts_at),
      ends_at: chileWallTimeToIso(form.ends_at),
      modality: form.modality,
      teacher_id: form.teacher_id || null,
      module_id: form.module_id || null,
      meeting_url: form.meeting_url.trim() || null,
      audience: form.audience,
      status: form.status,
      guest_access: form.guest_access,
    };

    setSaving(true);
    try {
      const res = editing
        ? await fetch(`/api/admin/sessions/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/admin/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, cohort_id: cohort.id }),
          });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "No se pudo guardar la sesión.");
        return;
      }

      // Si se movió una clase que ya existía, se ofrece avisar. Los alumnos que
      // ya recibieron un recordatorio tienen la hora vieja en su bandeja y esa
      // ventana nunca se reenvía sola.
      const movida =
        editing &&
        (payload.starts_at !== editing.starts_at || payload.ends_at !== editing.ends_at);

      if (movida) {
        setAvisoTarget({
          sessionId: editing.id,
          title: payload.title,
          kind: "rescheduled",
          previousStartsAt: editing.starts_at,
          previousEndsAt: editing.ends_at,
          newStartsAt: payload.starts_at,
          newEndsAt: payload.ends_at,
        });
      }

      await reloadSessions();
      closeForm();
    } catch {
      setError("Error de red al guardar la sesión.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Borrar es el segundo paso, no el primero: el aviso de cancelación necesita
   * la fila viva para saber a quién escribirle y qué horario tenía. Así que al
   * confirmar el borrado se abre el diálogo de aviso, y el DELETE corre recién
   * cuando ese diálogo se cierra —haya avisado o no.
   */
  function confirmDelete() {
    if (!deleteTarget) return;
    setAvisoTarget({
      sessionId: deleteTarget.id,
      title: deleteTarget.title ?? "Clase",
      kind: "cancelled",
      previousStartsAt: deleteTarget.starts_at,
      previousEndsAt: deleteTarget.ends_at,
    });
    setDeleteTarget(null);
  }

  async function borrarSesion(sessionId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "No se pudo eliminar la sesión.");
        return;
      }
      await reloadSessions();
    } catch {
      setError("Error de red al eliminar la sesión.");
    } finally {
      setSaving(false);
    }
  }

  /** Cierre del diálogo de aviso: si venía de un borrado, ahora sí se borra. */
  async function cerrarAviso() {
    const pendienteDeBorrar = avisoTarget?.kind === "cancelled" ? avisoTarget.sessionId : null;
    setAvisoTarget(null);
    if (pendienteDeBorrar) await borrarSesion(pendienteDeBorrar);
  }

  async function addResource(
    payload:
      | { source: "link"; title: string; type: SessionResourceType; url: string }
      | {
          source: "file";
          title: string;
          type: SessionResourceType;
          storagePath: string;
          fileSizeBytes: number;
        },
  ) {
    if (!editing) return;
    const res = await fetch("/api/admin/session-resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: editing.id, ...payload }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error ?? "No se pudo agregar el recurso.");
    }
    const created = (await res.json()) as SessionResource;
    setResources((prev) => [...prev, created]);
  }

  async function removeResource(id: string) {
    const res = await fetch(`/api/admin/session-resources?id=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error ?? "No se pudo eliminar el recurso.");
    }
    setResources((prev) => prev.filter((r) => r.id !== id));
  }

  const showForm = creating || editing !== null;

  const upcomingSessions =
    now !== null ? sessions.filter((s) => timeStateOf(s, now) !== "past") : [];
  const pastSessions =
    now !== null
      ? sessions
          .filter((s) => timeStateOf(s, now) === "past")
          .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
      : [];

  function renderSessionCard(s: ClassSession) {
    const status = s.status as SessionStatus;
    const timeState = now !== null ? timeStateOf(s, now) : null;
    const useDerivedPill = timeState !== null && status !== "cancelled";
    const pillLabel = useDerivedPill ? TIME_STATE_LABEL[timeState] : STATUS_LABELS[status];
    const pillClass = useDerivedPill ? TIME_STATE_PILL[timeState] : STATUS_PILL[status];
    const isPast = timeState === "past";
    const needsRecording = needsRecordingUpload({
      isPast,
      status,
      modality: s.modality,
      hasReadyRecording: readyRecordings.has(s.id),
    });

    const qrButton = (
      <SessionQrButton
        key="qr"
        sessionId={s.id}
        sessionTitle={s.title ?? "Clase en vivo"}
        emphasized={timeState !== null && !isPast}
      />
    );
    const attendanceButton = (
      <SessionAttendanceButton
        key="attendance"
        sessionId={s.id}
        sessionTitle={s.title ?? "Clase en vivo"}
        emphasized={isPast}
      />
    );

    return (
      <div
        key={s.id}
        className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-bold text-ca-ink-soft">
              {fmtRange(s.starts_at, s.ends_at)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pillClass}`}
            >
              {pillLabel}
            </span>
            {s.audience === "capital_inteligente" && (
              <span className="rounded-full bg-ca-navy-ink/[0.06] px-2 py-0.5 text-[10px] font-bold text-ca-ink">
                Solo CI
              </span>
            )}
          </div>
          <h3 className="mt-1 truncate text-[15px] font-extrabold tracking-tight text-ca-ink">
            {s.title ?? "Sin título"}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-ca-ink-soft">
            <span>{MODALITY_LABELS[s.modality as Modality]}</span>
            <span>·</span>
            <span>{teacherName(s.teacher_id)}</span>
            {s.meeting_url && (
              <>
                <span>·</span>
                <a
                  href={s.meeting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-ca-violet hover:underline"
                >
                  Enlace
                </a>
              </>
            )}
            {/* La sala propia existe para toda clase no grabada: el código nace
                con la sesión (0089), pero hasta ahora el admin no lo veía en
                ninguna parte — solo el alumno, en su pantalla de clase. */}
            {s.modality !== "recorded" && s.code && (
              <>
                <span>·</span>
                <a
                  href={meetingPath(s.code)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-ca-violet hover:underline"
                >
                  Abrir sala
                </a>
                <button
                  type="button"
                  onClick={() => copiarSala(s)}
                  aria-label={`Copiar enlace de la sala de ${s.title ?? "la clase"}`}
                  className="font-bold text-ca-violet hover:underline"
                >
                  {salaCopiada === s.id ? "¡Copiado!" : "Copiar enlace de la sala"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {isPast ? (
            <>
              {needsRecording && (
                <Button
                  variant="outline"
                  onClick={() => openRecording(s)}
                  aria-label={`Subir la grabación de ${s.title ?? "la clase"}`}
                  className="!h-auto gap-1.5 rounded-xl border-ca-violet/40 px-3 py-2 text-[12px] text-ca-violet hover:border-ca-violet hover:text-ca-violet"
                >
                  <UploadIcon size={14} />
                  Subir grabación
                </Button>
              )}
              {attendanceButton}
              {qrButton}
            </>
          ) : (
            <>
              {qrButton}
              {attendanceButton}
            </>
          )}
          <Button
            variant="outline"
            onClick={() => openEdit(s)}
            aria-label="Editar sesión"
            className="!h-auto gap-1.5 rounded-xl px-3 py-2 text-[12px] hover:border-ca-violet hover:text-ca-violet"
          >
            <PencilIcon />
            Editar
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
              setDeleteTarget(s);
            }}
            aria-label="Eliminar sesión"
            disabled={saving}
            className="!h-auto gap-1.5 rounded-xl px-3 py-2 text-[12px] text-ca-ink-soft hover:border-ca-amber hover:text-[#8b6914]"
          >
            <TrashIcon />
            Eliminar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Button
        variant="ghost"
        onClick={() => router.back()}
        className="mb-5 !h-auto !w-auto gap-1.5 rounded-full !px-0 !py-0 text-[13px] font-bold text-ca-ink-soft hover:!bg-transparent hover:text-ca-violet"
      >
        <ArrowLeftIcon />
        Volver
      </Button>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
            {programName}
          </div>
          <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">
            Calendario de clases
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="font-mono text-[12px] font-bold text-ca-ink-soft">
              {cohort.code}
            </span>
            <span className="text-[11px] text-ca-ink-soft">{cohort.name}</span>
          </div>
        </div>
        {!showForm && (
          <Button
            variant="lime"
            onClick={openCreate}
            className="!h-auto gap-2 self-start px-5 py-2.5 text-[13px] sm:self-auto"
          >
            <PlusIcon />
            Nueva sesión
          </Button>
        )}
      </div>

      <div className="mb-5 flex items-center gap-1 self-start rounded-2xl bg-ca-bg-soft p-1">
        <Button
          variant="ghost"
          onClick={() => setView("list")}
          className={`!h-auto rounded-xl px-4 py-2 text-[13px] hover:!bg-transparent ${
            view === "list" ? "bg-white text-ca-ink shadow-sm hover:!bg-white" : "text-ca-ink-soft hover:!text-ca-ink"
          }`}
        >
          Lista
        </Button>
        <Button
          variant="ghost"
          onClick={() => setView("month")}
          className={`!h-auto rounded-xl px-4 py-2 text-[13px] hover:!bg-transparent ${
            view === "month" ? "bg-white text-ca-ink shadow-sm hover:!bg-white" : "text-ca-ink-soft hover:!text-ca-ink"
          }`}
        >
          Mes
        </Button>
      </div>

      {error && !showForm && (
        <div className="mb-4 rounded-xl border border-ca-amber/40 bg-ca-amber/10 px-4 py-3 text-[13px] font-semibold text-[#8b6914]">
          {error}
        </div>
      )}

      {showForm && (
        <CollapsibleSection
          title={editing ? "Editar sesión" : "Nueva sesión"}
          icon={<PencilIcon />}
          defaultOpen
        >
          <SessionForm
            form={form}
            instructors={instructors}
            modules={modules}
            saving={saving}
            error={error}
            editingSession={editing}
            onChange={updateField}
            onCoverChanged={applyCoverChange}
            onCancel={closeForm}
            onSubmit={handleSubmit}
          />
        </CollapsibleSection>
      )}

      {editing && (
        <CollapsibleSection
          title="Material de la clase"
          summary={`${resources.filter((r) => r.session_id === editing.id).length} recursos`}
        >
          <SessionResourcesPanel
            sessionId={editing.id}
            resources={resources.filter((r) => r.session_id === editing.id)}
            onAdd={addResource}
            onRemove={removeResource}
          />
        </CollapsibleSection>
      )}

      {editing && programId && (
        <CollapsibleSection
          title="Evaluación de la clase"
          subtitle="Quiz o nota manual, por enlace o QR"
        >
          <SessionQuizPanel
            programId={programId}
            sessionId={editing.id}
            sessionLabel={editing.title ?? "Clase en vivo"}
          />
        </CollapsibleSection>
      )}

      {editing && (
        <div ref={recordingSectionRef}>
          {/* `key` por clase y foco: `<details open>` no se reabre solo si el
              usuario lo cerró a mano, así que cada apertura monta uno nuevo. */}
          <CollapsibleSection
            key={`${editing.id}:${recordingFocus}`}
            title="Repetición de la clase"
            subtitle="Sube la grabación de la clase en vivo"
            defaultOpen={recordingFocus > 0}
          >
            {/* Cuando la repetición queda lista, el atajo "Subir grabación" de la
                fila debe desaparecer: la lista viene del server, así que se refresca. */}
            <SessionRecordingPanel sessionId={editing.id} onReady={() => router.refresh()} />
          </CollapsibleSection>
        </div>
      )}

      {view === "month" ? (
        <MonthCalendar
          sessions={sessions}
          onDayClick={(key) => openCreateForDay(key)}
          onSessionClick={(s) => openEdit(s)}
        />
      ) : sessions.length === 0 ? (
        <div className="ca-card grid place-items-center gap-2 p-12 text-center">
          <div
            className="mb-2 grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: "var(--color-ca-bg-soft)" }}
          >
            <CalendarIcon size={22} />
          </div>
          <div className="text-[15px] font-bold text-ca-ink">
            Aún no hay sesiones
          </div>
          <p className="text-[13px] text-ca-ink-soft">
            Crea la primera clase con el botón &ldquo;Nueva sesión&rdquo;.
          </p>
        </div>
      ) : now === null ? (
        <div className="ca-card divide-y divide-ca-ink/[0.06] overflow-hidden">
          {sessions.map((s) => renderSessionCard(s))}
        </div>
      ) : (
        <>
          {upcomingSessions.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-[11px] font-black uppercase tracking-[0.2em] text-ca-ink-soft">
                Próximas
              </h2>
              <div className="ca-card divide-y divide-ca-ink/[0.06] overflow-hidden">
                {upcomingSessions.map((s) => renderSessionCard(s))}
              </div>
            </>
          )}
          {pastSessions.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-[11px] font-black uppercase tracking-[0.2em] text-ca-ink-soft">
                Pasadas
              </h2>
              <div className="ca-card divide-y divide-ca-ink/[0.06] overflow-hidden">
                {pastSessions.map((s) => renderSessionCard(s))}
              </div>
            </>
          )}
        </>
      )}

      <SessionDeleteDialog
        open={deleteTarget !== null}
        session={deleteTarget}
        resourceCount={resources.filter((r) => r.session_id === deleteTarget?.id).length}
        deleting={saving}
        error={error}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      {/* `key` por clase y tipo de aviso: remonta el diálogo en cada apertura,
          para que el motivo escrito la vez anterior no reaparezca. */}
      <SessionChangeNoticeDialog
        key={avisoTarget ? `${avisoTarget.sessionId}:${avisoTarget.kind}` : "sin-aviso"}
        target={avisoTarget}
        onClose={cerrarAviso}
        onDone={setAvisoMsg}
      />

      {avisoMsg && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ca-ink px-4 py-3 text-[13px] font-semibold text-white shadow-lg"
        >
          {avisoMsg}
          <button
            type="button"
            onClick={() => setAvisoMsg(null)}
            className="ml-3 text-white/60 hover:text-white"
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function SessionForm({
  form,
  instructors,
  modules,
  saving,
  error,
  editingSession,
  onChange,
  onCoverChanged,
  onCancel,
  onSubmit,
}: {
  form: FormState;
  instructors: SessionInstructor[];
  modules: ModuleOption[];
  saving: boolean;
  error: string | null;
  /** null = creando. La portada necesita el id de la fila, así que solo se
      ofrece sobre una clase que ya existe. */
  editingSession: ClassSession | null;
  onChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onCoverChanged: (sessionId: string, url: string | null) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const isEditing = editingSession !== null;
  const fieldCls = "text-[16px] md:text-[13px] font-medium";
  const labelCls =
    "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-ca-ink-soft";
  const groupCls = "border-t border-ca-ink/[0.06] pt-5";

  return (
    <div>
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelCls} htmlFor="session-title">
              Título
            </label>
            <Input
              id="session-title"
              type="text"
              value={form.title}
              onChange={(e) => onChange("title", e.target.value)}
              placeholder="Ej. Introducción a la inversión"
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="session-starts">
              Inicio (hora Chile)
            </label>
            <DatePicker
              withTime
              id="session-starts"
              value={form.starts_at}
              onChange={(v) => onChange("starts_at", v)}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="session-ends">
              Término (hora Chile)
            </label>
            <DatePicker
              withTime
              id="session-ends"
              value={form.ends_at}
              onChange={(v) => onChange("ends_at", v)}
            />
          </div>
        </div>

        <div className={groupCls}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="session-modality">
                Modalidad
              </label>
              <Select
                id="session-modality"
                value={form.modality}
                onChange={(e) => onChange("modality", e.target.value as Modality)}
                className={fieldCls}
              >
                {(Object.keys(MODALITY_LABELS) as Modality[]).map((m) => (
                  <option key={m} value={m}>
                    {MODALITY_LABELS[m]}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className={labelCls} htmlFor="session-teacher">
                Docente
              </label>
              <Select
                id="session-teacher"
                value={form.teacher_id}
                onChange={(e) => onChange("teacher_id", e.target.value)}
                className={fieldCls}
              >
                <option value="">Sin docente</option>
                {instructors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.full_name}
                  </option>
                ))}
              </Select>
              {/* La lista sale de `instructors`, no de los roles de cohorte: quien
                  no tenga ficha no aparece acá por más que sea docente (ADR-0036). */}
              <p className="mt-1 text-[12px] text-ca-ink-soft">
                ¿Falta alguien? Crea su ficha en{" "}
                <a href="/admin/docentes" className="underline hover:text-ca-ink">
                  Docentes
                </a>
                .
              </p>
            </div>

            {modules.length > 0 && (
              <div>
                <label className={labelCls} htmlFor="session-module">
                  Módulo
                </label>
                <Select
                  id="session-module"
                  value={form.module_id}
                  onChange={(e) => onChange("module_id", e.target.value)}
                  className={fieldCls}
                >
                  <option value="">Sin módulo</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {String(m.position).padStart(2, "0")} · {m.title}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div>
              <label className={labelCls} htmlFor="session-audience">
                Audiencia
              </label>
              <Select
                id="session-audience"
                value={form.audience}
                onChange={(e) => onChange("audience", e.target.value as Audience)}
                className={fieldCls}
              >
                {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                  <option key={a} value={a}>
                    {AUDIENCE_LABELS[a]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="sm:col-span-2">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ca-ink/[0.08] p-3">
                <input
                  type="checkbox"
                  checked={form.guest_access}
                  onChange={(e) => onChange("guest_access", e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-ca-violet"
                />
                <span>
                  <span className="block text-[13px] font-bold text-ca-ink">
                    Permitir invitados sin cuenta
                  </span>
                  <span className="block text-[12px] text-ca-ink-soft">
                    Cualquiera con el enlace podrá pedir entrar escribiendo su nombre, y el
                    docente lo acepta desde la sala. Déjalo apagado en las clases del programa.
                  </span>
                </span>
              </label>
            </div>

            <div>
              <label className={labelCls} htmlFor="session-status">
                Estado
              </label>
              <Select
                id="session-status"
                value={form.status}
                onChange={(e) => onChange("status", e.target.value as SessionStatus)}
                className={fieldCls}
              >
                {(Object.keys(STATUS_LABELS) as SessionStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABELS[st]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        <div className={groupCls}>
          <label className={labelCls} htmlFor="session-url">
            Enlace de reunión (opcional)
          </label>
          <Input
            id="session-url"
            type="url"
            value={form.meeting_url}
            onChange={(e) => onChange("meeting_url", e.target.value)}
            placeholder="https://meet.google.com/…"
            className={fieldCls}
          />
        </div>

        {/* La portada se sube contra la fila, no contra el formulario: por eso
            solo aparece al editar y se guarda sola, sin pasar por "Guardar
            cambios". `key` por clase: el campo tiene estado propio y al saltar
            de una clase a otra mostraría la portada anterior. */}
        {editingSession && (
          <div className={groupCls}>
            <CoverImageField
              key={editingSession.id}
              target="session"
              id={editingSession.id}
              initialUrl={editingSession.cover_image_url}
              onChanged={(url) => onCoverChanged(editingSession.id, url)}
            />
            <p className="mt-2 text-[12px] text-ca-ink-soft">
              Opcional. Se muestra al alumno en la pantalla de la clase y en su calendario.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-ca-amber/40 bg-ca-amber/10 px-4 py-3 text-[13px] font-semibold text-[#8b6914]">
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button
          variant="lime"
          onClick={onSubmit}
          disabled={saving}
          className="!h-auto gap-2 px-5 py-2.5 text-[13px]"
        >
          {saving ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear sesión"}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={saving}
          className="!h-auto gap-2 rounded-xl px-5 py-2.5 text-[13px] text-ca-ink-soft hover:text-ca-ink"
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

