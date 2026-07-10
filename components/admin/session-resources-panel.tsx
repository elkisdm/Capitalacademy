"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SessionResource, SessionResourceType } from "@/lib/classroom/types";
import { PlusIcon, TrashIcon } from "@/components/admin/icons";

const RESOURCE_TYPE_LABELS: Record<SessionResourceType, string> = {
  link: "Enlace",
  pdf: "PDF",
  document: "Documento",
  template: "Plantilla",
  other: "Otro",
};

const MAX_RESOURCE_SIZE = 50 * 1024 * 1024; // 50 MB
const RESOURCE_BUCKET = "lesson-resources";

export function SessionResourcesPanel({
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
