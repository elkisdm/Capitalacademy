"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pencil, Users, X } from "lucide-react";
import { useToast } from "@/components/admin/toast";
import { CATEGORY_LABELS, FILE_CATEGORIES } from "@/lib/deliverables/file-types";

type Deliverable = {
  id: string;
  program_id: string;
  title: string;
  description: string | null;
  opens_at: string;
  due_at: string;
  allowed_file_types: string[];
  max_file_size_bytes: number;
  allow_multiple: boolean;
  submissionCount: number;
};

type RosterFile = { id: string; filename: string; signedUrl: string | null; uploaded_at: string };
type RosterEntry = {
  student: { id: string; email: string; full_name: string | null };
  files: RosterFile[];
  submitted: boolean;
};

const MAX_SIZE = 50 * 1024 * 1024;

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type FormState = {
  title: string;
  description: string;
  opensAt: string;
  dueAt: string;
  allowedFileTypes: string[];
  maxFileSizeMb: number;
  allowMultiple: boolean;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  opensAt: "",
  dueAt: "",
  allowedFileTypes: [...FILE_CATEGORIES],
  maxFileSizeMb: 50,
  allowMultiple: false,
};

export function DeliverablesManager({
  programs,
  initialProgramId,
}: {
  programs: { id: string; name: string }[];
  initialProgramId?: string;
}) {
  const [selectedProgram, setSelectedProgram] = useState(
    initialProgramId && programs.some((p) => p.id === initialProgramId)
      ? initialProgramId
      : (programs[0]?.id ?? ""),
  );
  const [loading, setLoading] = useState(true);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rosterFor, setRosterFor] = useState<Deliverable | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const { toast, ToastContainer } = useToast();

  const load = useCallback(async () => {
    if (!selectedProgram) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/deliverables?programId=${selectedProgram}`);
      if (res.ok) {
        const { deliverables: rows } = await res.json();
        setDeliverables(rows ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedProgram]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setIsCreating(false);
    setEditingId(null);
  };

  const startEdit = (d: Deliverable) => {
    setForm({
      title: d.title,
      description: d.description ?? "",
      opensAt: toLocalInput(d.opens_at),
      dueAt: toLocalInput(d.due_at),
      allowedFileTypes: d.allowed_file_types,
      maxFileSizeMb: Math.round(d.max_file_size_bytes / (1024 * 1024)),
      allowMultiple: d.allow_multiple,
    });
    setEditingId(d.id);
    setIsCreating(true);
  };

  const toggleCategory = (cat: string) => {
    setForm((f) => ({
      ...f,
      allowedFileTypes: f.allowedFileTypes.includes(cat)
        ? f.allowedFileTypes.filter((c) => c !== cat)
        : [...f.allowedFileTypes, cat],
    }));
  };

  const canSubmit =
    form.title.trim() &&
    form.opensAt &&
    form.dueAt &&
    form.allowedFileTypes.length > 0 &&
    form.maxFileSizeMb > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const payload = {
        programId: selectedProgram,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        opensAt: fromLocalInput(form.opensAt),
        dueAt: fromLocalInput(form.dueAt),
        allowedFileTypes: form.allowedFileTypes,
        maxFileSizeBytes: Math.min(form.maxFileSizeMb * 1024 * 1024, MAX_SIZE),
        allowMultiple: form.allowMultiple,
      };
      const res = await fetch(
        editingId ? `/api/admin/deliverables/${editingId}` : "/api/admin/deliverables",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingId ? payload : payload),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast(body?.error ?? "No se pudo guardar el entregable.", "error");
        return;
      }
      toast(editingId ? "Entregable actualizado." : "Entregable creado.", "success");
      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este entregable? Se borrarán también las entregas de los alumnos.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/deliverables/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeliverables((prev) => prev.filter((d) => d.id !== id));
        toast("Entregable eliminado.", "success");
      } else {
        toast("No se pudo eliminar el entregable.", "error");
      }
    } finally {
      setDeletingId(null);
    }
  };

  const openRoster = async (d: Deliverable) => {
    setRosterFor(d);
    setRosterLoading(true);
    try {
      const res = await fetch(`/api/admin/deliverables/${d.id}/submissions`);
      if (res.ok) {
        const { roster: rows } = await res.json();
        setRoster(rows ?? []);
      }
    } finally {
      setRosterLoading(false);
    }
  };

  if (programs.length === 0) {
    return (
      <div className="grid place-items-center py-16 text-center">
        <div className="text-[14px] font-bold text-ca-ink">Sin programas</div>
        <div className="text-[12px] text-ca-ink-soft">Crea un programa antes de gestionar entregables.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ToastContainer />

      {programs.length > 1 && (
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
            Programa
          </label>
          <select
            value={selectedProgram}
            onChange={(e) => {
              setSelectedProgram(e.target.value);
              resetForm();
            }}
            className="rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-semibold text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
          >
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ca-ink-soft">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {deliverables.length === 0 && !isCreating && (
            <p className="text-sm text-ca-ink-soft">Aún no hay entregables para este programa.</p>
          )}

          {deliverables.map((d) => (
            <div
              key={d.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-ca-ink/[0.08] bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-ca-ink">{d.title}</p>
                {d.description && (
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ca-ink-soft">{d.description}</p>
                )}
                <p className="mt-1.5 text-[12px] text-ca-ink-soft">
                  Abre {fmtDateTime(d.opens_at)} · Cierra {fmtDateTime(d.due_at)}
                </p>
                <p className="mt-1 text-[12px] text-ca-ink-soft">
                  {d.allowed_file_types.map((c) => CATEGORY_LABELS[c] ?? c).join(", ")} ·{" "}
                  {d.submissionCount} entrega{d.submissionCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => openRoster(d)}
                  aria-label={`Ver entregas de ${d.title}`}
                  className="rounded p-1.5 text-ca-ink-soft hover:bg-ca-bg-soft hover:text-ca-violet"
                >
                  <Users className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(d)}
                  aria-label={`Editar ${d.title}`}
                  className="rounded p-1.5 text-ca-ink-soft hover:bg-ca-bg-soft hover:text-ca-violet"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(d.id)}
                  disabled={deletingId === d.id}
                  aria-label={`Eliminar ${d.title}`}
                  className="rounded p-1.5 text-ca-ink-soft hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {isCreating ? (
            <div className="space-y-3 rounded-xl border border-ca-violet/20 bg-ca-violet/[0.04] p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Título</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ej: Guión de venta"
                  className="w-full rounded-md border border-ca-ink/[0.08] px-3 py-2 text-sm focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
                  Descripción (opcional)
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full rounded-md border border-ca-ink/[0.08] px-3 py-2 text-sm focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Se abre</label>
                  <input
                    type="datetime-local"
                    value={form.opensAt}
                    onChange={(e) => setForm((f) => ({ ...f, opensAt: e.target.value }))}
                    className="w-full rounded-md border border-ca-ink/[0.08] px-3 py-2 text-sm focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Fecha límite</label>
                  <input
                    type="datetime-local"
                    value={form.dueAt}
                    onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
                    className="w-full rounded-md border border-ca-ink/[0.08] px-3 py-2 text-sm focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
                  Tipos de archivo permitidos
                </label>
                <div className="flex flex-wrap gap-2">
                  {FILE_CATEGORIES.map((cat) => (
                    <label
                      key={cat}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                        form.allowedFileTypes.includes(cat)
                          ? "border-ca-violet bg-ca-violet/10 text-ca-violet"
                          : "border-ca-ink/[0.08] text-ca-ink-soft"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.allowedFileTypes.includes(cat)}
                        onChange={() => toggleCategory(cat)}
                        className="sr-only"
                      />
                      {CATEGORY_LABELS[cat] ?? cat}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
                    Tamaño máx. (MB)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={form.maxFileSizeMb}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, maxFileSizeMb: Number(e.target.value) || 1 }))
                    }
                    className="w-full rounded-md border border-ca-ink/[0.08] px-3 py-2 text-sm focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-ca-ink-soft">
                    <input
                      type="checkbox"
                      checked={form.allowMultiple}
                      onChange={(e) => setForm((f) => ({ ...f, allowMultiple: e.target.checked }))}
                    />
                    Permitir varios archivos por alumno
                  </label>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving || !canSubmit}
                  className="rounded-md bg-ca-violet px-4 py-2 text-sm font-medium text-white hover:bg-ca-violet-deep disabled:opacity-50"
                >
                  {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear entregable"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md px-4 py-2 text-sm text-ca-ink-soft hover:bg-ca-bg-soft"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 rounded-md border border-dashed border-ca-ink/[0.08] px-4 py-2 text-sm text-ca-ink-soft hover:border-ca-violet/40 hover:text-ca-violet"
            >
              <Plus className="h-4 w-4" />
              Nuevo entregable
            </button>
          )}
        </div>
      )}

      {rosterFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setRosterFor(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[15px] font-bold text-ca-ink">{rosterFor.title}</p>
                <p className="text-[12px] text-ca-ink-soft">Entregas de los alumnos</p>
              </div>
              <button
                type="button"
                onClick={() => setRosterFor(null)}
                aria-label="Cerrar"
                className="rounded p-1 text-ca-ink-soft hover:bg-ca-bg-soft"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {rosterLoading ? (
              <p className="text-sm text-ca-ink-soft">Cargando…</p>
            ) : roster.length === 0 ? (
              <p className="text-sm text-ca-ink-soft">No hay alumnos matriculados en este programa.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {roster.map((entry) => (
                  <div
                    key={entry.student.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-ca-ink/[0.08] p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-ca-ink">
                        {entry.student.full_name || entry.student.email}
                      </p>
                      <p className="truncate text-[12px] text-ca-ink-soft">{entry.student.email}</p>
                      {entry.files.length > 0 && (
                        <div className="mt-1.5 flex flex-col gap-1">
                          {entry.files.map((f) => (
                            <a
                              key={f.id}
                              href={f.signedUrl ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate text-[12px] text-ca-violet hover:underline"
                            >
                              {f.filename}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold ${
                        entry.submitted
                          ? "bg-green-50 text-green-600"
                          : "bg-ca-bg-soft text-ca-ink-soft"
                      }`}
                    >
                      {entry.submitted ? "Entregado" : "Pendiente"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
