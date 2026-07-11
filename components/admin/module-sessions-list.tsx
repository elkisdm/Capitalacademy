"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, AlertTriangle, Paperclip, ChevronDown, Pencil, Video } from "lucide-react";
import { ResourceManager } from "./resource-manager";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { lessonVideoStatus } from "@/lib/admin/lesson-video-status";
import { fmtDuration } from "@/lib/classroom/format";

type SessionResource = {
  id: string;
  session_id?: string;
  title: string;
  type: string;
  url: string | null;
  storage_path?: string | null;
  file_size_bytes?: number | null;
  position: number;
};

type SessionRecording = {
  lessonId: string;
  muxPlaybackId: string | null;
  muxUploadId: string | null;
  muxError: string | null;
  durationSeconds: number | null;
};

type SessionItem = {
  id: string;
  title: string;
  startsAt: string;
  modality: string;
  teacherName: string | null;
  resources: SessionResource[];
  recording: SessionRecording | null;
};

type SiblingModule = { id: string; title: string };

const MODALITY_LABEL: Record<string, string> = {
  live_in_person: "Presencial",
  live_online: "Online",
  recorded: "Grabada",
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Estado de la repetición (lección vinculada a la clase en vivo). Ver migración 0041. */
function recordingStatus(recording: SessionRecording | null) {
  if (!recording) return { tone: "neutral" as const, label: "Sin repetición" };
  const status = lessonVideoStatus({
    muxPlaybackId: recording.muxPlaybackId,
    muxUploadId: recording.muxUploadId,
    muxError: recording.muxError,
    hasContent: false,
  });
  if (recording.muxPlaybackId) {
    const dur = fmtDuration(recording.durationSeconds);
    return { tone: status.tone, label: dur === "—" ? "Repetición" : `Repetición · ${dur}` };
  }
  return status;
}

/**
 * Clases en vivo (class_sessions) de un módulo, para la cohorte seleccionada.
 * Permite reasignar el módulo de cada clase (sincronizado con el calendario, es
 * la misma data) y enlaza al editor de calendario para el resto de los campos.
 */
export function ModuleSessionsList({
  cohortId,
  sessions,
  siblingModules = [],
}: {
  cohortId: string;
  sessions: SessionItem[];
  siblingModules?: SiblingModule[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(sessions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const moveToModule = async (sessionId: string, targetModuleId: string) => {
    if (!targetModuleId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_id: targetModuleId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo mover la clase");
        return;
      }
      setItems((prev) => prev.filter((s) => s.id !== sessionId));
      router.refresh();
    } catch {
      setError("Error de red al mover la clase");
    } finally {
      setSaving(false);
    }
  };

  if (items.length === 0) {
    return (
      <p className="text-xs text-ca-ink-soft">
        Sin clases en vivo de esta cohorte en este módulo.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {items.map((s) => {
        const expanded = expandedId === s.id;
        const count = s.resources.length;
        const recording = recordingStatus(s.recording);
        return (
          <div
            key={s.id}
            className="rounded-xl border border-ca-ink/[0.08] bg-ca-surface transition hover:-translate-y-0.5 hover:border-ca-violet/30 hover:shadow-[0_8px_24px_rgba(20,22,58,0.08)]"
          >
            <div className="flex items-center gap-4 p-3">
              <div className="flex aspect-video w-32 shrink-0 items-center justify-center rounded-lg bg-ca-bg-soft text-ca-ink-soft/60">
                <Calendar className="h-6 w-6" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ca-ink">{s.title}</p>
                <p className="truncate text-xs text-ca-ink-soft">
                  {fmt(s.startsAt)} · {MODALITY_LABEL[s.modality] ?? s.modality}
                  {s.teacherName ? ` · ${s.teacherName}` : ""}
                </p>
                <Badge tone={recording.tone} size="sm" className="mt-1">
                  {recording.label}
                </Badge>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExpandedId(expanded ? null : s.id)}
                aria-expanded={expanded}
                className="shrink-0"
                title="Material de la clase"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Material{count > 0 ? ` · ${count}` : ""}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </Button>

              {siblingModules.length > 0 && (
                <Select
                  aria-label="Mover clase a módulo"
                  defaultValue=""
                  disabled={saving}
                  onChange={(e) => moveToModule(s.id, e.target.value)}
                  className="w-auto shrink-0 px-2 py-1 text-xs"
                >
                  <option value="">Mover a…</option>
                  {siblingModules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </Select>
              )}

              <Link
                href={`/admin/cohorts/${cohortId}/sesiones?session=${s.id}`}
                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ca-ink-soft hover:text-ca-violet"
                title="Editar esta clase (fecha, docente, enlace)"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Link>

              {s.recording?.muxPlaybackId && (
                <Link
                  href={`/admin/lessons/${s.recording.lessonId}`}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ca-ink-soft hover:text-ca-violet"
                  title="Editar la repetición de esta clase"
                >
                  <Video className="h-3.5 w-3.5" />
                  Editar repetición
                </Link>
              )}
            </div>

            {expanded && (
              <div className="border-t border-ca-ink/[0.08] p-3">
                <ResourceManager sessionId={s.id} initialResources={s.resources} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
