"use client";

import { useState, useMemo, useRef, useEffect, useCallback, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
import { CsvImportModal } from "@/components/admin/csv-import-modal";
import { Avatar } from "@/components/classroom/primitives";
import { useToast } from "@/components/admin/toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  SearchIcon,
  PlusIcon,
  UploadIcon,
  MailIcon,
  DotsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/admin/icons";

type Filter = "all" | "admin" | "ops" | "teacher" | "student";

type UsersListClientProps = {
  users: AdminUserListItem[];
  cohorts: CohortPickerItem[];
  /** Entorno activo (program_id) desde la cookie global, o "all". */
  initialProgramFilter?: string;
};

type MenuPosition = {
  top?: number;
  bottom?: number;
  left: number;
};

function UsersEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
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

const MENU_HEIGHT_ESTIMATE = 190;
const PAGE_SIZE = 10;

function KebabMenu({
  userId,
  isOpen,
  onToggle,
  onClose,
  onViewProfile,
  onEdit,
  onAssign,
  onSendInvitation,
  showInvitation,
  onDeactivate,
}: {
  userId: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onViewProfile: () => void;
  onEdit: () => void;
  onAssign: () => void;
  onSendInvitation?: () => void;
  showInvitation?: boolean;
  onDeactivate: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<MenuPosition | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuWidth = 208;

      if (spaceBelow >= MENU_HEIGHT_ESTIMATE) {
        setPos({ top: rect.bottom + 4, left: rect.right - menuWidth });
      } else {
        setPos({ bottom: window.innerHeight - rect.top + 4, left: rect.right - menuWidth });
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        btnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  return (
    <>
      <button
        ref={btnRef}
        aria-label="Más acciones"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="grid h-8 w-8 place-items-center rounded-full text-ca-ink-soft opacity-100 md:opacity-0 transition-all hover:bg-ca-bg-soft group-hover:opacity-100"
      >
        <DotsIcon />
      </button>

      {isOpen && mounted && pos && createPortal(
        <>
          {/* Invisible backdrop */}
          <div
            className="fixed inset-0 z-[54]"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />
          {/* Menu */}
          <div
            className="ca-scale-in fixed z-[55] w-52 overflow-hidden rounded-xl border border-ca-ink/[0.08] bg-white py-1 shadow-lg"
            style={{
              top: pos.top != null ? pos.top : undefined,
              bottom: pos.bottom != null ? pos.bottom : undefined,
              left: pos.left,
              transformOrigin: pos.top != null ? "top right" : "bottom right",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewProfile();
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-ca-ink transition-colors hover:bg-ca-bg-soft"
            >
              Ver perfil
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-ca-ink transition-colors hover:bg-ca-bg-soft"
            >
              Editar
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAssign();
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-ca-ink transition-colors hover:bg-ca-bg-soft"
            >
              Asignar a cohorte
            </button>
            {showInvitation && onSendInvitation && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSendInvitation();
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-ca-ink transition-colors hover:bg-ca-bg-soft"
              >
                <MailIcon />
                Enviar invitación
              </button>
            )}
            <div className="my-1 border-t border-ca-ink/[0.06]" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeactivate();
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-50"
            >
              Desactivar
            </button>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [];
  pages.push(1);
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

export function UsersListClient({ users, cohorts, initialProgramFilter = "all" }: UsersListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast, ToastContainer } = useToast();

  // Estado de búsqueda/filtros/paginación reflejado en la URL (?q=&rol=&estado=&page=)
  // para que sea compartible y respete el botón "atrás". Se deriva directamente
  // de los query params; el filtrado/paginación sigue siendo en cliente.
  const search = searchParams.get("q") ?? "";
  const rolParam = searchParams.get("rol");
  const activeFilter: Filter =
    rolParam === "admin" || rolParam === "ops" || rolParam === "teacher" || rolParam === "student"
      ? rolParam
      : "all";
  const estadoParam = searchParams.get("estado");
  const statusFilter: "all" | "active" | "pending" =
    estadoParam === "active" || estadoParam === "pending" ? estadoParam : "all";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  // El entorno se fija globalmente (cookie + remount por `key`), no se cambia
  // dentro de la lista; por eso solo leemos el valor inicial.
  const [programFilter] = useState<string>(initialProgramFilter);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      // `replace` (no `push`) para no llenar el historial con cada tecla/click.
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  // Al cambiar búsqueda/filtros se resetea `page` a 1 (se elimina el param).
  const setSearch = useCallback(
    (value: string) => updateParams({ q: value || null, page: null }),
    [updateParams],
  );
  const setActiveFilter = useCallback(
    (key: Filter) => updateParams({ rol: key === "all" ? null : key, page: null }),
    [updateParams],
  );
  const setStatusFilter = useCallback(
    (value: "all" | "active" | "pending") =>
      updateParams({ estado: value === "all" ? null : value, page: null }),
    [updateParams],
  );
  const setPage = useCallback(
    (n: number) => updateParams({ page: n <= 1 ? null : String(n) }),
    [updateParams],
  );

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

  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [sendingInvitationId, setSendingInvitationId] = useState<string | null>(null);

  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [deactivateUser, setDeactivateUser] = useState<{
    id: string;
    full_name: string;
    email: string;
    initials: string;
    active_cohorts_count: number;
  } | null>(null);

  const searchFiltered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter((u) => {
      const name = (u.full_name ?? "").toLowerCase();
      const email = u.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [users, search]);

  // Base para los contadores de los pills de rol: aplica búsqueda + entorno +
  // estado, pero NO el rol — así cada pill muestra su conteo DENTRO del scope
  // elegido (filtros facetados). El filtro de rol se aplica encima en `filtered`.
  const scopedForCounts = useMemo(() => {
    return searchFiltered.filter((u) => {
      if (programFilter !== "all" && !u.cohort_roles.some((cr) => cr.program_id === programFilter)) {
        return false;
      }
      if (statusFilter === "active" && u.onboarding_completed_at === null) return false;
      if (statusFilter === "pending" && u.onboarding_completed_at !== null) return false;
      return true;
    });
  }, [searchFiltered, programFilter, statusFilter]);

  const filtered = useMemo(() => {
    return scopedForCounts.filter((u) => matchesFilter(u, activeFilter));
  }, [scopedForCounts, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedStart = (safePage - 1) * PAGE_SIZE;
  const paginatedEnd = Math.min(safePage * PAGE_SIZE, filtered.length);
  const paginated = filtered.slice(paginatedStart, paginatedEnd);

  const hasActiveSearchOrFilter =
    search.trim() !== "" || activeFilter !== "all" || programFilter !== "all" || statusFilter !== "all";

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "Todos" },
    { key: "admin", label: "Admin" },
    { key: "ops", label: "Ops" },
    { key: "teacher", label: "Profesores" },
    { key: "student", label: "Alumnos" },
  ];

  const filterCounts = useMemo(() => {
    const counts: Record<Filter, number> = { all: 0, admin: 0, ops: 0, teacher: 0, student: 0 };
    for (const u of scopedForCounts) {
      counts.all++;
      if (u.system_role === "admin") counts.admin++;
      if (u.system_role === "ops") counts.ops++;
      if (u.cohort_roles.some((cr) => cr.role === "teacher")) counts.teacher++;
      if (u.cohort_roles.some((cr) => cr.role === "student")) counts.student++;
    }
    return counts;
  }, [scopedForCounts]);

  const closeAll = useCallback(() => {
    setDrawerOpen(false);
    setAssignModalOpen(false);
    setDeactivateModalOpen(false);
    setCsvImportOpen(false);
    setOpenMenuId(null);
  }, []);

  async function handleSendInvitation(userId: string) {
    setSendingInvitationId(userId);
    setOpenMenuId(null);
    try {
      const res = await fetch("/api/admin/send-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
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
      setSendingInvitationId(null);
    }
  }

  function handleOpenCreate() {
    closeAll();
    setDrawerMode("create");
    setDrawerUser(null);
    setDrawerOpen(true);
  }

  function handleOpenEdit(u: AdminUserListItem) {
    closeAll();
    setDrawerMode("edit");
    setDrawerUser({
      id: u.id,
      full_name: u.full_name ?? "",
      email: u.email,
      phone: u.phone ?? "",
      role: u.system_role,
    });
    setDrawerOpen(true);
  }

  function handleOpenAssign(u: AdminUserListItem) {
    closeAll();
    setAssignUser({
      id: u.id,
      full_name: u.full_name ?? u.email,
      existing_assignments: u.cohort_roles.map((cr) => ({
        cohort_id: cr.cohort_id,
        role: cr.role,
      })),
    });
    setAssignModalOpen(true);
  }

  function handleOpenDeactivate(u: AdminUserListItem) {
    closeAll();
    setDeactivateUser({
      id: u.id,
      full_name: u.full_name ?? u.email,
      email: u.email,
      initials: getInitials(u.full_name, u.email),
      active_cohorts_count: u.cohort_roles.length,
    });
    setDeactivateModalOpen(true);
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
              {hasActiveSearchOrFilter ? filtered.length : users.length}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => setCsvImportOpen(true)}>
            <UploadIcon />
            Importar CSV
          </Button>
          <Button type="button" variant="primary" onClick={handleOpenCreate}>
            <PlusIcon />
            Nuevo usuario
          </Button>
        </div>
      </div>

      <div className="ca-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-ca-ink/[0.08] px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative max-w-sm flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50">
                <SearchIcon />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o email…"
                aria-label="Buscar por nombre o email"
                autoComplete="off"
                name="ca-user-search"
                data-form-type="other"
                className="w-full rounded-xl border border-ca-ink/[0.14] bg-white py-2.5 pl-10 pr-4 text-[13px] font-medium text-ca-ink outline-none transition-colors focus:border-ca-violet"
              />
            </div>

            {/* Filtro por estado. El entorno se controla con el selector global
                del sidebar (cookie), no aquí, para no duplicar controles. */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "pending")}
                aria-label="Filtrar por estado"
                className="rounded-xl border border-ca-ink/[0.14] bg-white px-3 py-2.5 text-[13px] font-semibold text-ca-ink outline-none transition-colors focus:border-ca-violet"
              >
                <option value="all">Todos los estados</option>
                <option value="active">Activos</option>
                <option value="pending">Pendientes</option>
              </select>
            </div>
          </div>

          {/* Filtros por rol */}
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((f) => (
              <FilterPill
                key={f.key}
                label={f.label}
                count={filterCounts[f.key]}
                active={activeFilter === f.key}
                onClick={() => setActiveFilter(f.key)}
              />
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={UsersEmptyIcon}
            title="Sin resultados"
            description="No se encontraron usuarios con los filtros aplicados"
            className="border-0 shadow-none"
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
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
                      Último acceso
                    </th>
                    <th className="w-12 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((u, i) => {
                    const initials = getInitials(u.full_name, u.email);
                    const cohortBadges: CohortBadge[] = u.cohort_roles.map((cr) => ({
                      name: cr.cohort_name,
                      role: cr.role,
                    }));

                    return (
                      <tr
                        key={u.id}
                        onClick={() => handleRowClick(u.id)}
                        className="ca-fade-up ca-stagger group cursor-pointer border-b border-ca-ink/[0.04] transition-colors hover:bg-ca-bg-soft/60"
                        style={{ "--i": i } as CSSProperties}
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
                          <div className="flex items-center gap-2">
                            <PlatformBadge role={u.system_role} />
                            {u.onboarding_completed_at === null && (
                              <Badge tone="amber" size="sm">Pendiente</Badge>
                            )}
                          </div>
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
                          <KebabMenu
                            userId={u.id}
                            isOpen={openMenuId === u.id}
                            onToggle={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                            onClose={() => setOpenMenuId(null)}
                            onViewProfile={() => {
                              setOpenMenuId(null);
                              handleRowClick(u.id);
                            }}
                            onEdit={() => handleOpenEdit(u)}
                            onAssign={() => handleOpenAssign(u)}
                            showInvitation={u.onboarding_completed_at === null}
                            onSendInvitation={() => handleSendInvitation(u.id)}
                            onDeactivate={() => handleOpenDeactivate(u)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden flex flex-col gap-3 px-4 py-4">
              {paginated.map((u, i) => {
                const initials = getInitials(u.full_name, u.email);
                const cohortBadges: CohortBadge[] = u.cohort_roles.map((cr) => ({
                  name: cr.cohort_name,
                  role: cr.role,
                }));

                return (
                  <div
                    key={u.id}
                    onClick={() => handleRowClick(u.id)}
                    className="ca-fade-up ca-stagger ca-card group relative cursor-pointer p-4 transition-colors hover:bg-ca-bg-soft/60"
                    style={{ "--i": i } as CSSProperties}
                  >
                    <div className="absolute right-3 top-3">
                      <KebabMenu
                        userId={u.id}
                        isOpen={openMenuId === u.id}
                        onToggle={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                        onClose={() => setOpenMenuId(null)}
                        onViewProfile={() => {
                          setOpenMenuId(null);
                          handleRowClick(u.id);
                        }}
                        onEdit={() => handleOpenEdit(u)}
                        onAssign={() => handleOpenAssign(u)}
                        showInvitation={u.onboarding_completed_at === null}
                        onSendInvitation={() => handleSendInvitation(u.id)}
                        onDeactivate={() => handleOpenDeactivate(u)}
                      />
                    </div>

                    <div className="flex items-center gap-3 pr-8">
                      <Avatar initials={initials} size={36} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-bold text-ca-ink">
                            {u.full_name ?? "Sin nombre"}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <PlatformBadge role={u.system_role} />
                          {u.onboarding_completed_at === null && (
                            <Badge tone="amber" size="sm">Pendiente</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 truncate font-mono text-[11px] text-ca-ink-soft pl-[48px]">
                      {u.email}
                    </div>

                    <div className="mt-2 pl-[48px]">
                      {cohortBadges.length > 0 ? (
                        <CohortBadgeStack cohorts={cohortBadges} />
                      ) : (
                        <span className="text-[12px] text-ca-ink-soft">Sin cohortes</span>
                      )}
                    </div>

                    <div className="mt-2 pl-[48px] text-[11px] font-semibold text-ca-ink-soft">
                      Último acceso: {formatLastAccess(u.last_sign_in_at)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ca-ink/[0.08] px-5 py-3.5">
              <span className="text-[12px] font-semibold text-ca-ink-soft">
                Mostrando {paginatedStart + 1}-{paginatedEnd} de {filtered.length} usuarios
              </span>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(Math.max(1, safePage - 1))}
                    disabled={safePage <= 1}
                    aria-label="Página anterior"
                    className="grid h-8 w-8 place-items-center rounded-lg text-ca-ink-soft transition-colors hover:bg-ca-bg-soft disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ChevronLeftIcon />
                  </button>

                  {getPageNumbers(safePage, totalPages).map((n, i) =>
                    n === "..." ? (
                      <span key={`ellipsis-${i}`} className="px-1 text-[12px] text-ca-ink-soft">
                        ...
                      </span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setPage(n)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-[12px] font-bold transition-colors"
                        style={{
                          background: n === safePage ? "var(--color-ca-ink)" : "transparent",
                          color: n === safePage ? "#fff" : "var(--color-ca-ink-soft)",
                        }}
                      >
                        {n}
                      </button>
                    ),
                  )}

                  <button
                    onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                    disabled={safePage >= totalPages}
                    aria-label="Página siguiente"
                    className="grid h-8 w-8 place-items-center rounded-lg text-ca-ink-soft transition-colors hover:bg-ca-bg-soft disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ChevronRightIcon />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <UserDrawer
        open={drawerOpen}
        mode={drawerMode}
        user={drawerUser}
        cohorts={cohorts.map((c) => ({ id: c.id, name: c.name, program_name: c.program_name, status: c.status }))}
        onClose={() => setDrawerOpen(false)}
        onSave={() => {
          setDrawerOpen(false);
          toast(drawerMode === "create" ? "Usuario creado" : "Cambios guardados", "success");
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
        onAssign={async (data) => {
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
        }}
      />

      <DeactivateModal
        open={deactivateModalOpen}
        user={deactivateUser}
        onClose={() => setDeactivateModalOpen(false)}
        onConfirm={async () => {
          setDeactivateModalOpen(false);
          toast("Usuario desactivado", "success");
          router.refresh();
        }}
      />

      <CsvImportModal
        open={csvImportOpen}
        onClose={() => {
          setCsvImportOpen(false);
          router.refresh();
        }}
        cohorts={cohorts.map((c) => ({ id: c.id, name: c.name }))}
        existingEmails={users.map((u) => u.email)}
      />

      <ToastContainer />
    </>
  );
}
