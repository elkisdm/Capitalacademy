"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2, Check, AlertTriangle } from "lucide-react";
import { LessonContentEditor } from "@/components/admin/lesson-content-editor";
import { CoverImageField } from "@/components/admin/cover-image-field";

type LessonKind = "live_in_person" | "live_online" | "recorded";

const KIND_OPTIONS: { value: LessonKind; label: string }[] = [
  { value: "recorded", label: "Grabada (VOD)" },
  { value: "live_online", label: "En vivo online" },
  { value: "live_in_person", label: "Presencial" },
];

type LessonEditFormProps = {
  lessonId: string;
  initial: {
    title: string;
    description: string | null;
    content: string | null;
    kind: LessonKind;
    unlockAt: string | null;
    coverImageUrl: string | null;
  };
};

// timestamptz ISO → valor para <input type="datetime-local"> (hora local).
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LessonEditForm({ lessonId, initial }: LessonEditFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [content, setContent] = useState(initial.content ?? "");
  const [kind, setKind] = useState<LessonKind>(initial.kind);
  const [unlockAt, setUnlockAt] = useState(isoToLocalInput(initial.unlockAt));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/admin/lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          content: content.trim() || null,
          kind,
          // datetime-local (hora local) → ISO; vacío = limpiar la apertura.
          unlockAt: unlockAt ? new Date(unlockAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo guardar");
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/lessons/${lessonId}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo eliminar");
        setConfirmDelete(false);
        return;
      }
      router.push("/admin/lessons");
      router.refresh();
    } catch {
      setError("Error de red al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const inputCls =
    "w-full rounded-md border border-ca-ink/[0.08] px-3 py-2 text-sm focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30";

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Título</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Descripción</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={inputCls}
          placeholder="Breve descripción de la lección (opcional)"
        />
      </div>

      <CoverImageField target="lesson" id={lessonId} initialUrl={initial.coverImageUrl} />

      <div>
        <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
          Contenido de la clase (texto / diapositiva)
        </label>
        <LessonContentEditor lessonId={lessonId} value={content} onChange={setContent} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Tipo</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as LessonKind)} className={inputCls}>
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
            Apertura por calendario
          </label>
          <input
            type="datetime-local"
            value={unlockAt}
            onChange={(e) => setUnlockAt(e.target.value)}
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-ca-ink-soft">
            Vacío = disponible siempre. Con fecha, queda bloqueada hasta ese momento.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-ca-ink/[0.08] pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-ca-violet px-4 py-2 text-sm font-medium text-white hover:bg-ca-violet-deep disabled:opacity-50"
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Guardando…" : saved ? "Guardado" : "Guardar cambios"}
        </button>

        <div className="ml-auto">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ca-ink-soft">¿Eliminar lección?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? "Eliminando…" : "Sí, eliminar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md px-3 py-2 text-sm text-ca-ink-soft hover:bg-ca-bg-soft"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm text-red-500 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
