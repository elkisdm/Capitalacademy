"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

/** Marca una lección sin video como completada (POST /api/classroom/progress). */
export function MarkCompleteButton({
  lessonId,
  initialCompleted,
}: {
  lessonId: string;
  initialCompleted: boolean;
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState(initialCompleted);
  const [loading, setLoading] = useState(false);

  async function markDone() {
    setLoading(true);
    try {
      const res = await fetch("/api/classroom/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });
      if (res.ok) {
        setCompleted(true);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (completed) {
    return (
      <div className="inline-flex items-center gap-2 rounded-2xl bg-ca-lime/15 px-5 py-3 text-[13.5px] font-bold text-ca-ink">
        <Check className="h-4 w-4 text-ca-lime-deep" />
        Clase completada
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={markDone}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-2xl bg-ca-ink px-5 py-3 text-[13.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      Marcar como completada
    </button>
  );
}
