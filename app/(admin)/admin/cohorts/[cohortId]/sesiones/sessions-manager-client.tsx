"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  ClassSession,
  SessionInstructor,
  SessionResource,
  SessionResourceType,
} from "@/lib/classroom/types";
import { MonthCalendar } from "@/components/classroom/month-calendar";
import {
  ArrowLeftIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CalendarIcon,
} from "@/components/admin/icons";

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

/**
 * Convierte un ISO (UTC) al string `YYYY-MM-DDTHH:mm` que espera un input
 * datetime-local, expresado en la zona horaria de Santiago.
 */
function isoToLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Devuelve el offset (en minutos) de la zona de Santiago para un instante dado.
 */
function santiagoOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return (asUtc - at.getTime()) / 60000;
}

/**
 * Interpreta un valor datetime-local `YYYY-MM-DDTHH:mm` como hora de Santiago
 * y lo convierte al ISO UTC equivalente.
 */
function localInputToIso(local: string): string {
  const [datePart, timePart] = local.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);

  // Estimación inicial tratando los componentes como UTC.
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  const offset = santiagoOffsetMinutes(new Date(naiveUtc));
  return new Date(naiveUtc - offset * 60000).toISOString();
}

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
  };
}

function formFromSession(s: ClassSession): FormState {
  return {
    title: s.title ?? "",
    starts_at: isoToLocalInput(s.starts_at),
    ends_at: isoToLocalInput(s.ends_at),
    modality: s.modality as Modality,
    teacher_id: s.teacher_id ?? "",
    module_id: (s as unknown as { module_id?: string }).module_id ?? "",
    meeting_url: s.meeting_url ?? "",
    audience: (s.audience as Audience) ?? "all",
    status: s.status as SessionStatus,
  };
}

type ModuleOption = { id: string; title: string; position: number };

