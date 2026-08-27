"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/classroom/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  StudentToolbar,
  StudentRow,
  TwoPane,
  DetailSectionTitle,
} from "@/components/admin/students/shared";
import {
  PROGRAM_LABELS,
  formatLeadDate,
  formatLeadDateFull,
  formatLeadOrigin,
  isNewLead,
  leadInitials,
  phoneDigits,
} from "@/lib/admin/leads-format";
import {
  LEAD_EXPORT_WIDTHS,
  buildLeadsSheet,
  leadsFileName,
} from "@/lib/admin/leads-export";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  ultimoContacto,
} from "@/lib/admin/leads-pipeline";
import type {
  LeadRow,
  LeadActivityRow,
  LeadTaskRow,
} from "@/lib/admin/leads-queries";
import { LeadSeguimiento } from "./lead-seguimiento";
import { Pendientes } from "./pendientes";

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function FunnelEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z" />
    </svg>
  );
}

const linkBtn =
  "ca-btn-interactive inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40";

function LeadDetail({
  lead,
  activity,
  tasks,
  onClose,
}: {
  lead: LeadRow;
  activity: LeadActivityRow[];
  tasks: LeadTaskRow[];
  onClose: () => void;
}) {
  return (
    <div className="flex max-h-[88vh] flex-col overflow-hidden lg:max-h-none">
      <div className="flex items-start justify-between border-b border-ca-ink/[0.08] p-5">
        <div className="flex items-center gap-4">
          <Avatar initials={leadInitials(lead.full_name)} size={48} accent="bg-ca-lime" />
          <div className="min-w-0">
            <h3 className="text-[18px] font-black tracking-tight text-ca-ink">
              {lead.full_name}
            </h3>
            <div className="truncate font-mono text-[11px] font-semibold text-ca-ink-soft">
              {(lead.role || lead.company)
                ? [lead.role, lead.company].filter(Boolean).join(" · ")
                : PROGRAM_LABELS[lead.program_interest] ?? lead.program_interest}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Cerrar"
          className="h-9 w-9 shrink-0 rounded-full p-0 lg:hidden"
        >
          <svg aria-hidden="true" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-6 flex flex-wrap gap-2">
          <a
            href={`https://wa.me/${phoneDigits(lead.phone)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(linkBtn, "ca-btn-lime")}
          >
            Escribir por WhatsApp
          </a>
          <a
            href={`mailto:${lead.email}`}
            className={cn(linkBtn, "border border-ca-ink/[0.14] bg-transparent text-ca-ink hover:bg-ca-bg-soft")}
          >
            Enviar correo
          </a>
        </div>

        <LeadSeguimiento
          leadId={lead.id}
          leadEmail={lead.email}
          stage={lead.stage}
          activity={activity}
          tasks={tasks}
        />

        <div className="mt-6" />

        <DetailSectionTitle>Contacto</DetailSectionTitle>
        <div className="mb-6 flex flex-col gap-2">
          <InfoRow label="Correo" value={lead.email} mono />
          <InfoRow label="Teléfono" value={lead.phone} mono />
          <InfoRow
            label="Programa de interés"
            value={PROGRAM_LABELS[lead.program_interest] ?? lead.program_interest}
          />
          <InfoRow label="Llegó" value={formatLeadDateFull(lead.created_at)} />
        </div>

        {(lead.lidera_equipo || lead.personas_a_cargo || (lead.desafios?.length ?? 0) > 0) && (
          <>
            <DetailSectionTitle>Calificación</DetailSectionTitle>
            <div className="mb-6 flex flex-col gap-2">
              {lead.lidera_equipo && <InfoRow label="¿Lidera un equipo?" value={lead.lidera_equipo} />}
              {lead.personas_a_cargo && <InfoRow label="Personas a cargo" value={lead.personas_a_cargo} />}
              {lead.desafios && lead.desafios.length > 0 && (
                <div className="rounded-xl border border-ca-ink/[0.08] p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
                    Desafíos que marcó
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {lead.desafios.map((d) => (
                      <Badge key={d} tone="violet" size="sm">
                        {d}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {lead.message && (
          <>
            <DetailSectionTitle>Mensaje</DetailSectionTitle>
            <blockquote className="mb-6 rounded-xl border border-ca-ink/[0.08] bg-ca-bg-soft/50 p-3 text-[13px] leading-relaxed text-ca-ink">
              “{lead.message}”
              <footer className="mt-2 text-[11px] font-bold not-italic text-ca-ink-soft">
                Dejado en {PROGRAM_LABELS[lead.program_interest] ?? lead.program_interest}
              </footer>
            </blockquote>
          </>
        )}

        <DetailSectionTitle>Origen</DetailSectionTitle>
        <div className="flex flex-col gap-2">
          <InfoRow label="Canal" value={formatLeadOrigin(lead)} />
          {lead.utm_content && <InfoRow label="Anuncio" value={lead.utm_content} />}
          {lead.utm_medium && <InfoRow label="Medio" value={lead.utm_medium} />}
          {lead.source && <InfoRow label="Formulario" value={lead.source} mono />}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-xl border border-ca-ink/[0.08] p-3">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 break-words text-right text-[13px] font-bold text-ca-ink",
          mono && "font-mono text-[12px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function LeadsPanel({
  leads,
  activity,
  tasks,
}: {
  leads: LeadRow[];
  activity: LeadActivityRow[];
  tasks: LeadTaskRow[];
}) {
  const [chip, setChip] = useState("todos");
  const [etapa, setEtapa] = useState("todas");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);

  // Actividad y tareas llegan planas (una consulta cada una) y se agrupan acá:
  // con decenas de leads sale más barato que una consulta por lead al
  // seleccionar una fila, y deja el detalle abriendo sin ir a la red.
  const actividadPorLead = useMemo(() => {
    const m = new Map<string, LeadActivityRow[]>();
    for (const a of activity) {
      const lista = m.get(a.lead_id);
      if (lista) lista.push(a);
      else m.set(a.lead_id, [a]);
    }
    return m;
  }, [activity]);

  const tareasPorLead = useMemo(() => {
    const m = new Map<string, LeadTaskRow[]>();
    for (const t of tasks) {
      const lista = m.get(t.lead_id);
      if (lista) lista.push(t);
      else m.set(t.lead_id, [t]);
    }
    return m;
  }, [tasks]);

  const ultimoContactoPorLead = useMemo(() => {
    const m = new Map<string, string>();
    for (const [leadId, acts] of actividadPorLead) {
      const iso = ultimoContacto(acts);
      if (iso) m.set(leadId, iso);
    }
    return m;
  }, [actividadPorLead]);

  const tareasPendientesPorLead = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) {
      if (t.done_at) continue;
      m.set(t.lead_id, (m.get(t.lead_id) ?? 0) + 1);
    }
    return m;
  }, [tasks]);

  const pendientes = useMemo(
    () =>
      tasks.map((t) => ({
        ...t,
        lead_name: leads.find((l) => l.id === t.lead_id)?.full_name ?? "Lead sin nombre",
      })),
    [tasks, leads],
  );

  const etapaChips = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of leads) counts[l.stage] = (counts[l.stage] ?? 0) + 1;
    return [
      { id: "todas", label: "Todas", count: leads.length },
      // Las etapas vacías se ocultan, SALVO la que está activa: mover el último
      // lead de una etapa la vaciaría y el chip desaparecería con el filtro
      // todavía puesto, dejando una lista vacía sin ningún chip marcado y sin
      // pista de por qué.
      ...LEAD_STAGES.filter((s) => (counts[s] ?? 0) > 0 || s === etapa).map((s) => ({
        id: s as string,
        label: LEAD_STAGE_LABELS[s],
        count: counts[s] ?? 0,
      })),
    ];
  }, [leads, etapa]);

  const chips = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of leads) counts[l.program_interest] = (counts[l.program_interest] ?? 0) + 1;
    return [
      { id: "todos", label: "Todos", count: leads.length },
      ...Object.entries(PROGRAM_LABELS)
        .filter(([key]) => (counts[key] ?? 0) > 0)
        .map(([key, label]) => ({ id: key, label, count: counts[key] })),
    ];
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (chip !== "todos" && l.program_interest !== chip) return false;
      if (etapa !== "todas" && l.stage !== etapa) return false;
      if (!q) return true;
      return [l.full_name, l.email, l.phone, l.company ?? "", l.role ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [leads, chip, etapa, search]);

  // Se resuelve contra TODOS los leads y no contra los filtrados: mover la etapa
  // del lead abierto lo saca del filtro activo ("Nuevo" → "Contactado") y, si se
  // resolviera contra `filtered`, el detalle se cerraría solo en mitad del
  // trabajo — justo después de la acción más frecuente del panel.
  const selected = leads.find((l) => l.id === selectedId) ?? null;

  // Se descarga LO QUE ESTÁ EN PANTALLA (chip + búsqueda ya aplicados): los
  // leads viven completos en el cliente, así que no hace falta un endpoint que
  // vuelva a resolver el mismo filtro del otro lado.
  //
  // SheetJS pesa lo suyo, así que entra por `import()` al hacer clic: quien
  // nunca descarga no lo carga nunca.
  async function descargarXlsx() {
    if (descargando || filtered.length === 0) return;
    setDescargando(true);
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet(buildLeadsSheet(filtered, ultimoContactoPorLead));
      ws["!cols"] = LEAD_EXPORT_WIDTHS.map((wch) => ({ wch }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leads");
      XLSX.writeFile(wb, leadsFileName(chip));
    } finally {
      setDescargando(false);
    }
  }

  // Seleccionar desde la franja de pendientes tiene que poder saltar a un lead
  // que el filtro actual esconde; si no, el clic no haría nada visible.
  function irAlLead(leadId: string) {
    setChip("todos");
    setEtapa("todas");
    setSearch("");
    setSelectedId(leadId);
  }

  return (
    <div>
      <Pendientes tasks={pendientes} onIrAlLead={irAlLead} />

      <StudentToolbar
        chips={chips}
        activeChip={chip}
        onChip={setChip}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Nombre, correo, empresa…"
        searchLabel="Buscar lead"
        rightSlot={
          <Button
            variant="outline"
            size="sm"
            onClick={descargarXlsx}
            disabled={descargando || filtered.length === 0}
            title={
              filtered.length === 0
                ? "No hay leads que descargar"
                : `Descargar ${filtered.length} lead${filtered.length === 1 ? "" : "s"} en Excel`
            }
          >
            <DownloadIcon className="mr-1.5 inline-block align-[-2px]" />
            {descargando ? "Generando…" : `Descargar XLSX (${filtered.length})`}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
          Etapa
        </span>
        {etapaChips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setEtapa(c.id)}
            aria-pressed={etapa === c.id}
            className={cn(
              "ca-btn-interactive rounded-full border px-3 py-1 text-[12px] font-bold",
              etapa === c.id
                ? "border-transparent bg-ca-ink text-ca-surface"
                : "border-ca-ink/[0.14] text-ca-ink-soft hover:bg-ca-bg-soft",
            )}
          >
            {c.label} <span className="opacity-60">{c.count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FunnelEmptyIcon}
          title={leads.length === 0 ? "Aún no hay leads" : "Nada calza con ese filtro"}
          description={
            leads.length === 0
              ? "Cuando alguien complete un formulario público aparecerá acá al instante."
              : "Prueba con otro programa o borra la búsqueda."
          }
        />
      ) : (
        <TwoPane
          onClose={() => setSelectedId(null)}
          detail={
            selected ? (
              <LeadDetail
                lead={selected}
                activity={actividadPorLead.get(selected.id) ?? []}
                tasks={tareasPorLead.get(selected.id) ?? []}
                onClose={() => setSelectedId(null)}
              />
            ) : null
          }
          list={
            <div className="flex flex-col gap-1.5">
              {filtered.map((lead) => (
                <StudentRow
                  key={lead.id}
                  initials={leadInitials(lead.full_name)}
                  name={lead.full_name}
                  sub={`${lead.email} · ${formatLeadDate(lead.created_at)}`}
                  selected={lead.id === selectedId}
                  onSelect={() => setSelectedId(lead.id)}
                  badge={
                    <span className="flex shrink-0 items-center gap-1.5">
                      {isNewLead(lead.created_at) && (
                        <Badge tone="lime" size="sm" dot>
                          Nuevo
                        </Badge>
                      )}
                      {(tareasPendientesPorLead.get(lead.id) ?? 0) > 0 && (
                        <Badge tone="violet" size="sm">
                          {tareasPendientesPorLead.get(lead.id)} pend.
                        </Badge>
                      )}
                      <Badge tone="neutral" size="sm" className="hidden sm:inline-flex">
                        {LEAD_STAGE_LABELS[lead.stage]}
                      </Badge>
                      <Badge tone="neutral" size="sm" className="hidden md:inline-flex">
                        {PROGRAM_LABELS[lead.program_interest] ?? lead.program_interest}
                      </Badge>
                    </span>
                  }
                />
              ))}
            </div>
          }
        />
      )}
    </div>
  );
}
