"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AdminUserListItem, CohortPickerItem } from "@/lib/admin/user-queries";
import {
  PlatformBadge,
  CohortBadgeStack,
  FilterPill,
} from "@/components/admin/user-primitives";
import type { CohortBadge } from "@/components/admin/user-primitives";
import { UserDrawer } from "@/components/admin/user-drawer";
import { AssignCohortModal } from "@/components/admin/assign-cohort-modal";
import { DeactivateModal } from "@/components/admin/deactivate-modal";
import { Avatar } from "@/components/classroom/primitives";

type Filter = "all" | "admin" | "ops" | "teacher" | "student";

type UsersListClientProps = {
  users: AdminUserListItem[];
  cohorts: CohortPickerItem[];
};

function SearchIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
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

function DotsIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div
        className="shape-circle mb-4 grid h-16 w-16 place-items-center"
        style={{ background: "rgba(94,23,235,0.08)" }}
      >
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--color-ca-violet)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </svg>
      </div>
      <p className="text-[15px] font-bold text-ca-ink">Sin resultados</p>
      <p className="mt-1 text-[13px] text-ca-ink-soft">
        No se encontraron usuarios con los filtros aplicados
      </p>
    </div>
  );
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

function formatLastAccess(dateStr: string | null): string {
  if (!dateStr) return "Sin acceso";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffHrs}h`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function matchesFilter(user: AdminUserListItem, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "admin") return user.system_role === "admin";
  if (filter === "ops") return user.system_role === "ops";
  if (filter === "teacher") return user.cohort_roles.some((cr) => cr.role === "teacher");
  if (filter === "student") return user.cohort_roles.some((cr) => cr.role === "student");
  return true;
}

function countByFilter(users: AdminUserListItem[], filter: Filter): number {
  return users.filter((u) => matchesFilter(u, filter)).length;
}

export function UsersListClient({ users, cohorts }: UsersListClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [drawerUser, setDrawerUser] = useState<{
    id: string;
    full_name: string;
    email: string;
    phone: string;
    role: "user" | "ops" | "admin";
  } | null>(null);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignUser, setAssignUser] = useState<{
    id: string;
    full_name: string;
    existing_assignments?: Array<{ cohort_id: string; role: "student" | "teacher" | "assistant" }>;
  } | null>(null);

  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [deactivateUser, setDeactivateUser] = useState<{
    id: string;
    full_name: string;
    email: string;
    initials: string;
    active_cohorts_count: number;
  } | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [openMenuId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      if (!matchesFilter(u, activeFilter)) return false;
      if (!q) return true;
      const name = (u.full_name ?? "").toLowerCase();
      const email = u.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [users, search, activeFilter]);

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "Todos" },
    { key: "admin", label: "Admin" },
    { key: "ops", label: "Ops" },
    { key: "teacher", label: "Profesores" },
    { key: "student", label: "Alumnos" },
  ];

  function handleOpenCreate() {
    setDrawerMode("create");
    setDrawerUser(null);
    setDrawerOpen(true);
  }

  function handleOpenEdit(u: AdminUserListItem) {
    setDrawerMode("edit");
    setDrawerUser({
      id: u.id,
      full_name: u.full_name ?? "",
      email: u.email,
      phone: u.phone ?? "",
      role: u.system_role,
    });
    setDrawerOpen(true);
    setOpenMenuId(null);
  }

  function handleOpenAssign(u: AdminUserListItem) {
    setAssignUser({
      id: u.id,
      full_name: u.full_name ?? u.email,
      existing_assignments: u.cohort_roles.map((cr) => ({
        cohort_id: cr.cohort_id,
        role: cr.role,
      })),
    });
    setAssignModalOpen(true);
    setOpenMenuId(null);
  }

  function handleOpenDeactivate(u: AdminUserListItem) {
    setDeactivateUser({
      id: u.id,
      full_name: u.full_name ?? u.email,
      email: u.email,
      initials: getInitials(u.full_name, u.email),
      active_cohorts_count: u.cohort_roles.length,
    });
    setDeactivateModalOpen(true);
    setOpenMenuId(null);
  }

  function handleRowClick(userId: string) {
    router.push(`/admin/users/${userId}`);
  }

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
            Operaciones
          </div>
          <h1 className="mt-1 flex items-center gap-3 text-[34px] font-black tracking-[-0.025em] text-ca-ink">
            Usuarios
            <span
              className="inline-flex items-center rounded-full px-3 py-0.5 text-[13px] font-bold"
              style={{ background: "rgba(94,23,235,0.10)", color: "var(--color-ca-violet)" }}
            >
              {users.length}
            </span>
          </h1>
        </div>
        <button
          onClick={handleOpenCreate}
          className="ca-btn-primary flex items-center gap-2 px-5 py-2.5 text-[13px] font-bold"
        >
          <PlusIcon />
          Nuevo usuario
        </button>
      </div>

      <div className="ca-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-ca-ink/[0.08] px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-sm flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2">
              <SearchIcon />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o email..."
              className="w-full rounded-xl border border-ca-ink/[0.14] bg-white py-2.5 pl-10 pr-4 text-[13px] font-medium text-ca-ink outline-none transition-colors focus:border-ca-violet"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {filters.map((f) => (
              <FilterPill
                key={f.key}
                label={f.label}
                count={countByFilter(users, f.key)}
                active={activeFilter === f.key}
                onClick={() => setActiveFilter(f.key)}
              />
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-ca-ink/[0.08]">
                    <th className="px-5 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                      Usuario
                    </th>
                    <th className="px-5 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                      Rol plataforma
                    </th>
                    <th className="px-5 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                      Cohortes activas
                    </th>
                    <th className="px-5 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                      Ultimo acceso
                    </th>
                    <th className="w-12 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const initials = getInitials(u.full_name, u.email);
                    const cohortBadges: CohortBadge[] = u.cohort_roles.map((cr) => ({
                      name: cr.cohort_name,
                      role: cr.role,
                    }));

                    return (
                      <tr
                        key={u.id}
                        onClick={() => handleRowClick(u.id)}
                        className="group cursor-pointer border-b border-ca-ink/[0.04] transition-colors hover:bg-ca-bg-soft/60"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar initials={initials} size={36} />
                            <div className="min-w-0">
                              <div className="truncate text-[14px] font-bold text-ca-ink">
                                {u.full_name ?? "Sin nombre"}
                              </div>
                              <div className="truncate font-mono text-[11px] text-ca-ink-soft">
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <PlatformBadge role={u.system_role} />
                        </td>
                        <td className="px-5 py-3.5">
                          {cohortBadges.length > 0 ? (
                            <CohortBadgeStack cohorts={cohortBadges} />
                          ) : (
                            <span className="text-[12px] text-ca-ink-soft">Sin cohortes</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-[12px] font-semibold text-ca-ink-soft">
                            {formatLastAccess(u.last_sign_in_at)}
                          </span>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="relative" ref={openMenuId === u.id ? menuRef : undefined}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === u.id ? null : u.id);
                              }}
                              className="grid h-8 w-8 place-items-center rounded-full text-ca-ink-soft opacity-0 transition-all hover:bg-ca-bg-soft group-hover:opacity-100"
                            >
                              <DotsIcon />
                            </button>

                            {openMenuId === u.id && (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-ca-ink/[0.08] bg-white py-1 shadow-lg"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => {
                                    handleRowClick(u.id);
                                    setOpenMenuId(null);
                                  }}
                                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-ca-ink transition-colors hover:bg-ca-bg-soft"
                                >
                                  Ver perfil
                                </button>
                                <button
                                  onClick={() => handleOpenEdit(u)}
                                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-ca-ink transition-colors hover:bg-ca-bg-soft"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleOpenAssign(u)}
                                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-ca-ink transition-colors hover:bg-ca-bg-soft"
                                >
                                  Asignar a cohorte
                                </button>
                                <div className="my-1 border-t border-ca-ink/[0.06]" />
                                <button
                                  onClick={() => handleOpenDeactivate(u)}
                                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-50"
                                >
                                  Desactivar
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-ca-ink/[0.08] px-5 py-3.5">
              <span className="text-[12px] font-semibold text-ca-ink-soft">
                Mostrando {filtered.length} de {users.length} usuarios
              </span>
            </div>
          </>
        )}
      </div>

      <UserDrawer
        open={drawerOpen}
        mode={drawerMode}
        user={drawerUser}
        onClose={() => setDrawerOpen(false)}
        onSave={async () => {
          setDrawerOpen(false);
          router.refresh();
        }}
      />

      <AssignCohortModal
        open={assignModalOpen}
        user={assignUser}
        cohorts={cohorts.map((c) => ({
          id: c.id,
          name: c.name,
          program_name: c.program_name,
          status: c.status,
        }))}
        onClose={() => setAssignModalOpen(false)}
        onAssign={async () => {
          setAssignModalOpen(false);
          router.refresh();
        }}
      />

      <DeactivateModal
        open={deactivateModalOpen}
        user={deactivateUser}
        onClose={() => setDeactivateModalOpen(false)}
        onConfirm={async () => {
          setDeactivateModalOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
