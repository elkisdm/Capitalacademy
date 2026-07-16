"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Pencil, Users, X } from "lucide-react";
import { useToast } from "@/components/admin/toast";
import { CATEGORY_LABELS, FILE_CATEGORIES } from "@/lib/deliverables/file-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea, Select } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { chileWallTimeToIso, isoToChileWallTime } from "@/lib/time";

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
  enrolled: boolean;
};

const MAX_SIZE = 50 * 1024 * 1024;

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return isoToChileWallTime(iso);
}

function fromLocalInput(value: string): string {
  return chileWallTimeToIso(value);
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function windowStatus(opensAt: string, dueAt: string): { label: string; tone: "lime" | "neutral" | "amber" } {
  const now = Date.now();
  const opens = new Date(opensAt).getTime();
  const due = new Date(dueAt).getTime();
  if (now < opens) return { label: "Próximamente", tone: "amber" };
  if (now > due) return { label: "Cerrado", tone: "neutral" };
  return { label: "Abierto", tone: "lime" };
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rosterFor, setRosterFor] = useState<Deliverable | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const rosterRequestId = useRef(0);
  const { toast, ToastContainer } = useToast();

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!selectedProgram) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/deliverables?programId=${selectedProgram}`, { signal });
      if (res.ok) {
        const { deliverables: rows } = await res.json();
        setDeliverables(rows ?? []);
      } else {
        setLoadError("No se pudieron cargar los entregables.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setLoadError("No se pudieron cargar los entregables.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [selectedProgram]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(controller.signal);
    return () => controller.abort();
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
          body: JSON.stringify(payload),
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
    } catch {
      toast("Error de red al guardar el entregable.", "error");
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
    setRoster([]);
    setRosterLoading(true);
    const requestId = ++rosterRequestId.current;
    try {
      const res = await fetch(`/api/admin/deliverables/${d.id}/submissions`);
      if (requestId !== rosterRequestId.current) return;
      if (res.ok) {
        const { roster: rows } = await res.json();
        setRoster(rows ?? []);
      }
    } finally {
      if (requestId === rosterRequestId.current) setRosterLoading(false);
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
          <Select
            value={selectedProgram}
            onChange={(e) => {
              setSelectedProgram(e.target.value);
              resetForm();
            }}
            className="w-auto font-semibold"
          >
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {loadError && (
            <p className="col-span-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</p>
          )}
          {deliverables.length === 0 && !isCreating && (
            <p className="col-span-full text-sm text-ca-ink-soft">Aún no hay entregables para este programa.</p>
          )}

          {deliverables.map((d) => {
            const status = windowStatus(d.opens_at, d.due_at);
            return (
              <div
                key={d.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-ca-ink/[0.08] bg-white p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[14px] font-bold text-ca-ink">{d.title}</p>
                    <Badge tone={status.tone} size="sm" className="shrink-0">
                      {status.label}
                    </Badge>
                  </div>
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openRoster(d)}
                    aria-label={`Ver entregas de ${d.title}`}
                    className="grid h-11 w-11 place-items-center rounded md:h-8 md:w-8"
                  >
                    <Users className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(d)}
                    aria-label={`Editar ${d.title}`}
                    className="grid h-11 w-11 place-items-center rounded md:h-8 md:w-8"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(d.id)}
                    disabled={deletingId === d.id}
                    aria-label={`Eliminar ${d.title}`}
                    className="grid h-11 w-11 place-items-center rounded hover:bg-red-50 hover:text-red-500 md:h-8 md:w-8"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}

          {isCreating ? (
            <div className="col-span-full space-y-3 rounded-xl border border-ca-violet/20 bg-ca-violet/[0.04] p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Título</label>
                <Input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ej: Guión de venta"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
                  Descripción (opcional)
                </label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DatePicker
                  withTime
                  label="Se abre"
                  value={form.opensAt}
                  onChange={(v) => setForm((f) => ({ ...f, opensAt: v }))}
                />
                <DatePicker
                  withTime
                  label="Fecha límite"
                  value={form.dueAt}
                  onChange={(v) => setForm((f) => ({ ...f, dueAt: v }))}
                />
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
                    Tamaño máx. (MB)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={form.maxFileSizeMb}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, maxFileSizeMb: Number(e.target.value) || 1 }))
                    }
                  />
                </div>
                <div className="flex items-end pb-2">
                  <Checkbox
                    checked={form.allowMultiple}
                    onChange={(v) => setForm((f) => ({ ...f, allowMultiple: v }))}
                    label={
                      <span className="text-xs font-medium text-ca-ink-soft">
                        Permitir varios archivos por alumno
                      </span>
                    }
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="lime"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={saving || !canSubmit}
                >
                  {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear entregable"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="lime"
              size="sm"
              onClick={() => setIsCreating(true)}
              className="w-fit rounded-md border-dashed"
            >
              <Plus className="h-4 w-4" />
              Nuevo entregable
            </Button>
          )}
        </div>
      )}

      <Dialog
        open={rosterFor !== null}
        onClose={() => setRosterFor(null)}
        className="max-h-[80vh] max-w-2xl overflow-y-auto"
        aria-label="Entregas de los alumnos"
      >
        {rosterFor && (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[15px] font-bold text-ca-ink">{rosterFor.title}</p>
                <p className="text-[12px] text-ca-ink-soft">Entregas de los alumnos</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRosterFor(null)}
                aria-label="Cerrar"
                className="grid h-11 w-11 place-items-center rounded md:h-8 md:w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {rosterLoading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
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
                    <div className="flex shrink-0 items-center gap-1.5">
                      {!entry.enrolled && <Badge tone="amber">Sin matrícula</Badge>}
                      <Badge tone={entry.submitted ? "lime" : "neutral"}>
                        {entry.submitted ? "Entregado" : "Pendiente"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Dialog>
    </div>
  );
}
