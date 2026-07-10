"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2, AlertTriangle } from "lucide-react";

type CoverImageFieldProps = {
  target: "module" | "lesson";
  id: string;
  initialUrl: string | null;
};

export function CoverImageField({ target, id, initialUrl }: CoverImageFieldProps) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("target", target);
      formData.append("id", id);
      const res = await fetch("/api/admin/covers", { method: "POST", body: formData });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "No se pudo subir la portada");
        return;
      }
      setUrl(j.cover_image_url);
      router.refresh();
    } catch {
      setError("Error de red al subir la portada");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/covers?target=${target}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo quitar la portada");
        return;
      }
      setUrl(null);
      router.refresh();
    } catch {
      setError("Error de red al quitar la portada");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Portada</label>
      <div className="flex items-center gap-3">
        <div
          className="relative shrink-0 overflow-hidden rounded-md bg-ca-ink/5"
          style={{ width: 160, height: 90 }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Portada" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-ca-ink-soft/40">
              <ImagePlus className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-ca-ink/[0.08] px-3 py-1.5 text-xs font-medium text-ca-ink-soft hover:bg-ca-bg-soft disabled:opacity-50"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {busy ? "Subiendo…" : url ? "Cambiar" : "Subir"}
          </button>
          {url && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Quitar
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
