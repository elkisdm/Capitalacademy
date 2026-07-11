"use client";

import { useState } from "react";
import {
  FileText,
  ExternalLink,
  FileSpreadsheet,
  File,
  Trash2,
  Plus,
  Upload,
  Link as LinkIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { FileInput } from "@/components/ui/file-input";

type Resource = {
  id: string;
  lesson_id?: string;
  session_id?: string;
  title: string;
  type: string;
  url: string | null;
  storage_path?: string | null;
  file_size_bytes?: number | null;
  position: number;
};

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
const RESOURCE_BUCKET = "lesson-resources";

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// El gestor sirve para recursos de una lección grabada o de una clase en vivo
// (sesión de calendario): mismo flujo, distintos endpoints y campo de id.
type ResourceManagerProps = {
  lessonId?: string;
  sessionId?: string;
  initialResources: Resource[];
};

export function ResourceManager({
  lessonId,
  sessionId,
  initialResources,
}: ResourceManagerProps) {
  const isSession = !!sessionId;
  const targetId = (sessionId ?? lessonId)!;
  const idKey = isSession ? "sessionId" : "lessonId";
  const apiBase = isSession ? "/api/admin/session-resources" : "/api/admin/resources";
  const [resources, setResources] = useState(initialResources);
  const [isAdding, setIsAdding] = useState(false);
  const [mode, setMode] = useState<"link" | "file">("file");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("document");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resetForm = () => {
    setTitle("");
    setUrl("");
    setFile(null);
    setType("document");
    setError(null);
    setIsAdding(false);
  };

  const handleFileChange = (files: FileList) => {
    setError(null);
    const selected = files[0] ?? null;
    if (selected && selected.size > MAX_SIZE) {
      setError("El archivo no puede superar 50 MB.");
      setFile(null);
      return;
    }
    setFile(selected);
    // Autocompleta el título con el nombre del archivo si está vacío.
    if (selected && !title.trim()) {
      setTitle(selected.name.replace(/\.[^.]+$/, ""));
    }
  };

  const handleAdd = async () => {
    if (!title.trim()) return;
    if (mode === "link" && !url.trim()) return;
    if (mode === "file" && !file) return;

    setSaving(true);
    setError(null);

    try {
      if (mode === "link") {
        const res = await fetch(apiBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "link",
            [idKey]: targetId,
            title: title.trim(),
            type,
            url: url.trim(),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "No se pudo agregar el recurso.");
          return;
        }
        const created = await res.json();
        setResources((prev) => [...prev, created]);
        resetForm();
        return;
      }

      // mode === "file": subida directa navegador → Supabase Storage.
      const target = file as File;

      // 1. Pide un signed upload URL al servidor (staff-gated).
      const urlRes = await fetch(`${apiBase}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [idKey]: targetId,
          filename: target.name,
          size: target.size,
        }),
      });
      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => null);
        setError(body?.error ?? "No se pudo iniciar la subida.");
        return;
      }
      const { path, token } = await urlRes.json();

      // 2. Sube el archivo directo a Storage (evita el límite de payload de la
      //    función serverless; soporta hasta 50 MB).
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(RESOURCE_BUCKET)
        .uploadToSignedUrl(path, token, target, {
          contentType: target.type || "application/octet-stream",
        });
      if (uploadError) {
        setError("Error al subir el archivo.");
        return;
      }

      // 3. Persiste la fila del recurso apuntando al objeto subido.
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "file",
          [idKey]: targetId,
          title: title.trim(),
          type,
          storagePath: path,
          fileSizeBytes: target.size,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Archivo subido pero no se pudo guardar.");
        return;
      }
      const created = await res.json();
      setResources((prev) => [...prev, created]);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${apiBase}?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setResources((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  const canSubmit =
    !!title.trim() && (mode === "link" ? !!url.trim() : !!file);

  return (
    <div className="space-y-4">
      {resources.length === 0 && !isAdding && (
        <p className="text-sm text-ca-ink-soft">
          {isSession ? "No hay material para esta clase." : "No hay recursos para esta lección."}
        </p>
      )}

      {resources.map((resource) => {
        const Icon = TYPE_ICONS[resource.type] ?? File;
        const isFile = !!resource.storage_path;
        const sub = isFile
          ? `Archivo${resource.file_size_bytes ? ` · ${formatSize(resource.file_size_bytes)}` : ""}`
          : resource.url;
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
              <p className="truncate text-xs text-ca-ink-soft">{sub}</p>
            </div>
            <Badge tone="neutral" size="sm" className="shrink-0">
              {resource.type}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              aria-label={`Eliminar ${resource.title}`}
              onClick={() => handleDelete(resource.id)}
              disabled={deletingId === resource.id}
              className="h-auto min-h-0 shrink-0 rounded p-1 text-ca-ink-soft hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}

      {isAdding ? (
        <div className="space-y-3 rounded-lg border border-ca-accent/20 bg-ca-accent/10 p-4">
          {/* Toggle: subir archivo vs link externo */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "file" ? "primary" : "outline"}
              size="sm"
              onClick={() => {
                setMode("file");
                setError(null);
              }}
            >
              <Upload className="h-3.5 w-3.5" />
              Subir archivo
            </Button>
            <Button
              type="button"
              variant={mode === "link" ? "primary" : "outline"}
              size="sm"
              onClick={() => {
                setMode("link");
                setError(null);
              }}
            >
              <LinkIcon className="h-3.5 w-3.5" />
              Link externo
            </Button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
              Título
            </label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Guía de cierre de ventas"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
                Tipo
              </label>
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              {mode === "link" ? (
                <>
                  <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
                    URL
                  </label>
                  <Input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </>
              ) : (
                <>
                  <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
                    Archivo (máx. 50 MB)
                  </label>
                  <FileInput onFiles={handleFileChange} />
                </>
              )}
            </div>
          </div>

          {mode === "file" && file && (
            <p className="text-xs text-ca-ink-soft">
              {file.name} · {formatSize(file.size)}
            </p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" onClick={handleAdd} disabled={saving || !canSubmit}>
              {saving
                ? mode === "file"
                  ? "Subiendo…"
                  : "Guardando…"
                : "Agregar"}
            </Button>
            <Button type="button" variant="ghost" onClick={resetForm}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsAdding(true)}
          className="border-dashed"
        >
          <Plus className="h-4 w-4" />
          Agregar recurso
        </Button>
      )}
    </div>
  );
}
