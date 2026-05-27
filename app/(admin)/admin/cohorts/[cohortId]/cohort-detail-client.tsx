"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/classroom/primitives";
import {
  StateBadge,
  CohortRoleBadge,
  type State,
  type CohortRole,
} from "@/components/admin/user-primitives";
import type { CohortMember } from "@/lib/admin/user-queries";

type CohortInfo = {
  id: string;
  name: string;
  code: string;
  status: string;
  start_date: string;
  end_date: string;
};

type ProgramInfo = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  total_modules: number | null;
} | null;

type Members = {
  teachers: CohortMember[];
  assistants: CohortMember[];
  students: CohortMember[];
};

type Tab = "info" | "participantes" | "progreso";

const STATUS_MAP: Record<string, State> = {
  active: "active",
  planned: "upcoming",
  closed: "completed",
  archived: "suspended",
};

function mapStatus(dbStatus: string): State {
  return STATUS_MAP[dbStatus] ?? "active";
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ArrowLeftIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

const TABS: { key: Tab; label: string; icon: () => React.ReactNode }[] = [
  { key: "info", label: "Información", icon: InfoIcon },
  { key: "participantes", label: "Participantes", icon: UsersIcon },
  { key: "progreso", label: "Progreso", icon: ChartIcon },
];

const ROLE_COLORS: Record<CohortRole, string> = {
  teacher: "var(--color-ca-violet)",
  assistant: "var(--color-ca-navy, #14163a)",
  student: "var(--color-ca-lime-deep, #3f5a05)",
};

const ROLE_LABELS: Record<CohortRole, { singular: string; plural: string }> = {
  teacher: { singular: "Profesor", plural: "Profesores" },
  assistant: { singular: "Ayudante", plural: "Ayudantes" },
  student: { singular: "Alumno", plural: "Alumnos" },
};

const ACCENT_MAP: Record<CohortRole, string> = {
  teacher: "bg-ca-violet",
  assistant: "bg-ca-navy-ink",
  student: "bg-ca-lime-deep",
};

export function CohortDetailClient({
  cohort,
  program,
  members,
}: {
  cohort: CohortInfo;
  program: ProgramInfo;
  members: Members;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("participantes");
  const [search, setSearch] = useState("");

  const totalCount =
    members.teachers.length + members.assistants.length + members.students.length;

  const participantLabel = `Participantes (${totalCount})`;

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-bold text-ca-ink-soft transition-colors hover:text-ca-violet"
      >
        <ArrowLeftIcon />
        Volver
      </button>

      <div className="mb-6">
        {program && (
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
            {program.name}
          </div>
        )}
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">
          {cohort.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="font-mono text-[12px] font-bold text-ca-ink-soft">
            {cohort.code}
          </span>
          <span className="text-[11px] text-ca-ink-soft">
            {formatDate(cohort.start_date)} — {formatDate(cohort.end_date)}
          </span>
          <StateBadge state={mapStatus(cohort.status)} />
        </div>
      </div>

      <div className="mb-8 flex gap-1 border-b border-ca-ink/[0.08]">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const label = tab.key === "participantes" ? participantLabel : tab.label;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="relative flex items-center gap-2 px-4 py-3 text-[13px] font-bold transition-colors"
              style={{
                color: isActive
                  ? "var(--color-ca-violet)"
                  : "var(--color-ca-ink-soft)",
              }}
            >
              <tab.icon />
              {label}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px]"
                  style={{ background: "var(--color-ca-violet)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "participantes" && (
        <ParticipantesTab
          members={members}
          search={search}
          onSearchChange={setSearch}
          onRowClick={(userId) => router.push(`/admin/users/${userId}`)}
        />
      )}

      {activeTab === "info" && (
        <InfoTab cohort={cohort} program={program} members={members} />
      )}

      {activeTab === "progreso" && <ProgresoTab />}
    </div>
  );
}

function ParticipantesTab({
  members,
  search,
  onSearchChange,
  onRowClick,
}: {
  members: Members;
  search: string;
  onSearchChange: (v: string) => void;
  onRowClick: (userId: string) => void;
}) {
  const totalCount =
    members.teachers.length + members.assistants.length + members.students.length;

  const filterMembers = (list: CohortMember[]) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (m) =>
        (m.full_name ?? "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q),
    );
  };

  const filteredTeachers = filterMembers(members.teachers);
  const filteredAssistants = filterMembers(members.assistants);
  const filteredStudents = filterMembers(members.students);

  const stats: { label: string; value: number; color: string }[] = [
    { label: "Total", value: totalCount, color: "var(--color-ca-ink)" },
    {
      label: "Alumnos",
      value: members.students.length,
      color: ROLE_COLORS.student,
    },
    {
      label: "Profesores",
      value: members.teachers.length,
      color: ROLE_COLORS.teacher,
    },
    {
      label: "Ayudantes",
      value: members.assistants.length,
      color: ROLE_COLORS.assistant,
    },
  ];

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="ca-card relative overflow-hidden p-5">
            <div
              className="shape-circle absolute -right-4 -top-4 h-16 w-16 opacity-[0.08]"
              style={{ background: s.color }}
            />
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
              {s.label}
            </div>
            <div
              className="mt-2 font-mono text-[32px] font-black tracking-tight"
              style={{ color: s.color }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ca-ink-soft">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por nombre o email..."
            className="w-full rounded-xl border border-ca-ink/[0.14] bg-white py-2.5 pl-10 pr-4 text-[13px] font-medium text-ca-ink outline-none transition-colors focus:border-ca-violet"
          />
        </div>
        <button className="ca-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-[13px] font-bold">
          <PlusIcon />
          Agregar participante
        </button>
      </div>

      <div className="ca-card divide-y divide-ca-ink/[0.08] overflow-hidden">
        <RoleSection
          role="teacher"
          members={filteredTeachers}
          onRowClick={onRowClick}
        />
        <RoleSection
          role="assistant"
          members={filteredAssistants}
          onRowClick={onRowClick}
        />
        <RoleSection
          role="student"
          members={filteredStudents}
          onRowClick={onRowClick}
        />
      </div>
    </div>
  );
}