export function SessionsManagerClient({
  cohort,
  programName,
  initialSessions,
  instructors,
  initialResources,
  modules = [],
}: {
  cohort: CohortInfo;
  programName: string;
  initialSessions: ClassSession[];
  instructors: SessionInstructor[];
  initialResources: SessionResource[];
  modules?: ModuleOption[];
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
    setEditing(s);
  }

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
    } finally {
      router.refresh();
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
    if (localInputToIso(form.ends_at) <= localInputToIso(form.starts_at)) {
      setError("La hora de término debe ser posterior al inicio.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      starts_at: localInputToIso(form.starts_at),
      ends_at: localInputToIso(form.ends_at),
      modality: form.modality,
      teacher_id: form.teacher_id || null,
      module_id: form.module_id || null,
      meeting_url: form.meeting_url.trim() || null,
      audience: form.audience,
      status: form.status,
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

      await reloadSessions();
      closeForm();
    } catch {
      setError("Error de red al guardar la sesión.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(s: ClassSession) {
    const ok = window.confirm(
      `¿Eliminar la sesión "${s.title ?? "Sin título"}"? Esta acción no se puede deshacer.`,
    );
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/sessions/${s.id}`, {
        method: "DELETE",
      });
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

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-bold text-ca-ink-soft transition-colors hover:text-ca-violet"
      >
        <ArrowLeftIcon />
        Volver
      </button>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
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
        <button
          onClick={openCreate}
          className="ca-btn-primary inline-flex items-center gap-2 self-start px-5 py-2.5 text-[13px] font-bold sm:self-auto"
        >
          <PlusIcon />
          Nueva sesión
        </button>
      </div>

      <div className="mb-5 flex items-center gap-1 self-start rounded-2xl bg-ca-bg-soft p-1">
        <button
          onClick={() => setView("list")}
          className={`rounded-xl px-4 py-2 text-[13px] font-bold transition-colors ${
            view === "list" ? "bg-white text-ca-ink shadow-sm" : "text-ca-ink-soft hover:text-ca-ink"
          }`}
        >
          Lista
        </button>
        <button
          onClick={() => setView("month")}
          className={`rounded-xl px-4 py-2 text-[13px] font-bold transition-colors ${
            view === "month" ? "bg-white text-ca-ink shadow-sm" : "text-ca-ink-soft hover:text-ca-ink"
          }`}
        >
          Mes
        </button>
      </div>

      {error && !showForm && (
        <div className="mb-4 rounded-xl border border-ca-amber/40 bg-ca-amber/10 px-4 py-3 text-[13px] font-semibold text-[#8b6914]">
          {error}
        </div>
      )}

      {showForm && (
        <SessionForm
          form={form}
          instructors={instructors}
          modules={modules}
          saving={saving}
          error={error}
          isEditing={editing !== null}
          onChange={updateField}
          onCancel={closeForm}
          onSubmit={handleSubmit}
        />
      )}

      {editing && (
        <SessionResourcesPanel
          sessionId={editing.id}
          resources={resources.filter((r) => r.session_id === editing.id)}
          onAdd={addResource}
          onRemove={removeResource}
        />
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
      ) : (
        <div className="ca-card divide-y divide-ca-ink/[0.06] overflow-hidden">
          {sessions.map((s) => {
            const status = s.status as SessionStatus;
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
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_PILL[status]}`}
                    >
                      {STATUS_LABELS[status]}
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
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => openEdit(s)}
                    aria-label="Editar sesión"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-ca-ink/[0.1] px-3 py-2 text-[12px] font-bold text-ca-ink transition-colors hover:border-ca-violet hover:text-ca-violet"
                  >
                    <PencilIcon />
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    aria-label="Eliminar sesión"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-ca-ink/[0.1] px-3 py-2 text-[12px] font-bold text-ca-ink-soft transition-colors hover:border-ca-amber hover:text-[#8b6914] disabled:opacity-50"
                  >
                    <TrashIcon />
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })}
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
  isEditing,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: FormState;
  instructors: SessionInstructor[];
  modules: ModuleOption[];
  saving: boolean;
  error: string | null;
  isEditing: boolean;
  onChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const inputCls =
    "w-full rounded-xl border border-ca-ink/[0.14] bg-white px-3 py-2.5 text-[13px] font-medium text-ca-ink outline-none transition-colors focus:border-ca-violet";
  const labelCls =
    "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-ca-ink-soft";

  return (
    <div className="ca-card mb-6 p-6">
      <h2 className="mb-5 text-[18px] font-black text-ca-ink">
        {isEditing ? "Editar sesión" : "Nueva sesión"}
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className={labelCls} htmlFor="session-title">
            Título
          </label>
          <input
            id="session-title"
            type="text"
            value={form.title}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder="Ej. Introducción a la inversión"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="session-starts">
            Inicio (hora Chile)
          </label>
          <input
            id="session-starts"
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => onChange("starts_at", e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="session-ends">
            Término (hora Chile)
          </label>
          <input
            id="session-ends"
            type="datetime-local"
            value={form.ends_at}
            onChange={(e) => onChange("ends_at", e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="session-modality">
            Modalidad
          </label>
          <select
            id="session-modality"
            value={form.modality}
            onChange={(e) => onChange("modality", e.target.value as Modality)}
            className={inputCls}
          >
            {(Object.keys(MODALITY_LABELS) as Modality[]).map((m) => (
              <option key={m} value={m}>
                {MODALITY_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="session-teacher">
            Docente
          </label>
          <select
            id="session-teacher"
            value={form.teacher_id}
            onChange={(e) => onChange("teacher_id", e.target.value)}
            className={inputCls}
          >
            <option value="">Sin docente</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.full_name}
              </option>
            ))}
          </select>
        </div>

        {modules.length > 0 && (
          <div>
            <label className={labelCls} htmlFor="session-module">
              Módulo
            </label>
            <select
              id="session-module"
              value={form.module_id}
              onChange={(e) => onChange("module_id", e.target.value)}
              className={inputCls}
            >
              <option value="">Sin módulo</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {String(m.position).padStart(2, "0")} · {m.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="session-audience">
            Audiencia
          </label>
          <select
            id="session-audience"
            value={form.audience}
            onChange={(e) => onChange("audience", e.target.value as Audience)}
            className={inputCls}
          >
            {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_LABELS[a]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="session-status">
            Estado
          </label>
          <select
            id="session-status"
            value={form.status}
            onChange={(e) => onChange("status", e.target.value as SessionStatus)}
            className={inputCls}
          >
            {(Object.keys(STATUS_LABELS) as SessionStatus[]).map((st) => (
              <option key={st} value={st}>
                {STATUS_LABELS[st]}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className={labelCls} htmlFor="session-url">
            Enlace de reunión (opcional)
          </label>
          <input
            id="session-url"
            type="url"
            value={form.meeting_url}
            onChange={(e) => onChange("meeting_url", e.target.value)}
            placeholder="https://meet.google.com/..."
            className={inputCls}
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-ca-amber/40 bg-ca-amber/10 px-4 py-3 text-[13px] font-semibold text-[#8b6914]">
          {error}
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={onSubmit}
          disabled={saving}
          className="ca-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-[13px] font-bold disabled:opacity-60"
        >
          {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear sesión"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl border border-ca-ink/[0.1] px-5 py-2.5 text-[13px] font-bold text-ca-ink-soft transition-colors hover:text-ca-ink disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

const RESOURCE_TYPE_LABELS: Record<SessionResourceType, string> = {
  link: "Enlace",
  pdf: "PDF",
  document: "Documento",
  template: "Plantilla",
  other: "Otro",
};

const MAX_RESOURCE_SIZE = 50 * 1024 * 1024; // 50 MB
const RESOURCE_BUCKET = "lesson-resources";

function SessionResourcesPanel({
  sessionId,
  resources,
  onAdd,
  onRemove,
}: {
  sessionId: string;
  resources: SessionResource[];
  onAdd: (
    payload:
      | { source: "link"; title: string; type: SessionResourceType; url: string }
      | {
          source: "file";
          title: string;
          type: SessionResourceType;
          storagePath: string;
          fileSizeBytes: number;
        },
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"file" | "link">("file");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<SessionResourceType>("document");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleRemove(id: string) {
    setError(null);
    setRemovingId(id);
    try {
      await onRemove(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar el recurso.");
    } finally {
      setRemovingId(null);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-ca-ink/[0.14] bg-white px-3 py-2.5 text-[13px] font-medium text-ca-ink outline-none transition-colors focus:border-ca-violet";

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const selected = e.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_RESOURCE_SIZE) {
      setError("El archivo no puede superar 50 MB.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(selected);
    if (selected && !title.trim()) setTitle(selected.name.replace(/\.[^.]+$/, ""));
  }

  function resetForm() {
    setTitle("");
    setUrl("");
    setFile(null);
    setType("document");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAdd() {
    setError(null);
    if (!title.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    setAdding(true);
    try {
      if (mode === "link") {
        if (!url.trim()) {
          setError("El enlace es obligatorio.");
          return;
        }
        await onAdd({ source: "link", title: title.trim(), type, url: url.trim() });
      } else {
        if (!file) {
          setError("Selecciona un archivo.");
          return;
        }
        // 1. signed upload URL
        const urlRes = await fetch("/api/admin/session-resources/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, filename: file.name, size: file.size }),
        });
        if (!urlRes.ok) {
          const j = (await urlRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? "No se pudo iniciar la subida.");
        }
        const { path, token } = await urlRes.json();
        // 2. subida directa a Storage
        const supabase = createClient();
        const { error: upErr } = await supabase.storage
          .from(RESOURCE_BUCKET)
          .uploadToSignedUrl(path, token, file, {
            contentType: file.type || "application/octet-stream",
          });
        if (upErr) throw new Error("Error al subir el archivo.");
        // 3. persistir la fila
        await onAdd({
          source: "file",
          title: title.trim(),
          type,
          storagePath: path,
          fileSizeBytes: file.size,
        });
      }
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar el recurso.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="ca-card mb-6 p-6">
      <h2 className="mb-1 text-[18px] font-black text-ca-ink">
        Material de la clase
      </h2>
      <p className="mb-4 text-[12px] text-ca-ink-soft">
        Recursos asociados a esta sesión (presentaciones, lecturas, enlaces). El
        alumno los verá en su calendario.
      </p>

      {resources.length > 0 ? (
        <div className="mb-4 flex flex-col divide-y divide-ca-ink/[0.06] rounded-xl border border-ca-ink/[0.08]">
          {resources.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-ca-ink">
                  {r.title}
                </div>
                {r.storage_path ? (
                  <span className="truncate text-[11px] font-medium text-ca-ink-soft">
                    Archivo subido
                  </span>
                ) : (
                  <a
                    href={r.url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[11px] font-medium text-ca-violet hover:underline"
                  >
                    {r.url}
                  </a>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-ca-bg-soft px-2 py-0.5 text-[10px] font-bold text-ca-ink-soft">
                {RESOURCE_TYPE_LABELS[r.type]}
              </span>
              <button
                onClick={() => handleRemove(r.id)}
                aria-label="Eliminar recurso"
                disabled={removingId === r.id}
                className="shrink-0 rounded-lg border border-ca-ink/[0.1] p-2 text-ca-ink-soft transition-colors hover:border-ca-amber hover:text-[#8b6914] disabled:opacity-50"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 rounded-xl bg-ca-bg-soft px-4 py-3 text-[13px] text-ca-ink-soft">
          Aún no hay material en esta sesión.
        </p>
      )}

      {/* Toggle subir archivo / enlace */}
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors ${mode === "file" ? "bg-ca-violet text-white" : "bg-ca-bg-soft text-ca-ink-soft hover:text-ca-ink"}`}
        >
          Subir archivo
        </button>
        <button
          type="button"
          onClick={() => setMode("link")}
          className={`rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors ${mode === "link" ? "bg-ca-violet text-white" : "bg-ca-bg-soft text-ca-ink-soft hover:text-ca-ink"}`}
        >
          Enlace externo
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_140px]">
        <div>
          <label htmlFor="resource-title" className="sr-only">
            Título del recurso
          </label>
          <input
            id="resource-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título del recurso (ej. Presentación clase 1)"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="resource-type" className="sr-only">
            Tipo de recurso
          </label>
          <select
            id="resource-type"
            value={type}
            onChange={(e) => setType(e.target.value as SessionResourceType)}
            className={inputCls}
          >
            {(Object.keys(RESOURCE_TYPE_LABELS) as SessionResourceType[]).map((t) => (
              <option key={t} value={t}>
                {RESOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          {mode === "link" ? (
            <>
              <label htmlFor="resource-url" className="sr-only">
                Enlace del material
              </label>
              <input
                id="resource-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://… (enlace al material)"
                className={inputCls}
              />
            </>
          ) : (
            <>
              <label htmlFor="resource-file" className="sr-only">
                Archivo (máx. 50 MB)
              </label>
              <input
                id="resource-file"
                ref={fileInputRef}
                type="file"
                onChange={onFileChange}
                className="w-full rounded-xl border border-ca-ink/[0.14] bg-white px-3 py-2 text-[13px] text-ca-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-ca-violet/10 file:px-3 file:py-1.5 file:text-[12px] file:font-bold file:text-ca-violet"
              />
              {file && (
                <p className="mt-1 text-[11px] text-ca-ink-soft">
                  {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-ca-amber/40 bg-ca-amber/10 px-4 py-3 text-[13px] font-semibold text-[#8b6914]">
          {error}
        </div>
      )}

      <button
        onClick={handleAdd}
        disabled={adding}
        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-ca-violet px-5 py-2.5 text-[13px] font-bold text-ca-violet transition-colors hover:bg-ca-violet hover:text-white disabled:opacity-60"
      >
        <PlusIcon />
        {adding ? (mode === "file" ? "Subiendo…" : "Agregando…") : "Agregar material"}
      </button>
    </div>
  );
}
