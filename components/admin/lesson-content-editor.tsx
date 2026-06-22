"use client";

import { useRef, useState } from "react";
import { ImagePlus, Eye, Pencil, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Markdown } from "@/components/ui/markdown";

const BUCKET = "lesson-content";
const MAX_SIZE = 5 * 1024 * 1024;

/**
 * Editor de contenido de texto/diapositiva (Markdown) de una lección.
 * Controlado por el form padre. Permite subir imágenes intercaladas al bucket
 * público `lesson-content` e insertar su Markdown en el cursor.
 */
export function LessonContentEditor({
  lessonId,
  value,
  onChange,
}: {
  lessonId: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function insertAtCursor(snippet: string) {
    const el = textareaRef.current;
    if (!el) {
      onChange(value + snippet);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    // Reposiciona el cursor después del snippet en el próximo tick.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function handleImage(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Solo se permiten imágenes.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("La imagen no puede superar 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const urlRes = await fetch("/api/admin/lesson-content/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      if (!urlRes.ok) {
        const b = await urlRes.json().catch(() => null);
        setError(b?.error ?? "No se pudo iniciar la subida.");
        return;
      }
      const { path, token, publicUrl } = await urlRes.json();

      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (upErr) {
        setError("Error al subir la imagen.");
        return;
      }

      const alt = file.name.replace(/\.[^.]+$/, "");
      insertAtCursor(`\n\n![${alt}](${publicUrl})\n\n`);
    } catch {
      setError("Error de red al subir la imagen.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-ca-ink/[0.08] p-0.5">
          <button
            type="button"
            onClick={() => setTab("edit")}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors"
            style={{
              background: tab === "edit" ? "var(--color-ca-violet)" : "transparent",
              color: tab === "edit" ? "#fff" : "var(--color-ca-ink-soft)",
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors"
            style={{
              background: tab === "preview" ? "var(--color-ca-violet)" : "transparent",
              color: tab === "preview" ? "#fff" : "var(--color-ca-ink-soft)",
            }}
          >
            <Eye className="h-3.5 w-3.5" />
            Vista previa
          </button>
        </div>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-md border border-ca-ink/[0.08] px-3 py-1.5 text-xs font-medium text-ca-ink-soft hover:border-ca-violet hover:text-ca-violet disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          {uploading ? "Subiendo…" : "Insertar imagen"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImage(f);
          }}
        />
      </div>

      {tab === "edit" ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          className="w-full rounded-md border border-ca-ink/[0.08] px-3 py-2 font-mono text-[13px] leading-relaxed focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30"
          placeholder={"Escribe la clase en Markdown.\n\n# Título\n\nUna **explicación** con listas:\n- Punto uno\n- Punto dos\n\nUsa “Insertar imagen” para intercalar diapositivas o capturas."}
        />
      ) : (
        <div className="min-h-[12rem] rounded-md border border-ca-ink/[0.08] bg-white px-4 py-3">
          {value.trim() ? (
            <Markdown content={value} />
          ) : (
            <p className="text-sm text-ca-ink-soft">Nada que previsualizar todavía.</p>
          )}
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      <p className="mt-1.5 text-[11px] text-ca-ink-soft">
        Formato Markdown: <code>**negrita**</code>, <code># título</code>, listas, enlaces e imágenes.
        Si la lección no tiene video, el alumno verá este contenido.
      </p>
    </div>
  );
}