function RoleSection({
  role,
  members,
  onRowClick,
}: {
  role: CohortRole;
  members: CohortMember[];
  onRowClick: (userId: string) => void;
}) {
  const labels = ROLE_LABELS[role];
  if (members.length === 0) return null;

  return (
    <div>
      <div
        className="flex items-center gap-3 px-6 py-3"
        style={{ background: "var(--color-ca-bg-soft)" }}
      >
        <CohortRoleBadge role={role} />
        <span className="text-[12px] font-bold text-ca-ink-soft">
          {members.length} {members.length === 1 ? labels.singular : labels.plural}
        </span>
      </div>

      <div className="divide-y divide-ca-ink/[0.04]">
        {members.map((m) => (
          <button
            key={m.user_id}
            onClick={() => onRowClick(m.user_id)}
            className="flex w-full items-center gap-4 px-6 py-3.5 text-left transition-colors hover:bg-ca-bg-soft/50"
          >
            <Avatar
              initials={getInitials(m.full_name, m.email)}
              size={36}
              accent={ACCENT_MAP[role]}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold text-ca-ink">
                {m.full_name ?? m.email}
              </div>
              <div className="truncate text-[11px] font-medium text-ca-ink-soft">
                {m.email}
              </div>
            </div>
            <div className="hidden text-[11px] font-medium text-ca-ink-soft sm:block">
              {formatDate(m.granted_at)}
            </div>
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ca-ink-soft transition-colors hover:bg-ca-ink/[0.06]"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreIcon />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function InfoTab({
  cohort,
  program,
  members,
}: {
  cohort: CohortInfo;
  program: ProgramInfo;
  members: Members;
}) {
  const totalCount =
    members.teachers.length + members.assistants.length + members.students.length;

  const infoRows: { label: string; value: string }[] = [
    { label: "Código", value: cohort.code },
    { label: "Estado", value: mapStatus(cohort.status) },
    { label: "Fecha inicio", value: formatDate(cohort.start_date) },
    { label: "Fecha término", value: formatDate(cohort.end_date) },
    { label: "Alumnos", value: String(members.students.length) },
    { label: "Profesores", value: String(members.teachers.length) },
    { label: "Ayudantes", value: String(members.assistants.length) },
  ];

  const actions: { label: string; icon: () => React.ReactNode; description: string }[] = [
    {
      label: "Agregar participante",
      icon: PlusIcon,
      description: "Asigna un profesor, ayudante o alumno",
    },
    {
      label: "Subir video",
      icon: UploadIcon,
      description: "Sube contenido al módulo de clases",
    },
    {
      label: "Exportar lista",
      icon: DownloadIcon,
      description: "Descarga el listado de participantes",
    },
    {
      label: "Enviar email a la cohorte",
      icon: MailIcon,
      description: "Comunica novedades al grupo completo",
    },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="ca-card p-6">
        <h3 className="mb-4 text-[16px] font-black text-ca-ink">
          Detalles del programa
        </h3>
        {program && (
          <p className="mb-4 text-[13px] font-semibold text-ca-ink-soft">
            {program.name}
            {program.description && ` — ${program.description}`}
          </p>
        )}
        <div className="divide-y divide-ca-ink/[0.06]">
          {infoRows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between py-3"
            >
              <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-ca-ink-soft">
                {row.label}
              </span>
              {row.label === "Estado" ? (
                <StateBadge state={row.value as State} />
              ) : (
                <span className="text-[13px] font-bold text-ca-ink">
                  {row.value}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl p-3" style={{ background: "var(--color-ca-bg-soft)" }}>
          <span className="text-[11px] font-bold text-ca-ink-soft">
            Total participantes
          </span>
          <span className="ml-auto font-mono text-[18px] font-black text-ca-ink">
            {totalCount}
          </span>
        </div>
      </div>

      <div className="ca-card p-6">
        <h3 className="mb-4 text-[16px] font-black text-ca-ink">
          Acciones rápidas
        </h3>
        <div className="flex flex-col gap-3">
          {actions.map((action) => (
            <button
              key={action.label}
              className="flex items-center gap-4 rounded-xl border border-ca-ink/[0.08] p-4 text-left transition-colors hover:border-ca-violet/30 hover:bg-ca-violet/[0.03]"
            >
              <div
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                style={{ background: "var(--color-ca-bg-soft)" }}
              >
                <action.icon />
              </div>
              <div>
                <div className="text-[13px] font-bold text-ca-ink">
                  {action.label}
                </div>
                <div className="text-[11px] font-medium text-ca-ink-soft">
                  {action.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProgresoTab() {
  const router = useRouter();

  return (
    <div className="ca-card flex flex-col items-center justify-center p-12 text-center">
      <div
        className="mb-4 grid h-16 w-16 place-items-center rounded-2xl"
        style={{ background: "var(--color-ca-bg-soft)" }}
      >
        <ChartIcon />
      </div>
      <h3 className="text-[18px] font-black text-ca-ink">
        Reporte de progreso
      </h3>
      <p className="mt-2 max-w-sm text-[13px] font-medium text-ca-ink-soft">
        El reporte detallado de avance por alumno y módulo vive en la sección
        dedicada de progreso de la cohorte.
      </p>
      <button
        onClick={() => router.push("/admin/progress")}
        className="ca-btn-primary mt-6 px-6 py-2.5 text-[13px] font-bold"
      >
        Ir a Progreso cohorte
      </button>
    </div>
  );
}
