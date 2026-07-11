"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Video, VideoOff, ChevronUp, ChevronDown, AlertTriangle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";

type LessonItem = {
  id: string;
  title: string;
  kind: string;
  hasVideo: boolean;
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
      {items.map((lesson, index) => (
        <div
          key={lesson.id}
          className="flex items-center gap-3 rounded-lg border border-ca-ink/[0.08] bg-ca-surface p-4"
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

          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ca-bg-soft text-xs font-semibold text-ca-ink-soft">
            {index + 1}
          </span>

          <Link href={`/admin/lessons/${lesson.id}`} className="min-w-0 flex-1 hover:text-ca-violet">
            <p className="truncate font-medium text-ca-ink">{lesson.title}</p>
            <p className="text-xs text-ca-ink-soft">{KIND_LABELS[lesson.kind] ?? lesson.kind}</p>
          </Link>

          <div className="flex shrink-0 items-center gap-2 pl-1">
            {lesson.hasVideo ? (
              <Badge tone="lime" size="sm">
                <Video className="h-3 w-3" />
                Video
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm">
                <VideoOff className="h-3 w-3" />
                Sin video
              </Badge>
            )}

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
      ))}
    </div>
  );
}
