"use client";

import { useState } from "react";
import Link from "next/link";
import type { SessionResource, SessionResourceType } from "@/lib/classroom/types";
import type { TeacherCohort, TeacherSession } from "@/lib/docente/queries";
import { SessionAttendancePanel } from "@/components/admin/session-attendance-panel";
import { SessionResourcesPanel } from "@/components/admin/session-resources-panel";

const TZ = "America/Santiago";

const MODALITY_LABELS: Record<string, string> = {
  live_online: "Online en vivo",
  live_in_person: "Presencial",
  recorded: "Grabada",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Programada",
  in_progress: "En curso",
  finished: "Finalizada",
  cancelled: "Cancelada",
};

function fmtRange(startsAt: string, endsAt: string): string {
  const day = new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(startsAt));
  const start = new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(startsAt));
  const end = new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(endsAt));
  return `${day} · ${start}–${end}`;
}

type ProgramLink = { programId: string; programName: string; conversationsHref: string };

/**
 * Panel del docente: lista de SUS sesiones (próximas primero) con asistencia
 * y material por clase. Solo lectura de sesiones — sin crear/editar/borrar.
 */
export function DocentePanelClient({
  cohorts,
  programs,
  upcomingSessions,
  pastSessions,
}: {
  cohorts: TeacherCohort[];
  programs: ProgramLink[];
  upcomingSessions: TeacherSession[];
  pastSessions: TeacherSession[];
}) {
  const [resourcesBySession, setResourcesBySession] = useState<
    Record<string, SessionResource[]>
  >(() => {
    const map: Record<string, SessionResource[]> = {};
    for (const s of [...upcomingSessions, ...pastSessions]) map[s.id] = s.resources;
    return map;
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const cohortById = new Map(cohorts.map((c) => [c.cohortId, c]));

  async function addResource(
    sessionId: string,
    payload:
      | { source: "link"; title: string; type: SessionResourceType; url: string }
      | {
          source: "file";
          title: string;
          type: SessionResourceType;
          storagePath: string;
          fileSizeBytes: number;
        },
  ) {
    const res = await fetch("/api/admin/session-resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, ...payload }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error ?? "No se pudo agregar el recurso.");
    }
    const created = (await res.json()) as SessionResource;
    setResourcesBySession((prev) => ({
      ...prev,
      [sessionId]: [...(prev[sessionId] ?? []), created],
    }));
  }

  async function removeResource(sessionId: string, id: string) {
    const res = await fetch(`/api/admin/session-resources?id=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error ?? "No se pudo eliminar el recurso.");
    }
    setResourcesBySession((prev) => ({
      ...prev,
      [sessionId]: (prev[sessionId] ?? []).filter((r) => r.id !== id),
    }));
  }

  function SessionRow({ s }: { s: TeacherSession }) {
    const cohort = cohortById.get(s.cohort_id);
    const expanded = expandedId === s.id;
    return (
      <div className="ca-card mb-4 overflow-hidden">
        <button
          type="button"
          onClick={() => setExpandedId(expanded ? null : s.id)}
          className="flex w-full flex-col gap-2 px-5 py-4 text-left sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-bold text-ca-ink-soft">
                {fmtRange(s.starts_at, s.ends_at)}
              </span>
              <span className="rounded-full bg-ca-bg-soft px-2 py-0.5 text-[10px] font-bold text-ca-ink-soft">
                {STATUS_LABELS[s.status] ?? s.status}
              </span>
            </div>
            <h3 className="mt-1 truncate text-[15px] font-extrabold tracking-tight text-ca-ink">
              {s.title ?? "Sin título"}
            </h3>
            <div className="mt-1 text-[11px] font-medium text-ca-ink-soft">
              {cohort?.programName ?? ""} · {cohort?.cohortName ?? ""} ·{" "}
              {MODALITY_LABELS[s.modality] ?? s.modality}
            </div>
          </div>
          <span className="shrink-0 text-[12px] font-bold text-ca-violet">
            {expanded ? "Ocultar" : "Ver detalle"}
          </span>
        </button>

        {expanded && (
          <div className="border-t border-ca-ink/[0.06] px-5 py-5">
            <SessionResourcesPanel
              sessionId={s.id}
              resources={resourcesBySession[s.id] ?? []}
              onAdd={(payload) => addResource(s.id, payload)}
              onRemove={(id) => removeResource(s.id, id)}
            />
            <SessionAttendancePanel sessionId={s.id} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-[28px] font-black tracking-[-0.02em] text-ca-ink">
        Panel del profesor
      </h1>
      <p className="mb-6 text-[13px] text-ca-ink-soft">
        Tus clases, asistencia y material de las cohortes donde eres docente.
      </p>

      {programs.length > 0 && (
        <div className="mb-8 flex flex-col gap-2">
          {programs.map((p) => (
            <div
              key={p.programId}
              className="ca-card flex items-center justify-between gap-3 px-5 py-4"
            >
              <div className="text-[14px] font-bold text-ca-ink">{p.programName}</div>
              <Link
                href={p.conversationsHref}
                className="ca-btn-primary inline-flex items-center gap-2 px-4 py-2 text-[12px] font-bold"
              >
                Ir a Conversaciones
              </Link>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-[16px] font-black text-ca-ink">Próximas clases</h2>
      {upcomingSessions.length === 0 ? (
        <p className="mb-8 text-[13px] text-ca-ink-soft">No tienes clases próximas.</p>
      ) : (
        <div className="mb-8">
          {upcomingSessions.map((s) => (
            <SessionRow key={s.id} s={s} />
          ))}
        </div>
      )}

      <h2 className="mb-3 text-[16px] font-black text-ca-ink">Clases pasadas</h2>
      {pastSessions.length === 0 ? (
        <p className="text-[13px] text-ca-ink-soft">Aún no hay clases pasadas.</p>
      ) : (
        <div>
          {pastSessions.map((s) => (
            <SessionRow key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}
