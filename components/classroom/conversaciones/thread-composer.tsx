"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  CONVERSATION_CATEGORIES,
  type ConversationCategoryKey,
} from "@/lib/conversaciones/categories";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";

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
  const [category, setCategory] = useState<ConversationCategoryKey>("general");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !submitting;

  const handleCancel = () => {
    setTitle("");
    setBody("");
    setCategory("general");
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
        body: JSON.stringify({ programId, title: title.trim(), body: body.trim(), category }),
      });
      if (!res.ok) throw new Error("Error al publicar");
      const data = await res.json();
      onCreated(data.thread);
      setTitle("");
      setBody("");
      setCategory("general");
      setExpanded(false);
    } catch {
      setError("No se pudo publicar. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, programId, title, body, category, onCreated]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="ca-card ca-card-hoverable w-full px-5 py-4 text-left text-[14px] font-semibold text-ca-ink-soft transition-colors hover:text-ca-ink"
      >
        Inicia una conversación…
      </button>
    );
  }

  return (
    <div className="ca-card flex flex-col gap-3 p-5">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título"
        aria-label="Título de la conversación"
        maxLength={200}
        autoFocus
        className="rounded-lg px-3 py-2 text-[15px] font-bold placeholder:font-normal"
      />
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Categoría de la conversación">
        {CONVERSATION_CATEGORIES.map((c) => (
          <Button
            key={c.key}
            type="button"
            variant="ghost"
            onClick={() => setCategory(c.key)}
            aria-pressed={category === c.key}
            className={`h-auto min-h-0 rounded-full px-3 py-1 text-[12px] ${
              category === c.key
                ? "bg-ca-violet/[0.1] text-ca-violet"
                : "text-ca-ink-soft"
            }`}
          >
            {c.label}
          </Button>
        ))}
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Comparte algo con la comunidad…"
        aria-label="Mensaje de la conversación"
        rows={4}
        maxLength={10000}
        className="resize-none rounded-lg px-3 py-2 text-[16px] leading-relaxed md:text-[13.5px]"
      />
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={handleCancel}
          disabled={submitting}
          className="h-auto min-h-0 rounded-lg px-3 py-1.5 text-[12px]"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="h-auto min-h-0 rounded-lg px-4 py-1.5 text-[12px]"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Publicar
        </Button>
      </div>
    </div>
  );
}
