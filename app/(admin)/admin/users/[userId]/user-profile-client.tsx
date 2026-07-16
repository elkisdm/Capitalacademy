"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminUserProfile, CohortPickerItem } from "@/lib/admin/user-queries";
import { PlatformBadge, CohortRoleBadge, StateBadge } from "@/components/admin/user-primitives";
import type { CohortRole } from "@/components/admin/user-primitives";
import { UserDrawer } from "@/components/admin/user-drawer";
import { AssignCohortModal } from "@/components/admin/assign-cohort-modal";
import { DeactivateModal } from "@/components/admin/deactivate-modal";
import { BrandShapes } from "@/components/classroom/primitives";
import { useToast } from "@/components/admin/toast";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftIcon,
  PencilIcon,
  DotsIcon,
  MailIcon,
  PhoneIcon,
  CalendarIcon,
  ClockIcon,
  PlusIcon,
  BookIcon,
  TeacherIcon,
  PlayIcon,
  CheckCircleIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/admin/icons";

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
  const { toast, ToastContainer } = useToast();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sendingInvitation, setSendingInvitation] = useState(false);
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
    toast("Cambios guardados", "success");
    router.refresh();
  };

  const handleSendInvitation = async () => {
    setSendingInvitation(true);
    try {
      const res = await fetch("/api/admin/send-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        toast("Invitación enviada", "success");
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error ?? "Error al enviar invitación", "error");
      }
    } catch {
      toast("Error de conexión", "error");
    } finally {
      setSendingInvitation(false);
    }
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
      toast("Rol asignado", "success");
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast(err.error ?? "Error al asignar rol", "error");
    }
  };

  const handleRemoveRole = async (cohortId: string, role: CohortRole) => {
    const ok = window.confirm(
      "¿Quitar el rol de este usuario en la cohorte? Perderá el acceso asociado a ese rol.",
    );
    if (!ok) return;
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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => router.push("/admin/users")}
        className="mb-6 gap-2 text-ca-ink-soft hover:bg-transparent hover:text-ca-ink"
      >
        <ArrowLeftIcon />
        Volver a usuarios
      </Button>

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
                {user.onboarding_completed_at === null && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                    style={{ background: "rgba(217,119,6,0.12)", color: "#92400e" }}
                  >
                    <span
                      className="shape-circle h-1.5 w-1.5"
                      style={{ background: "#92400e" }}
                    />
                    Onboarding pendiente
                  </span>
                )}
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
            {user.onboarding_completed_at === null && (
              <Button
                type="button"
                variant="outline"
                onClick={handleSendInvitation}
                disabled={sendingInvitation}
                className="gap-2"
              >
                <MailIcon />
                {sendingInvitation ? "Enviando…" : "Reenviar invitación"}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setDrawerOpen(true)} className="gap-2">
              <PencilIcon />
              Editar perfil
            </Button>
            <div className="relative">
              <Button
                ref={actionsBtnRef}
                type="button"
                variant="outline"
                aria-label="Más acciones"
                aria-haspopup="menu"
                aria-expanded={actionsOpen}
                onClick={() => setActionsOpen(!actionsOpen)}
                className="h-10 w-10 p-0"
              >
                <DotsIcon />
              </Button>
              {actionsOpen && mounted && menuPos && createPortal(
                <>
                  {/* Invisible backdrop */}
                  <div
                    className="fixed inset-0 z-[54]"
                    onClick={() => setActionsOpen(false)}
                  />
                  {/* Menu */}
                  <div
                    className="ca-scale-in fixed z-[55] w-56 overflow-hidden rounded-xl border border-ca-ink/[0.08] bg-white shadow-lg"
                    style={{
                      top: menuPos.top != null ? menuPos.top : undefined,
                      bottom: menuPos.bottom != null ? menuPos.bottom : undefined,
                      left: menuPos.left,
                      transformOrigin: menuPos.top != null ? "top right" : "bottom right",
                    }}
                  >
                    <button
                      onClick={() => {
                        setActionsOpen(false);
                        handleSendInvitation();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] font-semibold text-ca-ink transition-colors hover:bg-ca-bg-soft"
                    >
                      <MailIcon />
                      Enviar invitación
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
            <Button type="button" variant="primary" size="sm" onClick={() => setAssignModalOpen(true)} className="gap-2">
              <PlusIcon />
              Asignar a cohorte
            </Button>
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
              <Button type="button" variant="primary" size="sm" onClick={() => setAssignModalOpen(true)} className="mt-5 gap-2">
                <PlusIcon />
                Asignar a cohorte
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {user.cohort_roles.map((cr) => (
                <div
                  key={`${cr.cohort_id}-${cr.role}`}
                  className="ca-card ca-card-hoverable group relative overflow-hidden transition-all"
                >
                  <Link
                    href={`/admin/cohorts/${cr.cohort_id}`}
                    className="block cursor-pointer px-5 py-4"
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
                      <div className="flex shrink-0 items-center gap-2">
                        <CohortRoleBadge role={cr.role} />
                        <StateBadge state="active" />
                      </div>
                    </div>
                  </Link>

                  <div className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveRole(cr.cohort_id, cr.role);
                      }}
                      aria-label={`Remover rol en ${cr.cohort_name}`}
                      className="relative h-8 w-8 rounded-lg p-0 hover:bg-red-50 hover:text-red-600"
                      title="Remover"
                    >
                      <TrashIcon />
                    </Button>
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

      <ToastContainer />
    </>
  );
}
