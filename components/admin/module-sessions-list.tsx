"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, ExternalLink, AlertTriangle } from "lucide-react";

type SessionItem = {
  id: string;
  title: string;
  startsAt: string;
  modality: string;
  teacherName: string | null;
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
      {items.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-3 rounded-lg border border-ca-ink/[0.08] bg-ca-surface p-3"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ca-bg-soft text-ca-ink-soft">
            <Calendar className="h-4 w-4" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ca-ink">{s.title}</p>
            <p className="truncate text-xs text-ca-ink-soft">
              {fmt(s.startsAt)} · {MODALITY_LABEL[s.modality] ?? s.modality}
              {s.teacherName ? ` · ${s.teacherName}` : ""}
            </p>
          </div>

          {siblingModules.length > 0 && (
            <select
              aria-label="Mover clase a módulo"
              defaultValue=""
              disabled={saving}
              onChange={(e) => moveToModule(s.id, e.target.value)}
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

          <Link
            href={`/admin/cohorts/${cohortId}/sesiones`}
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-ca-ink-soft hover:text-ca-violet"
            title="Editar en el calendario"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Calendario
          </Link>
        </div>
      ))}
    </div>
  );
}
