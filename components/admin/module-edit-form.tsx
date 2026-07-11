"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Trash2, Check, AlertTriangle, X } from "lucide-react";
import { CoverImageField } from "@/components/admin/cover-image-field";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";

type ModuleEditFormProps = {
  module: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    cover_image_url: string | null;
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

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
        Editar módulo
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-ca-violet/20 bg-ca-violet/5 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-ca-ink-soft">
          Editar módulo
        </span>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          className="h-auto min-h-0 rounded p-1"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <div>
          <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Código</label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Título</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Descripción</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Descripción del módulo (opcional)"
        />
      </div>

      <CoverImageField target="module" id={module.id} initialUrl={module.cover_image_url} />

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving || !code.trim() || !title.trim()}>
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Guardando…" : saved ? "Guardado" : "Guardar"}
        </Button>

        <div className="ml-auto">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ca-ink-soft">¿Eliminar módulo?</span>
              <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Eliminando…" : "Sí, eliminar"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="border-red-200 text-red-500 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
