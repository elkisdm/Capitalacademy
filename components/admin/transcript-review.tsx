"use client";

import { useState, useEffect, useCallback } from "react";
import { fmtTimestamp } from "@/lib/classroom/format";

type TranscriptSegment = {
  id: string;
  transcript_id: string;
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  original_text: string;
  corrected_text: string | null;
  needs_review: boolean;
  review_reason: string | null;
  manually_edited: boolean;
  edited_by: string | null;
  edited_at: string | null;
};

type TranscriptReviewProps = {
  lessonId: string;
  lessonTitle: string;
};

type FilterMode = "needs_review" | "all";

function SaveIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function FilterIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function SegmentCard({
  segment,
  onSave,
}: {
  segment: TranscriptSegment;
  onSave: (segmentId: string, correctedText: string) => Promise<void>;
}) {
  const [text, setText] = useState(
    segment.corrected_text ?? segment.original_text,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty =
    text !== (segment.corrected_text ?? segment.original_text);

  const handleSave = useCallback(async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      await onSave(segment.id, text);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [segment.id, text, isDirty, saving, onSave]);

  return (
    <div className="border-b border-ca-ink/[0.06] px-5 py-4 transition-colors hover:bg-ca-bg-soft/50">
      {/* Timestamp row */}
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[11px] font-bold tabular-nums text-ca-ink-soft">
          {fmtTimestamp(segment.start_seconds)} → {fmtTimestamp(segment.end_seconds)}
        </span>

        {segment.needs_review && segment.review_reason && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{
              background: "rgba(255,196,0,0.18)",
              color: "#7a5000",
            }}
          >
            {segment.review_reason}
          </span>
        )}

        {segment.manually_edited && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{
              background: "rgba(168,211,16,0.22)",
              color: "#3f5a05",
            }}
          >
            Editado manualmente
          </span>
        )}
      </div>

      {/* Original text */}
      <div className="mb-2 text-[12px] text-ca-ink-soft line-through">
        {segment.original_text}
      </div>

      {/* Editable corrected text */}
      <div className="flex gap-2">
        <textarea
          aria-label="Texto corregido del segmento"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="flex-1 resize-none rounded-xl border border-ca-ink/[0.08] bg-ca-surface px-3 py-2 text-[16px] text-ca-ink outline-none transition-colors placeholder:text-ca-ink-soft/60 focus:border-ca-violet/30 focus:ring-1 focus:ring-ca-violet/20 md:text-[13px]"
        />
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="flex h-10 shrink-0 items-center gap-1.5 self-end rounded-xl px-4 text-[12px] font-bold uppercase tracking-[0.1em] transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: isDirty
              ? "var(--color-ca-lime)"
              : "var(--color-ca-bg-soft)",
            color: isDirty
              ? "var(--color-ca-ink)"
              : "var(--color-ca-ink-soft)",
          }}
        >
          {saving ? (
            "…"
          ) : saved ? (
            <>
              <SaveIcon size={12} />
              Listo
            </>
          ) : (
            "Guardar"
          )}
        </button>
      </div>
    </div>
  );
}

export function TranscriptReview({ lessonId, lessonTitle }: TranscriptReviewProps) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("needs_review");

  const fetchSegments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ lessonId });
      if (filter === "needs_review") {
        params.set("needsReview", "true");
      }
      const res = await fetch(
        `/api/admin/transcript-segments?${params.toString()}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al cargar segmentos");
      }
      const data = await res.json();
      setSegments(data.segments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [lessonId, filter]);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments]);

  const handleSave = useCallback(
    async (segmentId: string, correctedText: string) => {
      const res = await fetch("/api/admin/transcript-segments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId, correctedText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al guardar");
      }
      const { segment: updated } = await res.json();

      // Update in-place
      setSegments((prev) =>
        prev.map((s) => (s.id === segmentId ? { ...s, ...updated } : s)),
      );
    },
    [],
  );

  const pendingCount = segments.filter((s) => s.needs_review).length;

  return (
    <div className="ca-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ca-ink/[0.08] px-5 py-4">
        <div>
          <h3 className="text-[16px] font-black tracking-tight text-ca-ink">
            Revisión de transcripción
          </h3>
          <div className="mt-0.5 text-[12px] font-semibold text-ca-ink-soft">
            {lessonTitle}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Pending count */}
          <span className="font-mono text-[12px] font-bold tabular-nums text-ca-ink-soft">
            {pendingCount} segmento{pendingCount !== 1 ? "s" : ""} pendiente
            {pendingCount !== 1 ? "s" : ""} de revisión
          </span>

          {/* Filter toggle */}
          <button
            onClick={() =>
              setFilter((f) =>
                f === "needs_review" ? "all" : "needs_review",
              )
            }
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors"
            style={{
              background:
                filter === "needs_review"
                  ? "var(--color-ca-ink)"
                  : "transparent",
              color:
                filter === "needs_review"
                  ? "#fff"
                  : "var(--color-ca-ink-soft)",
              border:
                filter === "needs_review"
                  ? "1px solid var(--color-ca-ink)"
                  : "1px solid rgba(20,22,58,0.14)",
            }}
          >
            <FilterIcon size={11} />
            {filter === "needs_review"
              ? "Solo pendientes"
              : "Todos"}
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid place-items-center py-16">
          <div className="text-[13px] font-semibold text-ca-ink-soft">
            Cargando segmentos…
          </div>
        </div>
      ) : error ? (
        <div className="grid place-items-center py-16">
          <div className="text-center">
            <div className="text-[14px] font-bold text-ca-ink">
              Error al cargar
            </div>
            <div className="mt-1 text-[12px] text-ca-ink-soft">{error}</div>
            <button
              onClick={fetchSegments}
              className="mt-3 rounded-full bg-ca-violet px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-ca-violet-deep"
            >
              Reintentar
            </button>
          </div>
        </div>
      ) : segments.length === 0 ? (
        <div className="grid place-items-center py-16">
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ca-bg-soft">
              <SaveIcon size={22} />
            </div>
            <div className="mt-3 text-[14px] font-bold text-ca-ink">
              {filter === "needs_review"
                ? "Sin segmentos pendientes"
                : "Sin segmentos"}
            </div>
            <div className="text-[12px] text-ca-ink-soft">
              {filter === "needs_review"
                ? "Todos los segmentos han sido revisados."
                : "Esta lección no tiene transcripción segmentada."}
            </div>
          </div>
        </div>
      ) : (
        <div className="max-h-[600px] overflow-y-auto">
          {segments.map((seg) => (
            <SegmentCard
              key={seg.id}
              segment={seg}
              onSave={handleSave}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-ca-ink/[0.08] bg-ca-bg-soft px-5 py-3">
        <div className="text-[11px] font-semibold text-ca-ink-soft">
          {segments.length} segmento{segments.length !== 1 ? "s" : ""} cargado
          {segments.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
