"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Trash2, Check, AlertTriangle, X } from "lucide-react";

type ModuleEditFormProps = {
  module: {
    id: string;
    code: string;
    title: string;
    description: string | null;
  };
};

export function ModuleEditForm({ module }: ModuleEditFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(module.code);
  const [title, setTitle] = useState(module.title);
  const [description, setDescription] = useState(module.description ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!code.trim() || !title.trim()) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/admin/modules/${module.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          title: title.trim(),
          description: description.trim() || null,
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
      const res = await fetch(`/api/admin/modules/${module.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo eliminar");
        setConfirmDelete(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Error de red al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const inputCls =
    "w-full rounded-md border border-ca-ink/[0.08] px-3 py-2 text-sm focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ca-ink-soft hover:text-ca-violet"
      >
        <Pencil className="h-3.5 w-3.5" />
        Editar módulo
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-ca-violet/20 bg-ca-violet/5 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-ca-ink-soft">
          Editar módulo
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-1 text-ca-ink-soft hover:bg-ca-bg-soft"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <div>
          <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Código</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Título</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Descripción</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={inputCls}
          placeholder="Descripción del módulo (opcional)"
        />
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !code.trim() || !title.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-ca-violet px-4 py-2 text-sm font-medium text-white hover:bg-ca-violet-deep disabled:opacity-50"
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Guardando..." : saved ? "Guardado" : "Guardar"}
        </button>

        <div className="ml-auto">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ca-ink-soft">¿Eliminar módulo?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Sí, eliminar"}
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
