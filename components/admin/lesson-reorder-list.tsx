"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Video, VideoOff, ChevronUp, ChevronDown, AlertTriangle, Pencil } from "lucide-react";

type LessonItem = {
  id: string;
  title: string;
  kind: string;
  hasVideo: boolean;
};

type SiblingModule = { id: string; title: string };

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
      {items.map((lesson, index) => (
        <div
          key={lesson.id}
          className="flex items-center gap-3 rounded-lg border border-ca-ink/[0.08] bg-ca-surface p-4"
        >
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={saving || index === 0}
              aria-label="Subir"
              className="rounded p-0.5 text-ca-ink-soft hover:bg-ca-bg-soft hover:text-ca-violet disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={saving || index === items.length - 1}
              aria-label="Bajar"
              className="rounded p-0.5 text-ca-ink-soft hover:bg-ca-bg-soft hover:text-ca-violet disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ca-bg-soft text-xs font-semibold text-ca-ink-soft">
            {index + 1}
          </span>

          <Link href={`/admin/lessons/${lesson.id}`} className="min-w-0 flex-1 hover:text-ca-violet">
            <p className="truncate font-medium text-ca-ink">{lesson.title}</p>
            <p className="text-xs text-ca-ink-soft">{lesson.kind}</p>
          </Link>

          {lesson.hasVideo ? (
            <span className="flex items-center gap-1 rounded-full bg-ca-lime-mist px-2 py-0.5 text-xs font-medium text-ca-lime-deep">
              <Video className="h-3 w-3" />
              Video
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-ca-bg-soft px-2 py-0.5 text-xs text-ca-ink-soft">
              <VideoOff className="h-3 w-3" />
              Sin video
            </span>
          )}

          <Link
            href={`/admin/lessons/${lesson.id}`}
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ca-ink-soft hover:text-ca-violet"
            title="Editar lección"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Link>

          {siblingModules.length > 0 && (
            <select
              aria-label="Mover a módulo"
              defaultValue=""
              disabled={saving}
              onChange={(e) => moveToModule(lesson.id, e.target.value)}
              className="shrink-0 rounded-md border border-ca-ink/[0.12] bg-white px-2 py-1 text-xs text-ca-ink-soft focus:border-ca-violet focus:outline-none disabled:opacity-50"
            >
              <option value="">Mover a…</option>
              {siblingModules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  );
}
