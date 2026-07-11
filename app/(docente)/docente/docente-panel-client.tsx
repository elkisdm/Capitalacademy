"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SessionResource, SessionResourceType } from "@/lib/classroom/types";
import type { TeacherCohort, TeacherSession } from "@/lib/docente/queries";
import { SessionAttendancePanel } from "@/components/admin/session-attendance-panel";
import { SessionQrButton } from "@/components/admin/session-qr";
import { SessionResourcesPanel } from "@/components/admin/session-resources-panel";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

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

const STATUS_TONES: Record<string, NonNullable<BadgeProps["tone"]>> = {
  scheduled: "neutral",
  in_progress: "lime",
  finished: "neutral",
  cancelled: "destructive",
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

type DocenteStats = {
  nextSession: TeacherSession | null;
  studentCount: number;
};

function SessionRow({
  session: s,
  cohort,
  expanded,
  onToggle,
  resources,
  onAdd,
  onRemove,
  index,
}: {
  session: TeacherSession;
  cohort: TeacherCohort | undefined;
  expanded: boolean;
  onToggle: () => void;
  resources: SessionResource[];
  onAdd: (
    payload:
      | { source: "link"; title: string; type: SessionResourceType; url: string }
      | {
          source: "file";
          title: string;
          type: SessionResourceType;
          storagePath: string;
          fileSizeBytes: number;
        },
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  index: number;
}) {
  // Los paneles de recursos/asistencia hacen fetch al montarse: se mantienen
  // desmontados hasta el primer "Ver detalle" para no disparar N llamadas en
  // el load de la página. Una vez abiertos, quedan montados (no se refetch al
  // volver a colapsar) mientras el wrapper anima el alto con grid-rows.
  const [hasOpened, setHasOpened] = useState(expanded);
  useEffect(() => {
    if (expanded) setHasOpened(true);
  }, [expanded]);

  return (
    <div
      className="ca-card ca-card-hoverable ca-fade-up ca-stagger mb-4 overflow-hidden"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="flex w-full flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-bold text-ca-ink-soft">
              {fmtRange(s.starts_at, s.ends_at)}
            </span>
            <Badge tone={STATUS_TONES[s.status] ?? "neutral"} size="sm">
              {STATUS_LABELS[s.status] ?? s.status}
            </Badge>
          </div>
          <h3 className="mt-1 truncate text-[15px] font-extrabold tracking-tight text-ca-ink">
            {s.title ?? "Sin título"}
          </h3>
          <div className="mt-1 text-[11px] font-medium text-ca-ink-soft">
            {cohort?.programName ?? ""} · {cohort?.cohortName ?? ""} ·{" "}
            {MODALITY_LABELS[s.modality] ?? s.modality}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-3 self-start sm:self-auto">
          <SessionQrButton sessionId={s.id} sessionTitle={s.title ?? "Clase en vivo"} />
          <button
            type="button"
            onClick={onToggle}
            className="text-[12px] font-bold text-ca-violet"
          >
            {expanded ? "Ocultar" : "Ver detalle"}
          </button>
        </div>
      </div>

      <div
        className="grid transition-[grid-template-rows]"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transitionDuration: "var(--dur-base)",
          transitionTimingFunction: "var(--ease-decel)",
        }}
      >
        <div className="overflow-hidden">
          {hasOpened && (
            <div className="border-t border-ca-ink/[0.06] px-5 py-5">
              <SessionResourcesPanel
                sessionId={s.id}
                resources={resources}
                onAdd={onAdd}
                onRemove={onRemove}
              />
              <SessionAttendancePanel sessionId={s.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Panel del docente: lista de SUS sesiones (próximas primero) con asistencia
 * y material por clase. Solo lectura de sesiones — sin crear/editar/borrar.
 */
export function DocentePanelClient({
  cohorts,
  programs,
  upcomingSessions,
  pastSessions,
  stats,
}: {
  cohorts: TeacherCohort[];
  programs: ProgramLink[];
  upcomingSessions: TeacherSession[];
  pastSessions: TeacherSession[];
  stats: DocenteStats;
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

  return (
    <div>
      <h1 className="mb-1 text-[28px] font-black tracking-[-0.02em] text-ca-ink">
        Panel del profesor
      </h1>
      <p className="mb-6 text-[13px] text-ca-ink-soft">
        Tus clases, asistencia y material de las cohortes donde eres docente.
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="ca-card px-5 py-5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ca-ink-soft">
            Próxima clase
          </div>
          {stats.nextSession ? (
            <>
              <div className="mt-2 truncate text-[15px] font-extrabold tracking-tight text-ca-ink">
                {stats.nextSession.title ?? "Sin título"}
              </div>
              <div className="mt-1 text-[12px] font-medium text-ca-ink-soft">
                {fmtRange(stats.nextSession.starts_at, stats.nextSession.ends_at)}
                {cohortById.get(stats.nextSession.cohort_id)?.cohortName
                  ? ` · ${cohortById.get(stats.nextSession.cohort_id)?.cohortName}`
                  : ""}
              </div>
            </>
          ) : (
            <div className="mt-2 text-[14px] font-bold text-ca-ink-soft">
              Sin clases programadas
            </div>
          )}
        </div>
        <div className="ca-card px-5 py-5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ca-ink-soft">
            Alumnos
          </div>
          <div className="mt-2 text-[28px] font-black tracking-tight text-ca-ink">
            {stats.studentCount}
          </div>
        </div>
      </div>

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
        <EmptyState
          className="mb-8"
          title="No tienes clases próximas."
          description="Cuando el admin programe una nueva sesión en tus cohortes, aparecerá aquí."
        />
      ) : (
        <div className="mb-8">
          {upcomingSessions.map((s, i) => (
            <SessionRow
              key={s.id}
              session={s}
              cohort={cohortById.get(s.cohort_id)}
              expanded={expandedId === s.id}
              onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
              resources={resourcesBySession[s.id] ?? []}
              onAdd={(payload) => addResource(s.id, payload)}
              onRemove={(id) => removeResource(s.id, id)}
              index={i}
            />
          ))}
        </div>
      )}

      <h2 className="mb-3 text-[16px] font-black text-ca-ink">Clases pasadas</h2>
      {pastSessions.length === 0 ? (
        <EmptyState title="Aún no hay clases pasadas." />
      ) : (
        <div>
          {pastSessions.map((s, i) => (
            <SessionRow
              key={s.id}
              session={s}
              cohort={cohortById.get(s.cohort_id)}
              expanded={expandedId === s.id}
              onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
              resources={resourcesBySession[s.id] ?? []}
              onAdd={(payload) => addResource(s.id, payload)}
              onRemove={(id) => removeResource(s.id, id)}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
