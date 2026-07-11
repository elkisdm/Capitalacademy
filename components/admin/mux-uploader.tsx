"use client";

import { useState, useRef, useCallback } from "react";
import { createUpload } from "@mux/upchunk";
import { Button } from "@/components/ui/button";

type MuxUploaderProps = {
  lessonId: string;
  onUploadComplete?: () => void;
};

type UploadState = "idle" | "requesting" | "uploading" | "processing" | "ready" | "error";

export function MuxUploader({ lessonId, onUploadComplete }: MuxUploaderProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setState("requesting");
      setProgress(0);
      setErrorMessage("");

      try {
        const res = await fetch("/api/admin/mux/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Error al solicitar upload");
        }

        const { uploadUrl } = await res.json();
        setState("uploading");

        // Subida chunked y reanudable: UpChunk reintenta cada chunk ante cortes
        // de red (antes era un PUT único que fallaba entero con archivos grandes).
        const upload = createUpload({ endpoint: uploadUrl, file });

        upload.on("progress", (e) => {
          const pct =
            typeof e.detail === "number" ? e.detail : (e.detail?.progress ?? 0);
          setProgress(Math.round(pct));
        });
        upload.on("error", (e) => {
          setState("error");
          setErrorMessage(
            e.detail?.message ?? "Error de red durante la subida",
          );
        });
        upload.on("success", () => {
          setState("processing");
          onUploadComplete?.();
        });
      } catch (err) {
        setState("error");
        setErrorMessage(err instanceof Error ? err.message : "Error desconocido");
      }
    },
    [lessonId, onUploadComplete],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  if (state === "uploading") {
    return (
      <div className="ca-card overflow-hidden p-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ca-violet/10 text-ca-violet">
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />
          </svg>
        </div>
        <h3 className="mt-4 text-[18px] font-extrabold tracking-tight text-ca-ink">Subiendo a Mux…</h3>
        <div className="mt-1 truncate font-mono text-[12px] text-ca-ink-soft">{fileName}</div>
        <div className="mx-auto mt-6 max-w-md">
          <div className="flex items-center justify-between text-[12px] font-bold">
            <span className="text-ca-ink">Progreso</span>
            <span className="font-mono text-ca-violet">{progress}%</span>
          </div>
          <div className="mt-2">
            <div className="shape-circle relative h-2 w-full overflow-hidden bg-ca-ink/[0.08]">
              <div className="ca-progress-stripe h-full bg-ca-violet" style={{ width: `${progress}%`, transition: "width 320ms ease" }} />
            </div>
          </div>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ca-ink-soft">
            Direct upload · subiendo archivo
          </div>
        </div>
      </div>
    );
  }

  if (state === "processing") {
    return (
      <div className="ca-card overflow-hidden p-8 text-center">
        <div className="relative mx-auto grid h-20 w-20 place-items-center">
          <div className="ca-spin-slow absolute inset-0 rounded-full" style={{ background: "conic-gradient(var(--color-ca-violet) 0%, var(--color-ca-lime) 60%, transparent 60%)" }} />
          <div className="absolute inset-1.5 grid place-items-center rounded-full bg-ca-surface text-ca-violet">
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5" />
            </svg>
          </div>
        </div>
        <h3 className="mt-4 text-[18px] font-extrabold tracking-tight text-ca-ink">Procesando en Mux…</h3>
        <p className="mt-1 text-[13px] text-ca-ink-soft">
          Generando transcoding adaptativo y thumbnails. Esto tarda ~2-5 min.
        </p>
        <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-ca-violet/[0.08] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ca-violet">
          <span className="shape-circle ca-pulse h-1.5 w-1.5 bg-ca-violet" />
          Webhook esperando · video.asset.ready
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="ca-card overflow-hidden p-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-50 text-red-500">
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        </div>
        <h3 className="mt-4 text-[18px] font-extrabold tracking-tight text-ca-ink">{errorMessage}</h3>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setState("idle")}
          className="mt-4 h-auto min-h-0 p-0 text-[12px] font-bold uppercase tracking-[0.14em] text-ca-violet hover:bg-transparent"
        >
          Intentar de nuevo
        </Button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => fileRef.current?.click()}
      className="ca-card cursor-pointer overflow-hidden p-10 text-center transition-all"
      style={{
        borderStyle: "dashed",
        borderWidth: 2,
        borderColor: dragging ? "var(--color-ca-violet)" : "rgba(20,22,58,0.14)",
        background: dragging ? "rgba(94,23,235,0.04)" : "var(--color-ca-surface)",
      }}
    >
      <input ref={fileRef} type="file" accept="video/*" hidden onChange={handleFileChange} />
      <div className="relative mx-auto h-20 w-20">
        <div className="shape-circle absolute inset-0 bg-ca-violet opacity-[0.08]" />
        <div className="shape-circle absolute -right-2 -top-2 h-6 w-6 bg-ca-lime" />
        <div className="absolute inset-0 grid place-items-center text-ca-violet">
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />
          </svg>
        </div>
      </div>
      <h3 className="mt-5 text-[22px] font-black tracking-tight text-ca-ink">
        Arrastra tu video aquí
      </h3>
      <p className="mt-1 text-[13px] text-ca-ink-soft">
        o haz click para seleccionar un archivo
      </p>
      <div className="mt-6 flex items-center justify-center gap-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ca-ink-soft">
        <span>MP4 · MOV · WebM</span>
        <span className="opacity-30">·</span>
        <span>Hasta 12 GB</span>
        <span className="opacity-30">·</span>
        <span>Direct upload a Mux</span>
      </div>
    </div>
  );
}
