"use client";

import { useState } from "react";
import { FileText, Upload, Trash2, Lock, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_LABELS } from "@/lib/deliverables/file-types";
import { FileInput } from "@/components/ui/file-input";

type Deliverable = {
  id: string;
  title: string;
  description: string | null;
  opens_at: string;
  due_at: string;
  allowed_file_types: string[];
  max_file_size_bytes: number;
  allow_multiple: boolean;
};

type SubmittedFile = {
  id: string;
  filename: string;
  storage_path: string;
  uploaded_at: string;
  signedUrl: string | null;
};

const BUCKET = "deliverables";

const CATEGORY_ACCEPT: Record<string, string[]> = {
  pdf: [".pdf"],
  word: [".doc", ".docx"],
  excel: [".xls", ".xlsx"],
  image: [".png", ".jpg", ".jpeg", ".webp", ".gif"],
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function computeWindow(deliverable: Deliverable): { windowOpen: boolean; closed: boolean } {
  const now = Date.now();
  const opensAt = new Date(deliverable.opens_at).getTime();
  const dueAt = new Date(deliverable.due_at).getTime();
  return { windowOpen: now >= opensAt && now <= dueAt, closed: now > dueAt };
}

export function DeliverableCard({
  deliverable,
  files: initialFiles,
}: {
  deliverable: Deliverable;
  files: SubmittedFile[];
}) {
  const [files, setFiles] = useState(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { windowOpen, closed } = computeWindow(deliverable);
  const hasSubmitted = files.length > 0;
  // Con !allow_multiple, subir un archivo nuevo reemplaza el anterior (lo
  // resuelve el backend): el input queda disponible mientras la ventana esté
  // abierta, sin importar si ya hay una entrega.

  const accept = deliverable.allowed_file_types
    .flatMap((c) => CATEGORY_ACCEPT[c] ?? [])
    .join(",");

  const handleFileChange = async (files: FileList) => {
    const selected = files[0] ?? null;
    if (!selected) return;

    if (selected.size > deliverable.max_file_size_bytes) {
      setError(`El archivo no puede superar ${formatSize(deliverable.max_file_size_bytes)}.`);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const urlRes = await fetch("/api/classroom/deliverables/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliverableId: deliverable.id,
          filename: selected.name,
          size: selected.size,
        }),
      });
      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => null);
        setError(body?.error ?? "No se pudo iniciar la subida.");
        return;
      }
      const { path, token } = await urlRes.json();

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(path, token, selected, {
          contentType: selected.type || "application/octet-stream",
        });
      if (uploadError) {
        setError("Error al subir el archivo.");
        return;
      }

      const res = await fetch("/api/classroom/deliverables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliverableId: deliverable.id,
          storagePath: path,
          filename: selected.name,
          fileSizeBytes: selected.size,
          contentType: selected.type || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Archivo subido pero no se pudo guardar.");
        return;
      }
      const created = await res.json();
      setFiles((prev) =>
        deliverable.allow_multiple ? [...prev, created] : [created],
      );
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/classroom/deliverables?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
      } else {
        setError("No se pudo eliminar el archivo.");
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="ca-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-ca-ink">{deliverable.title}</p>
          {deliverable.description && (
            <p className="mt-1 text-[13px] text-ca-ink-soft">{deliverable.description}</p>
          )}
          <p className="mt-2 text-[12px] text-ca-ink-soft">
            Fecha límite: {fmtDateTime(deliverable.due_at)}
            {" · "}
            {deliverable.allowed_file_types.map((c) => CATEGORY_LABELS[c] ?? c).join(", ")}
            {" · "}
            máx. {formatSize(deliverable.max_file_size_bytes)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold ${
            hasSubmitted
              ? "bg-green-50 text-green-600"
              : closed
                ? "bg-red-50 text-red-500"
                : "bg-ca-bg-soft text-ca-ink-soft"
          }`}
        >
          {hasSubmitted ? "Entregado" : closed ? "Fuera de plazo" : "Pendiente"}
        </span>
      </div>

      {files.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-md border border-ca-ink/[0.08] p-2.5"
            >
              <FileText className="h-4 w-4 shrink-0 text-ca-ink-soft" />
              <a
                href={f.signedUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-[13px] font-medium text-ca-violet hover:underline"
              >
                {f.filename}
              </a>
              {windowOpen && (
                <button
                  type="button"
                  aria-label={`Eliminar ${f.filename}`}
                  onClick={() => handleDelete(f.id)}
                  disabled={deletingId === f.id}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded text-ca-ink-soft hover:bg-red-50 hover:text-red-500 disabled:opacity-50 md:h-9 md:w-9"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        {!windowOpen ? (
          <div className="flex items-center gap-2 rounded-md bg-ca-bg-soft px-3 py-2.5 text-[13px] text-ca-ink-soft">
            <Lock className="h-4 w-4 shrink-0" />
            {closed
              ? `La ventana de entrega cerró el ${fmtDateTime(deliverable.due_at)}.`
              : `Aún no abre. Podrás subir tu entrega desde el ${fmtDateTime(deliverable.opens_at)}.`}
          </div>
        ) : (
          <>
            {hasSubmitted && (
              <p className="mb-1.5 flex items-center gap-2 text-[13px] text-ca-ink-soft">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                {deliverable.allow_multiple
                  ? "Puedes agregar otro archivo."
                  : "Puedes reemplazar tu entrega subiendo un archivo nuevo."}
              </p>
            )}
            <FileInput
              accept={accept}
              onFiles={handleFileChange}
              disabled={uploading}
              maxSizeMb={deliverable.max_file_size_bytes / (1024 * 1024)}
            />
            {uploading && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ca-ink-soft">
                <Upload className="h-3.5 w-3.5" /> Subiendo…
              </p>
            )}
          </>
        )}
        {error && <p className="mt-1.5 text-[12px] text-red-500">{error}</p>}
      </div>
    </div>
  );
}
