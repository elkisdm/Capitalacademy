"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type CoverImageFieldProps = {
  target: "module" | "lesson" | "session";
  id: string;
  initialUrl: string | null;
  /** Para pantallas que mantienen la fila en estado local: router.refresh()
      no reemplaza un useState ya inicializado y la portada quedaría vieja. */
  onChanged?: (url: string | null) => void;
};

export function CoverImageField({ target, id, initialUrl, onChanged }: CoverImageFieldProps) {
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
      onChanged?.(j.cover_image_url ?? null);
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
      onChanged?.(null);
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {busy ? "Subiendo…" : url ? "Cambiar" : "Subir"}
          </Button>
          {url && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={remove}
              disabled={busy}
              className="border-red-200 text-red-500 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Quitar
            </Button>
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
