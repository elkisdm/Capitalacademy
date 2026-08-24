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
import type { LeadRow } from "@/lib/admin/leads-queries";

function FunnelEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z" />
    </svg>
  );
}

const linkBtn =
  "ca-btn-interactive inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40";

function LeadDetail({ lead, onClose }: { lead: LeadRow; onClose: () => void }) {
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

export function LeadsPanel({ leads }: { leads: LeadRow[] }) {
  const [chip, setChip] = useState("todos");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      if (!q) return true;
      return [l.full_name, l.email, l.phone, l.company ?? "", l.role ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [leads, chip, search]);

  const selected = filtered.find((l) => l.id === selectedId) ?? null;

  return (
    <div>
      <StudentToolbar
        chips={chips}
        activeChip={chip}
        onChip={setChip}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Nombre, correo, empresa…"
        searchLabel="Buscar lead"
      />

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
          detail={selected ? <LeadDetail lead={selected} onClose={() => setSelectedId(null)} /> : null}
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
                      <Badge tone="neutral" size="sm" className="hidden sm:inline-flex">
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
