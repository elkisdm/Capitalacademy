"use client";

import { useState } from "react";
import {
  FileText,
  ExternalLink,
  FileSpreadsheet,
  File,
  Trash2,
  Plus,
} from "lucide-react";

type Resource = {
  id: string;
  lesson_id: string;
  title: string;
  type: string;
  url: string;
  position: number;
};

const TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  link: ExternalLink,
  template: FileSpreadsheet,
  document: File,
  other: File,
};

const TYPE_OPTIONS = [
  { value: "pdf", label: "PDF" },
  { value: "link", label: "Link externo" },
  { value: "template", label: "Plantilla" },
  { value: "document", label: "Documento" },
  { value: "other", label: "Otro" },
];

type ResourceManagerProps = {
  lessonId: string;
  initialResources: Resource[];
};

export function ResourceManager({
  lessonId,
  initialResources,
}: ResourceManagerProps) {
  const [resources, setResources] = useState(initialResources);
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("pdf");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!title.trim() || !url.trim()) return;
    setSaving(true);

    try {
      const res = await fetch("/api/admin/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, title: title.trim(), type, url: url.trim() }),
      });

      if (res.ok) {
        const newResource = await res.json();
        setResources((prev) => [...prev, newResource]);
        setTitle("");
        setUrl("");
        setIsAdding(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/resources?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setResources((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {resources.length === 0 && !isAdding && (
        <p className="text-sm text-ca-ink-soft">
          No hay recursos para esta lección.
        </p>
      )}

      {resources.map((resource) => {
        const Icon = TYPE_ICONS[resource.type] ?? File;
        return (
          <div
            key={resource.id}
            className="flex items-center gap-3 rounded-md border border-ca-ink/[0.08] p-3"
          >
            <Icon className="h-4 w-4 shrink-0 text-ca-ink-soft" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ca-ink">
                {resource.title}
              </p>
              <p className="truncate text-xs text-ca-ink-soft">{resource.url}</p>
            </div>
            <span className="shrink-0 rounded bg-ca-bg-soft px-1.5 py-0.5 text-xs text-ca-ink-soft">
              {resource.type}
            </span>
            <button
              type="button"
              onClick={() => handleDelete(resource.id)}
              disabled={deletingId === resource.id}
              className="shrink-0 rounded p-1 text-ca-ink-soft hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      {isAdding ? (
        <div className="space-y-3 rounded-lg border border-ca-accent/20 bg-ca-accent/10 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
              Título
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Guía de cierre de ventas"
              className="w-full rounded-md border border-ca-ink/[0.08] px-3 py-2 text-sm focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
                Tipo
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-md border border-ca-ink/[0.08] px-3 py-2 text-sm focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
                URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-md border border-ca-ink/[0.08] px-3 py-2 text-sm focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !title.trim() || !url.trim()}
              className="rounded-md bg-ca-violet px-4 py-2 text-sm font-medium text-white hover:bg-ca-violet-deep disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Agregar"}
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="rounded-md px-4 py-2 text-sm text-ca-ink-soft hover:bg-ca-bg-soft"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 rounded-md border border-dashed border-ca-ink/[0.08] px-4 py-2 text-sm text-ca-ink-soft hover:border-ca-violet/40 hover:text-ca-violet"
        >
          <Plus className="h-4 w-4" />
          Agregar recurso
        </button>
      )}
    </div>
  );
}
