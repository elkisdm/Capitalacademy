"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { VideoOff, FileText, ChevronUp, ChevronDown, AlertTriangle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { fmtDuration } from "@/lib/classroom/format";
import { lessonThumbnail, lessonVideoStatus } from "@/lib/admin/lesson-video-status";

type LessonItem = {
  id: string;
  title: string;
  kind: string;
  position: number;
  muxPlaybackId: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  muxUploadId: string | null;
  muxError: string | null;
  muxTrackId: string | null;
  hasContent: boolean;
  unlockAt: string | null;
};

type SiblingModule = { id: string; title: string };

const KIND_LABELS: Record<string, string> = {
  recorded: "Grabada",
  live_online: "En vivo online",
  live_in_person: "Presencial",
};

export function LessonReorderList({
  moduleId,
  lessons,
  siblingModules = [],
}: {
  moduleId: string;
  lessons: LessonItem[];
  siblingModules?: SiblingModule[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(lessons);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moveToModule = async (lessonId: string, targetModuleId: string) => {
    if (!targetModuleId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId: targetModuleId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo mover la lección");
        return;
      }
      // La lección sale de este módulo; quítala de la lista local y refresca.
      setItems((prev) => prev.filter((l) => l.id !== lessonId));
      router.refresh();
    } catch {
      setError("Error de red al mover la lección");
    } finally {
      setSaving(false);
    }
  };

  const persist = async (ordered: LessonItem[], previous: LessonItem[]) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lessons/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, orderedIds: ordered.map((l) => l.id) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo reordenar");
        setItems(previous); // revertir
        return;
      }
      router.refresh();
    } catch {
      setError("Error de red al reordenar");
      setItems(previous);
    } finally {
      setSaving(false);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const previous = items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next); // optimista
    persist(next, previous);
  };

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {items.map((lesson, index) => {
        const thumbnail = lessonThumbnail(lesson);
        const status = lessonVideoStatus(lesson);
        const isScheduled = lesson.unlockAt && new Date(lesson.unlockAt) > new Date();

        return (
          <div
            key={lesson.id}
            className="flex flex-wrap items-center gap-4 rounded-xl border border-ca-ink/[0.08] bg-ca-surface p-3 transition hover:-translate-y-0.5 hover:border-ca-violet/30 hover:shadow-[0_8px_24px_rgba(20,22,58,0.08)]"
          >
            <div className="flex flex-col">
              <Button
                type="button"
                variant="ghost"
                onClick={() => move(index, -1)}
                disabled={saving || index === 0}
                aria-label="Subir"
                className="h-auto min-h-0 rounded p-0.5 text-ca-ink-soft hover:text-ca-violet disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => move(index, 1)}
                disabled={saving || index === items.length - 1}
                aria-label="Bajar"
                className="h-auto min-h-0 rounded p-0.5 text-ca-ink-soft hover:text-ca-violet disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>

            <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-ca-bg-soft md:w-40">
              {thumbnail ? (
                <Image
                  src={thumbnail}
                  alt={lesson.title}
                  fill
                  sizes="160px"
                  className="object-cover"
                  loading="lazy"
                />
              ) : lesson.hasContent ? (
                <div className="flex h-full w-full items-center justify-center text-ca-ink-soft/60">
                  <FileText className="h-6 w-6" />
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-ca-ink-soft/60">
                  <VideoOff className="h-6 w-6" />
                </div>
              )}
              {lesson.durationSeconds ? (
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {fmtDuration(lesson.durationSeconds)}
                </span>
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
                Lección {index + 1}
              </p>
              <Link
                href={`/admin/lessons/${lesson.id}`}
                className="block truncate text-[15px] font-bold text-ca-ink hover:text-ca-violet"
              >
                {lesson.title}
              </Link>
              <p className="text-xs text-ca-ink-soft">
                {KIND_LABELS[lesson.kind] ?? lesson.kind}
                {lesson.muxTrackId ? " · Subtítulos" : ""}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={status.tone} size="sm">
                {status.label}
              </Badge>
              {isScheduled && (
                <Badge tone="neutral" size="sm">
                  Programada{" "}
                  {new Date(lesson.unlockAt as string).toLocaleDateString("es-CL", {
                    day: "numeric",
                    month: "short",
                  })}
                </Badge>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 pl-1">
              <Link
                href={`/admin/lessons/${lesson.id}`}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ca-ink-soft hover:text-ca-violet"
                title="Editar lección"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Link>

              {siblingModules.length > 0 && (
                <Select
                  aria-label="Mover a módulo"
                  defaultValue=""
                  disabled={saving}
                  onChange={(e) => moveToModule(lesson.id, e.target.value)}
                  className="w-auto px-2 py-1 text-xs"
                >
                  <option value="">Mover a…</option>
                  {siblingModules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
