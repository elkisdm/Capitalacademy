"use client";

import { useCallback, useState } from "react";
import { Heart } from "lucide-react";

type ReactionButtonProps = {
  targetType: "thread" | "comment";
  targetId: string;
  initialCount: number;
  initialReacted: boolean;
};

export function ReactionButton({
  targetType,
  targetId,
  initialCount,
  initialReacted,
}: ReactionButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [reacted, setReacted] = useState(initialReacted);
  const [pending, setPending] = useState(false);

  const handleToggle = useCallback(async () => {
    if (pending) return;
    setPending(true);

    const prevReacted = reacted;
    const prevCount = count;
    setReacted(!prevReacted);
    setCount(prevReacted ? Math.max(0, prevCount - 1) : prevCount + 1);

    try {
      const res = await fetch("/api/classroom/conversaciones/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          targetType === "thread" ? { threadId: targetId } : { commentId: targetId },
        ),
      });
      if (!res.ok) throw new Error("Error al reaccionar");
      const data = await res.json();
      setReacted(data.reacted);
      setCount(data.count);
    } catch {
      setReacted(prevReacted);
      setCount(prevCount);
    } finally {
      setPending(false);
    }
  }, [pending, reacted, count, targetType, targetId]);

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      aria-pressed={reacted}
      aria-label={reacted ? "Quitar reacción" : "Reaccionar con corazón"}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors ${
        reacted ? "bg-ca-violet/[0.1] text-ca-violet" : "text-ca-ink-soft hover:bg-ca-bg-soft"
      } disabled:cursor-not-allowed`}
    >
      <Heart size={15} fill={reacted ? "currentColor" : "none"} strokeWidth={reacted ? 0 : 1.75} />
      {count}
    </button>
  );
}
