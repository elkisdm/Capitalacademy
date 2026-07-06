"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle } from "lucide-react";

type LessonKind = "live_in_person" | "live_online" | "recorded";

const KIND_OPTIONS: { value: LessonKind; label: string }[] = [
  { value: "recorded", label: "Grabada (VOD)" },
  { value: "live_online", label: "En vivo online" },
  { value: "live_in_person", label: "Presencial" },
];

export function AddLessonButton({ moduleId }: { moduleId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<LessonKind>("recorded");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, title: title.trim(), kind }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo crear la lección");
        return;
      }
      setTitle("");
      setKind("recorded");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Error de red al crear");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-md border border-ca-ink/[0.08] px-3 py-2 text-sm focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-2 rounded-md border border-dashed border-ca-ink/[0.08] px-3 py-2 text-sm text-ca-ink-soft hover:border-ca-violet/40 hover:text-ca-violet"
      >
        <Plus className="h-4 w-4" />
        Nueva lección
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-ca-violet/20 bg-ca-violet/5 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input
          autoFocus
          aria-label="Título de la lección"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="Título de la lección"
          className={inputCls}
        />
        <select aria-label="Tipo de lección" value={kind} onChange={(e) => setKind(e.target.value as LessonKind)} className={inputCls}>
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || !title.trim()}
          className="rounded-md bg-ca-violet px-4 py-2 text-sm font-medium text-white hover:bg-ca-violet-deep disabled:opacity-50"
        >
          {saving ? "Creando…" : "Crear lección"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-md px-4 py-2 text-sm text-ca-ink-soft hover:bg-ca-bg-soft"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
