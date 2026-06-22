"use client";

import { useRef, useState } from "react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle("");
    setUrl("");
    setFile(null);
    setType("document");
    setError(null);
    setIsAdding(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = e.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_SIZE) {
      setError("El archivo no puede superar 50 MB.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
          {/* Toggle: subir archivo vs link externo */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("file");
                setError(null);
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
                mode === "file"
                  ? "bg-ca-violet text-white"
                  : "bg-white text-ca-ink-soft hover:bg-ca-bg-soft"
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              Subir archivo
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("link");
                setError(null);
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
                mode === "link"
                  ? "bg-ca-violet text-white"
                  : "bg-white text-ca-ink-soft hover:bg-ca-bg-soft"
              }`}
            >
              <LinkIcon className="h-3.5 w-3.5" />
              Link externo
            </button>
          </div>

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
              {mode === "link" ? (
                <>
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
                </>
              ) : (
                <>
                  <label className="mb-1 block text-xs font-medium text-ca-ink-soft">
                    Archivo (máx. 50 MB)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileChange}
                    className="w-full rounded-md border border-ca-ink/[0.08] px-3 py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-ca-violet/10 file:px-2 file:py-1 file:text-xs file:text-ca-violet"
                  />
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
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !canSubmit}
              className="rounded-md bg-ca-violet px-4 py-2 text-sm font-medium text-white hover:bg-ca-violet-deep disabled:opacity-50"
            >
              {saving
                ? mode === "file"
                  ? "Subiendo..."
                  : "Guardando..."
                : "Agregar"}
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
