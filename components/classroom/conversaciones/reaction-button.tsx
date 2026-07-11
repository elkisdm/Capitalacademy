"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import { REACTION_EMOJIS } from "@/lib/conversaciones/reactions";
import { Button } from "@/components/ui/button";

type ReactionCount = { emoji: string; count: number };

type ReactionButtonProps = {
  targetType: "thread" | "comment";
  targetId: string;
  reactions: ReactionCount[];
  viewerReaction: string | null;
};

const EMOJI_LABELS: Record<string, string> = {
  "❤️": "Me encanta",
  "👍": "Me gusta",
  "🎉": "Celebrar",
  "💡": "Idea",
};

function emojiLabel(emoji: string): string {
  return EMOJI_LABELS[emoji] ?? emoji;
}

/**
 * Aplica localmente el efecto de reaccionar con `emoji` sobre el estado actual,
 * respetando la regla "una reacción por viewer": mismo emoji → quita; otro →
 * cambia (baja el anterior, sube el nuevo); ninguna → agrega. Devuelve el
 * desglose reordenado según REACTION_EMOJIS. Se usa para el update optimista.
 */
function recompute(
  current: ReactionCount[],
  viewerReaction: string | null,
  emoji: string,
): { reactions: ReactionCount[]; viewerReaction: string | null } {
  const counts = new Map(current.map((r) => [r.emoji, r.count]));
  if (viewerReaction) counts.set(viewerReaction, (counts.get(viewerReaction) ?? 1) - 1);

  let nextViewer: string | null;
  if (viewerReaction === emoji) {
    nextViewer = null;
  } else {
    counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
    nextViewer = emoji;
  }

  const reactions = REACTION_EMOJIS.filter((e) => (counts.get(e) ?? 0) > 0).map((e) => ({
    emoji: e,
    count: counts.get(e) as number,
  }));
  return { reactions, viewerReaction: nextViewer };
}

export function ReactionButton({
  targetType,
  targetId,
  reactions: initialReactions,
  viewerReaction: initialViewerReaction,
}: ReactionButtonProps) {
  const [reactions, setReactions] = useState<ReactionCount[]>(initialReactions);
  const [viewerReaction, setViewerReaction] = useState<string | null>(initialViewerReaction);
  const [pending, setPending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [pickerOpen]);

  const react = useCallback(
    async (emoji: string) => {
      if (pending) return;
      setPending(true);
      setPickerOpen(false);

      const prevReactions = reactions;
      const prevViewer = viewerReaction;
      const optimistic = recompute(reactions, viewerReaction, emoji);
      setReactions(optimistic.reactions);
      setViewerReaction(optimistic.viewerReaction);

      try {
        const res = await fetch("/api/classroom/conversaciones/reactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            targetType === "thread"
              ? { threadId: targetId, emoji }
              : { commentId: targetId, emoji },
          ),
        });
        if (!res.ok) throw new Error("Error al reaccionar");
        const data = await res.json();
        setReactions((data.reactions ?? []) as ReactionCount[]);
        setViewerReaction((data.viewer_reaction ?? null) as string | null);
      } catch {
        setReactions(prevReactions);
        setViewerReaction(prevViewer);
      } finally {
        setPending(false);
      }
    },
    [pending, reactions, viewerReaction, targetType, targetId],
  );

  return (
    <div className="relative inline-flex items-center gap-1">
      {reactions.map((r) => {
        const mine = viewerReaction === r.emoji;
        return (
          <Button
            key={r.emoji}
            type="button"
            variant="ghost"
            onClick={() => react(r.emoji)}
            disabled={pending}
            aria-pressed={mine}
            aria-label={`${emojiLabel(r.emoji)} (${r.count})`}
            className={`h-auto min-h-0 gap-1 rounded-full px-2 py-1 text-[12px] ${
              mine
                ? "bg-ca-violet/[0.1] text-ca-violet ring-1 ring-ca-violet/30"
                : "text-ca-ink-soft"
            }`}
          >
            <span aria-hidden>{r.emoji}</span>
            {r.count}
          </Button>
        );
      })}

      <div className="relative" ref={pickerRef}>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setPickerOpen((o) => !o)}
          disabled={pending}
          aria-label="Agregar reacción"
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          className="h-auto min-h-0 rounded-full px-1.5 py-1 text-ca-ink-soft"
        >
          <SmilePlus size={15} strokeWidth={1.75} />
        </Button>

        {pickerOpen && (
          <div
            role="menu"
            aria-label="Elige una reacción"
            className="absolute bottom-full left-0 z-20 mb-1 flex items-center gap-0.5 rounded-full border border-ca-ink/[0.08] bg-ca-surface px-1.5 py-1 shadow-lg"
          >
            {REACTION_EMOJIS.map((emoji) => {
              const mine = viewerReaction === emoji;
              return (
                <Button
                  key={emoji}
                  type="button"
                  variant="ghost"
                  role="menuitem"
                  onClick={() => react(emoji)}
                  disabled={pending}
                  aria-pressed={mine}
                  aria-label={`${mine ? "Quitar" : "Reaccionar con"} ${emojiLabel(emoji)}`}
                  className={`h-8 min-h-0 w-8 place-items-center rounded-full p-0 text-[16px] hover:scale-125 ${
                    mine ? "bg-ca-violet/[0.12]" : ""
                  }`}
                >
                  <span aria-hidden>{emoji}</span>
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
