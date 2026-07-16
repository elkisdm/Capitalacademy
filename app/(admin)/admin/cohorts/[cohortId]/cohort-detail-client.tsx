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
import { SegmentToggle } from "@/components/admin/segment-toggle";
import { AssignParticipantModal } from "@/components/admin/assign-participant-modal";
import { useToast } from "@/components/admin/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { AdminUserListItem, CohortMember } from "@/lib/admin/user-queries";
import Link from "next/link";
import {
  ArrowLeftIcon,
  UsersIcon,
  InfoIcon,
  ChartIcon,
  SearchIcon,
  PlusIcon,
  UploadIcon,
  DownloadIcon,
  MailIcon,
  CalendarIcon,
} from "@/components/admin/icons";

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

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "info", label: "Información", icon: InfoIcon },
  { key: "participantes", label: "Participantes", icon: UsersIcon },
  { key: "progreso", label: "Progreso", icon: ChartIcon },
];

const TAB_BTN_CLASS =
  "relative flex items-center gap-2 px-4 py-3 text-[13px] font-bold transition-colors";

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
  users,
}: {
  cohort: CohortInfo;
  program: ProgramInfo;
  members: Members;
  users: AdminUserListItem[];
}) {
  const router = useRouter();
  const { toast, ToastContainer } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("participantes");
  const [search, setSearch] = useState("");
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  const totalCount =
    members.teachers.length + members.assistants.length + members.students.length;

  const participantLabel = `Participantes (${totalCount})`;

  return (
    <div>
      <Button
        variant="ghost"
        onClick={() => router.back()}
        className="mb-5 !h-auto !w-auto gap-1.5 rounded-full !px-0 !py-0 text-[13px] font-bold text-ca-ink-soft hover:!bg-transparent hover:text-ca-violet"
      >
        <ArrowLeftIcon />
        Volver
      </Button>

      <div className="mb-6">
        {program && (
          <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
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
              className={TAB_BTN_CLASS}
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

        <Link
          href={`/admin/cohorts/${cohort.id}/sesiones`}
          className={TAB_BTN_CLASS}
          style={{ color: "var(--color-ca-ink-soft)" }}
        >
          <CalendarIcon />
          Calendario
        </Link>
      </div>

      {activeTab === "participantes" && (
        <ParticipantesTab
          cohortId={cohort.id}
          members={members}
          search={search}
          onSearchChange={setSearch}
          onRowClick={(userId) => router.push(`/admin/users/${userId}`)}
        />
      )}

      {activeTab === "info" && (
        <InfoTab
          cohort={cohort}
          program={program}
          members={members}
          onOpenAssignParticipant={() => setAssignModalOpen(true)}
        />
      )}

      {activeTab === "progreso" && <ProgresoTab />}

      <AssignParticipantModal
        open={assignModalOpen}
        cohortId={cohort.id}
        cohortName={cohort.name}
        users={users}
        onClose={() => setAssignModalOpen(false)}
        onAssign={async (data) => {
          const res = await fetch("/api/admin/cohort-roles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: data.userId,
              cohort_id: cohort.id,
              role: data.role,
            }),
          });
          if (res.ok) {
            setAssignModalOpen(false);
            toast("Participante asignado", "success");
            router.refresh();
          } else {
            const err = await res.json().catch(() => ({}));
            toast(err.error ?? "Error al asignar rol", "error");
          }
        }}
      />
      <ToastContainer />
    </div>
  );
}

function ParticipantesTab({
  cohortId,
  members,
  search,
  onSearchChange,
  onRowClick,
}: {
  cohortId: string;
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
          <div key={s.label} className="ca-card ca-card-hoverable relative overflow-hidden p-5">
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
          <Input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por nombre o email…"
            aria-label="Buscar participante por nombre o email"
            className="pl-10 pr-4 text-[13px] font-medium"
          />
        </div>
      </div>

      <div className="ca-card ca-card-hoverable divide-y divide-ca-ink/[0.08] overflow-hidden">
        <RoleSection
          role="teacher"
          members={filteredTeachers}
          onRowClick={onRowClick}
          cohortId={cohortId}
        />
        <RoleSection
          role="assistant"
          members={filteredAssistants}
          onRowClick={onRowClick}
          cohortId={cohortId}
        />
        <RoleSection
          role="student"
          members={filteredStudents}
          onRowClick={onRowClick}
          cohortId={cohortId}
        />
      </div>
    </div>
  );
}

function RoleSection({
  role,
  members,
  onRowClick,
  cohortId,
}: {
  role: CohortRole;
  members: CohortMember[];
  onRowClick: (userId: string) => void;
  cohortId: string;
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
          <div
            key={m.user_id}
            className="flex w-full items-center gap-4 px-6 py-3.5 transition-colors hover:bg-ca-bg-soft/50"
          >
            <button
              type="button"
              onClick={() => onRowClick(m.user_id)}
              className="flex min-w-0 flex-1 items-center gap-4 text-left"
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
            </button>
            {role === "student" && (
              <SegmentToggle
                cohortId={cohortId}
                studentId={m.user_id}
                initialSegment={m.segment}
              />
            )}
            <div className="hidden text-[11px] font-medium text-ca-ink-soft sm:block">
              {formatDate(m.granted_at)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoTab({
  cohort,
  program,
  members,
  onOpenAssignParticipant,
}: {
  cohort: CohortInfo;
  program: ProgramInfo;
  members: Members;
  onOpenAssignParticipant: () => void;
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

  const actions: { label: string; icon: React.ComponentType<{ size?: number }>; description: string; href?: string; onClick?: () => void }[] = [
    {
      label: "Gestionar calendario",
      icon: CalendarIcon,
      description: "Crea, edita y reprograma las clases de la cohorte",
      href: `/admin/cohorts/${cohort.id}/sesiones`,
    },
    {
      label: "Agregar participante",
      icon: PlusIcon,
      description: "Asigna un profesor, ayudante o alumno",
      onClick: onOpenAssignParticipant,
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
      <div className="ca-card ca-card-hoverable p-6">
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

      <div className="ca-card ca-card-hoverable p-6">
        <h3 className="mb-4 text-[16px] font-black text-ca-ink">
          Acciones rápidas
        </h3>
        <div className="flex flex-col gap-3">
          {actions.map((action) => {
            const inner = (
              <>
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
              </>
            );
            if (action.href) {
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-4 rounded-xl border border-ca-ink/[0.08] p-4 text-left transition-colors hover:border-ca-violet/40 hover:bg-ca-bg-soft"
                >
                  {inner}
                </Link>
              );
            }
            if (action.onClick) {
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="flex items-center gap-4 rounded-xl border border-ca-ink/[0.08] p-4 text-left transition-colors hover:border-ca-violet/40 hover:bg-ca-bg-soft"
                >
                  {inner}
                </button>
              );
            }
            return (
              <button
                key={action.label}
                disabled
                title="Próximamente"
                className="flex items-center gap-4 rounded-xl border border-ca-ink/[0.08] p-4 text-left opacity-50 cursor-not-allowed"
              >
                {inner}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProgresoTab() {
  const router = useRouter();

  return (
    <div className="ca-card ca-card-hoverable flex flex-col items-center justify-center p-12 text-center">
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
      <Button
        onClick={() => router.push("/admin/progress")}
        className="!h-auto mt-6 px-6 py-2.5 text-[13px]"
      >
        Ir a Progreso cohorte
      </Button>
    </div>
  );
}
