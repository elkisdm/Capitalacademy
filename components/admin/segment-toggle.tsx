"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type SegmentValue = "capital_inteligente" | null;

/**
 * Toggle de segmento Capital Inteligente para una matrícula (enrollment).
 * Marcar/desmarcar persiste vía PATCH /api/admin/enrollment-segment y luego
 * refresca el Server Component para reflejar el estado real.
 */
export function SegmentToggle({
  cohortId,
  studentId,
  initialSegment,
}: {
  cohortId: string;
  studentId: string;
  initialSegment: SegmentValue;
}) {
  const router = useRouter();
  const [segment, setSegment] = useState<SegmentValue>(initialSegment);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isCapital = segment === "capital_inteligente";

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (isPending) return;
    setError(null);

    const next: SegmentValue = isCapital ? null : "capital_inteligente";
    const prev = segment;
    setSegment(next); // optimista

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/enrollment-segment", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cohort_id: cohortId,
            student_id: studentId,
            segment: next,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? "Error al actualizar");
        }
        router.refresh();
      } catch (err) {
        setSegment(prev); // revierte
        setError(err instanceof Error ? err.message : "Error");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      title={
        error
          ? error
          : isCapital
            ? "Quitar etiqueta Capital Inteligente"
            : "Marcar como alumno Capital Inteligente"
      }
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] transition-colors ${
        isCapital
          ? "border-transparent bg-ca-violet text-white"
          : "border-ca-ink/[0.14] bg-white text-ca-ink-soft hover:border-ca-violet hover:text-ca-violet"
      } ${isPending ? "opacity-60" : ""}`}
    >
      <span
        className={`shape-circle h-1.5 w-1.5 ${
          isCapital ? "bg-ca-lime" : "bg-ca-ink/30"
        }`}
      />
      Capital Inteligente
    </button>
  );
}
