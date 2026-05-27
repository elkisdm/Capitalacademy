"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { AdminUserProfile, CohortPickerItem } from "@/lib/admin/user-queries";
import { PlatformBadge, CohortRoleBadge, StateBadge } from "@/components/admin/user-primitives";
import type { CohortRole } from "@/components/admin/user-primitives";
import { UserDrawer } from "@/components/admin/user-drawer";
import { AssignCohortModal } from "@/components/admin/assign-cohort-modal";
import { DeactivateModal } from "@/components/admin/deactivate-modal";
import { BrandShapes } from "@/components/classroom/primitives";

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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Sin actividad";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Hace un momento";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Hace ${days}d`;
  return formatDate(iso);
}

function ArrowLeftIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 7L2 7" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" />
    </svg>
  );
}

function TeacherIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3l4 4-4 4" />
      <path d="M20 7H4" />
      <path d="M8 21l-4-4 4-4" />
      <path d="M4 17h16" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

type UserProfileClientProps = {
  user: AdminUserProfile;
  cohorts: CohortPickerItem[];
};

type ActionsMenuPosition = {
  top?: number;
  bottom?: number;
  left: number;
};

const ACTIONS_MENU_HEIGHT_ESTIMATE = 170;

export function UserProfileClient({ user, cohorts }: UserProfileClientProps) {
  const router = useRouter();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const actionsBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<ActionsMenuPosition | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (actionsOpen && actionsBtnRef.current) {
      const rect = actionsBtnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuWidth = 224;

      if (spaceBelow >= ACTIONS_MENU_HEIGHT_ESTIMATE) {
        setMenuPos({ top: rect.bottom + 8, left: rect.right - menuWidth });
      } else {
        setMenuPos({ bottom: window.innerHeight - rect.top + 8, left: rect.right - menuWidth });
      }
    }
  }, [actionsOpen]);

  const initials = getInitials(user.full_name, user.email);
  const displayName = user.full_name || user.email;

  const activeCohorts = user.cohort_roles.length;
  const studentCount = user.cohort_roles.filter((r) => r.role === "student").length;
  const teacherCount = user.cohort_roles.filter((r) => r.role === "teacher").length;

  const handleEditSave = () => {
    setDrawerOpen(false);
    router.refresh();
  };

  const handleAssign = async (data: {
    userId: string;
    cohortId: string;
    role: CohortRole;
    moduleId?: string;
  }) => {
    const res = await fetch("/api/admin/cohort-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: data.userId,
        cohort_id: data.cohortId,
        role: data.role,
      }),
    });
    if (res.ok) {
      setAssignModalOpen(false);
      router.refresh();
    }
  };

  const handleRemoveRole = async (cohortId: string, role: CohortRole) => {
    const res = await fetch(
      `/api/admin/cohort-roles?id=${encodeURIComponent(cohortId)}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      router.refresh();
    }
  };

  return (
    <>
      <button
        onClick={() => router.push("/admin/users")}
        className="mb-6 inline-flex items-center gap-2 text-[13px] font-bold text-ca-ink-soft transition-colors hover:text-ca-ink"
      >
        <ArrowLeftIcon />
        Volver a usuarios
      </button>

      <div className="ca-card relative mb-6 overflow-hidden p-6 md:p-8">
        <BrandShapes variant="corner-violet" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-5">
            <div
              className="shape-circle grid shrink-0 place-items-center font-black text-white"
              style={{
                width: 80,
                height: 80,
                fontSize: 28,
                background: "var(--color-ca-violet)",
              }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-[24px] font-black tracking-[-0.025em] text-ca-ink md:text-[28px]">
                  {displayName}
                </h1>
                <PlatformBadge role={user.system_role} />
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[13px] font-medium text-ca-ink-soft">
                  <MailIcon />
                  {user.email}
                </div>
                {user.phone && (
                  <div className="flex items-center gap-2 text-[13px] font-medium text-ca-ink-soft">
                    <PhoneIcon />
                    {user.phone}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-4 text-[12px] font-semibold text-ca-ink-soft">
                  <span className="flex items-center gap-1.5">
                    <CalendarIcon />
                    Miembro desde {formatDate(user.created_at)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ClockIcon />
                    {user.last_sign_in_at
                      ? `Último acceso ${timeAgo(user.last_sign_in_at)}`
                      : "Sin acceso registrado"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-ca-ink/[0.14] px-4 py-2.5 text-[13px] font-bold text-ca-ink transition-colors hover:bg-ca-bg-soft"
            >
              <PencilIcon />
              Editar perfil
            </button>
            <div className="relative">
              <button
                ref={actionsBtnRef}
                onClick={() => setActionsOpen(!actionsOpen)}
                className="grid h-10 w-10 place-items-center rounded-full border border-ca-ink/[0.14] transition-colors hover:bg-ca-bg-soft"
              >
                <DotsIcon />
              </button>
              {actionsOpen && mounted && menuPos && createPortal(
                <>
                  {/* Invisible backdrop */}
                  <div
                    className="fixed inset-0 z-[54]"
                    onClick={() => setActionsOpen(false)}
                  />
                  {/* Menu */}
                  <div
                    className="fixed z-[55] w-56 overflow-hidden rounded-xl border border-ca-ink/[0.08] bg-white shadow-lg"
                    style={{
                      top: menuPos.top != null ? menuPos.top : undefined,
                      bottom: menuPos.bottom != null ? menuPos.bottom : undefined,
                      left: menuPos.left,
                    }}
                  >
                    <button
                      onClick={() => {
                        setActionsOpen(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] font-semibold text-ca-ink transition-colors hover:bg-ca-bg-soft"
                    >
                      <MailIcon />
                      Reenviar email de acceso
                    </button>
                    <button
                      onClick={() => {
                        setActionsOpen(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] font-semibold text-ca-ink transition-colors hover:bg-ca-bg-soft"
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                      Resetear contraseña
                    </button>
                    <div className="border-t border-ca-ink/[0.08]" />
                    <button
                      onClick={() => {
                        setActionsOpen(false);
                        setDeactivateOpen(true);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-50"
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M15 9l-6 6M9 9l6 6" />
                      </svg>
                      Desactivar usuario
                    </button>
                  </div>
                </>,
                document.body,
              )}
            </div>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            {
              label: "Cohortes activas",
              value: String(activeCohorts),
              tone: "var(--color-ca-violet)",
            },
            {
              label: "Como alumno",
              value: String(studentCount),
              tone: "var(--color-ca-lime-deep)",
            },
            {
              label: "Como profesor",
              value: String(teacherCount),
              tone: "var(--color-ca-navy, #14163a)",
            },
            {
              label: "Tiempo en plataforma",
              value: user.last_sign_in_at ? timeAgo(user.created_at) : "—",
              tone: "var(--color-ca-ink-soft)",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="ca-card relative overflow-hidden p-4"
            >
              <div
                className="shape-circle absolute -right-3 -top-3 h-12 w-12 opacity-[0.08]"
                style={{ background: s.tone }}
              />
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                {s.label}
              </div>
              <div
                className="mt-1 font-mono text-[24px] font-black tracking-tight"
                style={{ color: s.tone }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[18px] font-black tracking-tight text-ca-ink">
              Participación en cohortes
            </h2>
            <button
              onClick={() => setAssignModalOpen(true)}
              className="ca-btn-primary inline-flex items-center gap-2 px-4 py-2 text-[12px] font-bold"
            >
              <PlusIcon />
              Asignar a cohorte
            </button>
          </div>

          {user.cohort_roles.length === 0 ? (
            <div className="ca-card flex flex-col items-center justify-center px-6 py-12 text-center">
              <div
                className="mb-4 grid h-14 w-14 place-items-center rounded-full text-ca-ink-soft"
                style={{ background: "rgba(20,22,58,0.06)" }}
              >
                <UsersIcon />
              </div>
              <p className="text-[14px] font-bold text-ca-ink">
                Sin cohortes asignadas
              </p>
              <p className="mt-1 text-[12px] text-ca-ink-soft">
                Este usuario no participa en ninguna cohorte actualmente.
              </p>
              <button
                onClick={() => setAssignModalOpen(true)}
                className="ca-btn-primary mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-[12px] font-bold"
              >
                <PlusIcon />
                Asignar a cohorte
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {user.cohort_roles.map((cr) => (
                <div
                  key={`${cr.cohort_id}-${cr.role}`}
                  className="ca-card ca-card-hoverable group relative cursor-pointer overflow-hidden px-5 py-4 transition-all"
                  onClick={() =>
                    router.push(`/admin/cohorts/${cr.cohort_id}`)
                  }
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                      style={{
                        background:
                          cr.role === "teacher"
                            ? "rgba(94,23,235,0.10)"
                            : cr.role === "assistant"
                              ? "rgba(20,22,58,0.08)"
                              : "rgba(168,211,16,0.15)",
                        color:
                          cr.role === "teacher"
                            ? "var(--color-ca-violet)"
                            : cr.role === "assistant"
                              ? "var(--color-ca-navy, #14163a)"
                              : "#3f5a05",
                      }}
                    >
                      {cr.role === "teacher" || cr.role === "assistant" ? (
                        <TeacherIcon />
                      ) : (
                        <BookIcon />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-ca-ink">
                          {cr.cohort_name}
                        </span>
                        <span className="font-mono text-[11px] text-ca-ink-soft">
                          {cr.cohort_code}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CohortRoleBadge role={cr.role} />
                      <StateBadge state="active" />
                    </div>
                  </div>

                  <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className="grid h-8 w-8 place-items-center rounded-lg text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink"
                      title="Cambiar rol"
                    >
                      <SwapIcon />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveRole(cr.cohort_id, cr.role);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-lg text-ca-ink-soft transition-colors hover:bg-red-50 hover:text-red-600"
                      title="Remover"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-4 text-[18px] font-black tracking-tight text-ca-ink">
            Actividad reciente
          </h2>
          {user.recent_activity.length === 0 ? (
            <div className="ca-card px-5 py-8 text-center">
              <p className="text-[13px] font-semibold text-ca-ink-soft">
                Sin actividad registrada
              </p>
            </div>
          ) : (
            <div className="ca-card overflow-hidden px-5 py-5">
              <div className="relative">
                <div
                  className="absolute bottom-0 left-[15px] top-0 w-px"
                  style={{ background: "rgba(20,22,58,0.10)" }}
                />
                <div className="flex flex-col gap-5">
                  {user.recent_activity.map((a, i) => (
                    <div key={`${a.lesson_id}-${i}`} className="relative flex gap-4 pl-0">
                      <div className="relative z-10 shrink-0">
                        <div
                          className="grid h-[30px] w-[30px] place-items-center rounded-full"
                          style={{
                            background: a.completed
                              ? "rgba(168,211,16,0.20)"
                              : "rgba(94,23,235,0.10)",
                            color: a.completed
                              ? "#3f5a05"
                              : "var(--color-ca-violet)",
                          }}
                        >
                          {a.completed ? <CheckCircleIcon /> : <PlayIcon />}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 pt-1">
                        <p className="text-[13px] font-bold leading-snug text-ca-ink">
                          {a.completed
                            ? "Completó lección"
                            : `Vio ${Math.round(a.watch_percentage)}%`}
                        </p>
                        <p className="mt-0.5 text-[12px] font-medium text-ca-ink-soft">
                          {a.lesson_title}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-ca-ink-soft/60">
                          {timeAgo(a.last_watched_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 border-t border-ca-ink/[0.08] pt-4 text-center">
                <button className="text-[12px] font-bold text-ca-violet transition-colors hover:text-ca-violet-deep">
                  Ver historial completo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <UserDrawer
        open={drawerOpen}
        mode="edit"
        user={{
          id: user.id,
          full_name: user.full_name ?? "",
          email: user.email,
          phone: user.phone ?? "",
          role: user.system_role,
        }}
        onClose={() => setDrawerOpen(false)}
        onSave={handleEditSave}
      />

      <AssignCohortModal
        open={assignModalOpen}
        user={{
          id: user.id,
          full_name: user.full_name ?? user.email,
          existing_assignments: user.cohort_roles.map((cr) => ({
            cohort_id: cr.cohort_id,
            role: cr.role,
          })),
        }}
        cohorts={cohorts.map((c) => ({
          id: c.id,
          name: c.name,
          program_name: c.program_name,
          status: c.status,
        }))}
        onClose={() => setAssignModalOpen(false)}
        onAssign={handleAssign}
      />

      <DeactivateModal
        open={deactivateOpen}
        user={{
          id: user.id,
          full_name: user.full_name ?? user.email,
          email: user.email,
          initials,
          active_cohorts_count: user.cohort_roles.length,
        }}
        onClose={() => setDeactivateOpen(false)}
        onConfirm={async () => {
          setDeactivateOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
