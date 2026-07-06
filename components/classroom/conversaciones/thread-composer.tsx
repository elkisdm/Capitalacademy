"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";

// Forma mínima de un thread recién creado (respuesta cruda del insert de la
// API, sin embed de autor ni conteos de reacciones — eso lo completa quien
// consume `onCreated`, que ya conoce al viewer).
export type ThreadListItemLike = {
  id: string;
  title: string;
  body: string;
  category: string;
  is_pinned: boolean;
  is_locked: boolean;
  comment_count: number;
  last_activity_at: string;
  created_at: string;
};

type ThreadComposerProps = {
  programId: string;
  onCreated: (thread: ThreadListItemLike) => void;
};

export function ThreadComposer({ programId, onCreated }: ThreadComposerProps) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !submitting;

  const handleCancel = () => {
    setTitle("");
    setBody("");
    setError(null);
    setExpanded(false);
  };

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/classroom/conversaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId, title: title.trim(), body: body.trim() }),
      });
      if (!res.ok) throw new Error("Error al publicar");
      const data = await res.json();
      onCreated(data.thread);
      setTitle("");
      setBody("");
      setExpanded(false);
    } catch {
      setError("No se pudo publicar. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, programId, title, body, onCreated]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="ca-card w-full px-5 py-4 text-left text-[14px] font-semibold text-ca-ink-soft transition-colors hover:border-ca-violet/30 hover:text-ca-ink"
      >
        Inicia una conversación…
      </button>
    );
  }

  return (
    <div className="ca-card flex flex-col gap-3 p-5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título"
        maxLength={200}
        autoFocus
        className="w-full rounded-lg border border-ca-ink/[0.12] bg-ca-surface px-3 py-2 text-[15px] font-bold text-ca-ink placeholder:font-normal placeholder:text-ca-ink-soft/60 focus:border-ca-violet focus:outline-none"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Comparte algo con la comunidad…"
        rows={4}
        maxLength={10000}
        className="w-full resize-none rounded-lg border border-ca-ink/[0.12] bg-ca-surface px-3 py-2 text-[13.5px] leading-relaxed text-ca-ink placeholder:text-ca-ink-soft/60 focus:border-ca-violet focus:outline-none"
      />
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ca-ink-soft transition-colors hover:bg-ca-bg-soft disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ca-violet px-4 py-1.5 text-[12px] font-semibold text-white transition-all hover:bg-ca-violet-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Publicar
        </button>
      </div>
    </div>
  );
}
