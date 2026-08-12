"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFocusTrap } from "@/lib/utils/use-focus-trap";
import { Logo, Avatar } from "./primitives";
import { NotificationBell } from "./conversaciones/notification-bell";
import { EnvSwitcher, ViewModeToggle } from "@/components/admin/env-switcher";
import type { EnvOption, ViewMode } from "@/lib/admin/active-env";

function SidebarTooltip({ label, parentRef }: { label: string; parentRef: React.RefObject<HTMLElement | null> }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [visible, setVisible] = useState(false);

  const show = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top + rect.height / 2, left: rect.right + 12 });
    setVisible(true);
  }, [parentRef]);

  const hide = useCallback(() => setVisible(false), []);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    el.addEventListener("mouseenter", show);
    el.addEventListener("mouseleave", hide);
    return () => {
      el.removeEventListener("mouseenter", show);
      el.removeEventListener("mouseleave", hide);
    };
  }, [parentRef, show, hide]);

  if (!visible || !pos) return null;

  return (
    <div
      className="pointer-events-none fixed z-[100] whitespace-nowrap rounded-lg bg-ca-ink px-2.5 py-1.5 text-[11px] font-bold text-white shadow-lg"
      style={{ top: pos.top, left: pos.left, transform: "translateY(-50%)" }}
    >
      {label}
      <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-ca-ink" />
    </div>
  );
}

const ICON_PATHS: Record<string, React.ReactNode> = {
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  book: <><path d="M4 4h12a3 3 0 013 3v13H7a3 3 0 01-3-3V4z" /><path d="M4 17a3 3 0 013-3h12" /></>,
  filmLines: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></>,
  calculator: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8" /><path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v4" /></>,
  folder: <><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></>,
  upload: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></>,
  users: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>,
  chevronsLeft: <><path d="M11 17l-5-5 5-5" /><path d="M18 17l-5-5 5-5" /></>,
  chevronsRight: <><path d="M13 17l5-5-5-5" /><path d="M6 17l5-5-5-5" /></>,
  check: <path d="M5 13l4 4L19 7" />,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  bell: <><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></>,
  clipboardCheck: <><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><path d="M9 14l2 2 4-4" /></>,
  creditCard: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>,
  chat: <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></>,
  userCheck: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M16 11l2 2 4-4" /></>,
  award: <><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" /></>,
  megaphone: <><path d="M3 11v2a1 1 0 001 1h2l4 4V6L6 10H4a1 1 0 00-1 1z" /><path d="M15 8.5a4 4 0 010 7" /><path d="M18.5 5.5a8 8 0 010 13" /></>,
  poll: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M2 20h20" /></>,
  idCard: <><rect x="2" y="4" width="20" height="16" rx="2" /><circle cx="8.5" cy="10.5" r="2.5" /><path d="M4.5 17a4 4 0 018 0" /><path d="M15 9h5M15 13h5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};

function SvgIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name]}
    </svg>
  );
}

type NavSection = "learn" | "general" | "config";

type NavItem = {
  icon: string;
  label: string;
  href?: string;
  badge?: string;
  section: NavSection;
};

// Orden y etiquetas de las secciones del menú. El staff ve General + Configuración;
// el alumno solo Aprender.
const NAV_SECTIONS: { key: NavSection; label: string }[] = [
  { key: "learn", label: "Aprender" },
  { key: "general", label: "General" },
  { key: "config", label: "Configuración" },
];

// Ayuda es transversal: visible siempre (admin y alumno), por eso se renderiza
// como item fijo aparte de las secciones, no dentro de "Aprender".
const HELP_ITEM: NavItem = {
  icon: "help",
  label: "Ayuda",
  href: "/classroom/guia",
  section: "learn",
};

function NavItemButton({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const navRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (active) navRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const content = (
    <span
      ref={navRef}
      className={`relative flex w-full min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-[background,color,transform,box-shadow] duration-[150ms] ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.97] ${
        active ? "bg-ca-violet text-white" : "text-ca-ink hover:bg-ca-bg-soft hover:scale-[1.01]"
      }`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center">
        <SvgIcon name={item.icon} size={18} />
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-[13px] font-semibold tracking-tight transition-opacity duration-[160ms]" title={item.label}>{item.label}</span>
          {item.badge && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-opacity duration-[160ms] ${active ? "bg-ca-lime text-ca-ink" : "bg-ca-violet text-white"}`}>
              {item.badge}
            </span>
          )}
        </>
      )}
      {active && <span className="shape-circle absolute right-2 top-2 h-1.5 w-1.5 bg-ca-lime" />}
    </span>
  );

  const tooltip = collapsed ? <SidebarTooltip label={item.label} parentRef={navRef} /> : null;

  if (item.href) {
    return <>{tooltip}<Link href={item.href} prefetch={false} onClick={onClick}>{content}</Link></>;
  }
  return <>{tooltip}<button type="button" className="w-full" onClick={onClick}>{content}</button></>;
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="mx-3 my-2 h-px bg-ca-ink/[0.08]" />;
  return <div className="mb-1 mt-5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">{children}</div>;
}

function StaffControls({
  staff,
  viewMode,
  envOptions,
  activeEnv,
  collapsed,
}: {
  staff: boolean;
  viewMode: ViewMode;
  envOptions: EnvOption[];
  activeEnv: string | null;
  collapsed: boolean;
}) {
  if (!staff) return null;
  return (
    <div className={collapsed ? "mb-1 border-b border-ca-ink/[0.08] pb-1" : "mb-1 border-b border-ca-ink/[0.08] pb-2"}>
      <ViewModeToggle mode={viewMode} collapsed={collapsed} />
      {/* "Entorno" es jerga/función de admin: en vista alumno (viewMode student,
          incluyendo el "ver como" del staff) no debe mostrarse. */}
      {viewMode === "admin" && (
        <EnvSwitcher
          options={envOptions}
          activeEnv={activeEnv}
          collapsed={collapsed}
        />
      )}
    </div>
  );
}

function SidebarContent({
  items,
  isActive,
  collapsed,
  userInitials,
  userName,
  userAvatarUrl,
  staff,
  viewMode,
  envOptions,
  activeEnv,
  viewerId,
  cohortId,
  onCollapse,
  onNavClick,
}: {
  items: NavItem[];
  isActive: (path: string) => boolean;
  collapsed: boolean;
  userInitials: string;
  userName: string;
  userAvatarUrl?: string | null;
  staff: boolean;
  viewMode: ViewMode;
  envOptions: EnvOption[];
  activeEnv: string | null;
  viewerId?: string;
  cohortId?: string;
  onCollapse?: () => void;
  onNavClick?: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-5">
        <Logo collapsed={collapsed} />
        {!collapsed && viewerId && cohortId && (
          <NotificationBell viewerId={viewerId} />
        )}
      </div>

      <StaffControls
        staff={staff}
        viewMode={viewMode}
        envOptions={envOptions}
        activeEnv={activeEnv}
        collapsed={collapsed}
      />

      {/* data-tour: anclaje del tour guiado (ADR-0030). SidebarContent se
          renderiza SOLO en el aside de escritorio; el drawer móvil arma su
          propia lista más abajo y no lleva el atributo, para que el anclaje
          nunca esté duplicado en el DOM. */}
      <div data-tour="menu" className="no-scrollbar flex-1 overflow-y-auto px-3 pb-3">
        {NAV_SECTIONS.map(({ key, label }) => {
          const sectionItems = items.filter((i) => i.section === key);
          if (sectionItems.length === 0) return null;
          return (
            <div key={key}>
              <SectionLabel collapsed={collapsed}>{label}</SectionLabel>
              <div className="flex flex-col gap-1">
                {sectionItems.map((item) => (
                  <NavItemButton
                    key={item.label}
                    item={item}
                    active={item.href ? isActive(item.href) : false}
                    collapsed={collapsed}
                    onClick={onNavClick}
                  />
                ))}
              </div>
            </div>
          );
        })}

        <div data-tour="ayuda" className="mt-3 border-t border-ca-ink/[0.06] pt-3">
          <NavItemButton
            item={HELP_ITEM}
            active={isActive(HELP_ITEM.href!)}
            collapsed={collapsed}
            onClick={onNavClick}
          />
        </div>
      </div>

      <div className={`border-t border-ca-ink/[0.08] px-3 py-3 ${collapsed ? "flex flex-col items-center" : ""}`}>
        {onCollapse && (
          <div className={`mb-2 flex ${collapsed ? "justify-center" : "justify-end"}`}>
            <button
              onClick={onCollapse}
              className="shape-circle grid h-8 w-8 place-items-center text-ca-ink-soft transition-[background,transform] duration-[150ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-ca-bg-soft hover:scale-110 active:scale-95"
              aria-label={collapsed ? "Expandir menú" : "Minimizar menú"}
              title={collapsed ? "Expandir menú" : "Minimizar menú"}
            >
              <span className={`block transition-transform duration-[240ms] cubic-bezier(0.4,0,0.2,1) ${collapsed ? "rotate-180" : ""}`}>
                <SvgIcon name="chevronsLeft" size={16} />
              </span>
            </button>
          </div>
        )}
        <ProfileLink userInitials={userInitials} userName={userName} userAvatarUrl={userAvatarUrl} collapsed={collapsed} />
        <form action="/api/auth/signout" method="POST" className="mt-2">
          <button
            type="submit"
            className={`w-full rounded-xl py-2 text-center text-[11px] font-bold uppercase tracking-[0.1em] text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink ${collapsed ? "px-1" : ""}`}
            title="Cerrar sesión"
          >
            {collapsed ? (
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
              </svg>
            ) : (
              "Cerrar sesión"
            )}
          </button>
        </form>
      </div>
    </>
  );
}

function ProfileLink({ userInitials, userName, userAvatarUrl, collapsed, onClick }: { userInitials: string; userName: string; userAvatarUrl?: string | null; collapsed: boolean; onClick?: () => void }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  return (
    <>
      {collapsed && <SidebarTooltip label="Mi perfil" parentRef={linkRef} />}
      <Link
        ref={linkRef}
        href="/classroom/profile"
        prefetch={false}
        onClick={onClick}
        className={`group relative flex items-center gap-3 rounded-2xl bg-ca-bg-soft p-2 transition-all hover:bg-ca-violet/[0.08] hover:ring-1 hover:ring-ca-violet/20 ${collapsed ? "justify-center" : ""}`}
      >
        <div className="relative">
          <Avatar initials={userInitials} avatarUrl={userAvatarUrl} size={36} accent="bg-ca-lime" />
          <div className="absolute inset-0 grid place-items-center rounded-full bg-ca-violet/70 opacity-0 transition-opacity group-hover:opacity-100">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z" />
            </svg>
          </div>
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12px] font-bold text-ca-ink">{userName}</div>
            <div className="flex items-center gap-1 text-[10px] font-semibold text-ca-ink-soft transition-colors group-hover:text-ca-violet">
              <span>Mi perfil</span>
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </div>
        )}
      </Link>
    </>
  );
}

export function ClassroomSidebar({
  userInitials,
  userName,
  userRole = "user",
  userAvatarUrl,
  cohortId,
  cohortLabel,
  showOps = false,
  viewMode = "admin",
  envOptions = [],
  activeEnv = null,
  viewerId,
  isTeacher = false,
  hasFinalEvaluation = false,
  hasMultiplePrograms = false,
  cohortMap = {},
}: {
  userInitials: string;
  userName: string;
  userRole?: string;
  userAvatarUrl?: string | null;
  cohortId?: string;
  cohortLabel?: string;
  showOps?: boolean;
  viewMode?: ViewMode;
  envOptions?: EnvOption[];
  activeEnv?: string | null;
  viewerId?: string;
  /** El usuario es docente/asistente de al menos una cohorte (cohort_roles). */
  isTeacher?: boolean;
  /** Hay una evaluación final publicada (activa) para el programa de la cohorte activa. */
  hasFinalEvaluation?: boolean;
  /** El alumno (no staff) tiene más de una matrícula activa: solo entonces se
   * muestra "Mis programas" como selector. Con una sola, no hay nada que elegir. */
  hasMultiplePrograms?: boolean;
  /** Mapa slug/id de cohorte → {label, hasFinalEvaluation} de las matrículas
   * activas del alumno. Permite que el sidebar siga la cohorte de la RUTA en
   * navegación client-side sin re-render del layout. Vacío para staff. */
  cohortMap?: Record<string, { label: string; hasFinalEvaluation: boolean }>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const trapRef = useFocusTrap(mobileOpen);
  const pathname = usePathname();

  // Cohorte activa según la RUTA (fuente de verdad en navegación client-side,
  // porque el layout no se re-renderiza al cambiar de segmento hijo). Cae al prop
  // del servidor cuando la ruta no trae slug (/classroom, /profile, /guia,
  // /quiz/[id]) o es una sub-ruta reservada. Debe espejar RESERVED_SUBPATHS del layout.
  const RESERVED_SUBPATHS = new Set(["profile", "guia", "quiz"]);
  const pathParts = pathname.split("/").filter(Boolean); // ['classroom', '<slug>', ...]
  const slugFromPath =
    pathParts[0] === "classroom" && pathParts[1] && !RESERVED_SUBPATHS.has(pathParts[1])
      ? pathParts[1]
      : undefined;

  // Recuerda la última cohorte vista para que en rutas sin slug (perfil, guía)
  // el sidebar no "salte" de vuelta a la cohorte por defecto del servidor.
  const [lastCohort, setLastCohort] = useState<string | undefined>(cohortId);
  // Si el SERVIDOR re-resolvió la cohorte (p. ej. router.refresh() tras cambiar
  // de entorno con el switcher del staff), el prop nuevo manda sobre lo recordado:
  // sin este reset, el sidebar del staff quedaría anclado al entorno anterior.
  const [prevServerCohort, setPrevServerCohort] = useState<string | undefined>(cohortId);
  if (cohortId !== prevServerCohort) {
    setPrevServerCohort(cohortId);
    setLastCohort(cohortId);
  }
  if (slugFromPath && slugFromPath !== lastCohort) {
    setLastCohort(slugFromPath);
  }
  const activeCohort = slugFromPath ?? lastCohort ?? cohortId;

  const activeInfo = activeCohort ? cohortMap[activeCohort] : undefined;
  // Solo se confía en el label/quiz del servidor cuando la cohorte activa coincide
  // con la que resolvió el layout; sin match en el mapa (staff, cohorte fuera de
  // sus matrículas) se degrada con gracia: hrefs con el slug de la ruta, label
  // genérico "Inicio", sin "Quiz final".
  const activeLabel =
    activeInfo?.label ?? (activeCohort === cohortId ? cohortLabel : undefined);
  const activeHasFinal =
    activeInfo?.hasFinalEvaluation ?? (activeCohort === cohortId ? hasFinalEvaluation : false);

  // Cierra el drawer móvil al navegar a otra ruta. El setState en effect es
  // intencional (sincroniza con el cambio de pathname externo).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (path: string) => {
    if (path === "/classroom") {
      return pathname === "/classroom";
    }
    if (path === `/classroom/${activeCohort}`) {
      // "Inicio" cubre la raíz de la cohorte y las clases/lecciones, pero NO
      // las secciones que tienen su propio ítem en este menú — sin esta lista,
      // "Inicio" quedaba resaltado junto con la sección visitada.
      const secciones = [
        "calendario",
        "recursos",
        "entregables",
        "notas",
        "conversaciones",
        "evaluacion",
        "quiz",
      ];
      return (
        pathname.startsWith(`/classroom/${activeCohort}`) &&
        !secciones.some((s) => pathname.startsWith(`/classroom/${activeCohort}/${s}`))
      );
    }
    return pathname.startsWith(path);
  };

  // El staff alterna entre vista Admin (General + Configuración) y vista Alumno (Aprender).
  // Un alumno puro (no staff) siempre ve solo "Aprender".
  //
  // La vista efectiva es CONSCIENTE DE LA RUTA: si el staff está en el panel
  // (/admin/*) siempre ve la navegación admin, sin importar la cookie "ver como".
  // Así se evita el estado contradictorio (página admin con navegación de alumno)
  // que aparecía al volver a /admin con el modo "Alumno" persistido. La cookie
  // solo decide a dónde navega el toggle (classroom vs panel).
  const staff = showOps;
  const onAdminRoute = pathname.startsWith("/admin");
  const effectiveViewMode: ViewMode = staff && onAdminRoute ? "admin" : viewMode;
  const showLearn = !staff || effectiveViewMode === "student";
  const showOpsNav = staff && effectiveViewMode === "admin";

  const navItems: NavItem[] = [
    ...(showLearn ? [
      // "Mis programas" solo se muestra cuando hay más de un programa entre
      // los que elegir (alumno con varias matrículas activas). El staff
      // cambia de entorno con el switcher "Entorno", no con este item: para
      // el staff, /classroom siempre redirige a la cohorte activa (= "Inicio"),
      // así que mostrárselo sería redundante.
      ...(hasMultiplePrograms ? [
        { icon: "book", label: "Mis programas", href: "/classroom", section: "learn" as const },
      ] : []),
      { icon: "home", label: activeLabel ?? "Inicio", href: activeCohort ? `/classroom/${activeCohort}` : "/classroom", section: "learn" as const },
      { icon: "calendar", label: "Calendario", href: activeCohort ? `/classroom/${activeCohort}/calendario` : "/classroom", section: "learn" as const },
      ...(activeCohort ? [
        { icon: "folder", label: "Recursos", href: `/classroom/${activeCohort}/recursos`, section: "learn" as const },
        { icon: "upload", label: "Entregables", href: `/classroom/${activeCohort}/entregables`, section: "learn" as const },
        // Notas: NUNCA se gatea (a diferencia del quiz final) — la pantalla
        // debe existir siempre, aunque el alumno aún no tenga notas publicadas.
        { icon: "chart", label: "Notas", href: `/classroom/${activeCohort}/notas`, section: "learn" as const },
        { icon: "chat", label: "Conversaciones", href: `/classroom/${activeCohort}/conversaciones`, section: "learn" as const },
        // Herramienta de trabajo del asesor (Paso 7 de la metodología), no
        // contenido del programa: por eso no se gatea por progreso ni por quiz.
        { icon: "calculator", label: "Evaluación Financiera", href: `/classroom/${activeCohort}/evaluacion`, section: "learn" as const },
        ...(activeHasFinal ? [
          { icon: "clipboardCheck", label: "Quiz final", href: `/classroom/${activeCohort}/quiz`, section: "learn" as const },
        ] : []),
      ] : []),
      // Docente/asistente (cohort_roles) o instructor asignado: entrada al
      // panel dedicado. Se muestra también en la vista admin (showOpsNav):
      // staff que además dicta clase (p.ej. instructor asignado) debe poder
      // llegar a /docente.
      ...(isTeacher ? [
        { icon: "users", label: "Panel del profesor", href: "/docente", section: "learn" as const },
      ] : []),
    ] : []),
    ...(showOpsNav ? [
      // General: opciones globales (no atadas a un entorno).
      { icon: "users", label: "Usuarios", href: "/admin/users", section: "general" as const },
      { icon: "creditCard", label: "Cobros", href: "/admin/cobros", section: "general" as const },
      { icon: "megaphone", label: "Comunicaciones", href: "/admin/comunicaciones", section: "general" as const },
      { icon: "poll", label: "Encuestas", href: "/admin/encuestas", section: "general" as const },
      ...(activeCohort ? [
        { icon: "chat", label: "Conversaciones", href: `/classroom/${activeCohort}/conversaciones`, section: "general" as const },
      ] : []),
      // Configuración: armado del contenido del entorno activo. Los recursos se
      // gestionan dentro de Lecciones (lecciones grabadas y clases en vivo).
      { icon: "calendar", label: "Calendario", href: "/admin/calendario", section: "config" as const },
      { icon: "filmLines", label: "Lecciones", href: "/admin/lessons", section: "config" as const },
      { icon: "clipboardCheck", label: "Evaluaciones", href: "/admin/evaluaciones", section: "config" as const },
      { icon: "award", label: "Certificados", href: "/admin/certificados", section: "config" as const },
      { icon: "upload", label: "Entregables", href: "/admin/deliverables", section: "config" as const },
      { icon: "userCheck", label: "Alumnos", href: "/admin/alumnos", section: "config" as const },
      { icon: "idCard", label: "Docentes", href: "/admin/docentes", section: "config" as const },
      { icon: "chart", label: "Progreso cohorte", href: "/admin/progress", section: "config" as const },
      { icon: "clock", label: "Actividad", href: "/admin/actividad", section: "config" as const },
    ] : []),
  ];

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="relative hidden shrink-0 flex-col border-r border-ca-ink/[0.08] bg-ca-surface md:flex"
        style={{ width: collapsed ? 76 : 256, transition: "width 240ms cubic-bezier(0.4,0,0.2,1)" }}
      >
        <SidebarContent
          items={navItems}
          isActive={isActive}
          collapsed={collapsed}
          userInitials={userInitials}
          userName={userName}
          userAvatarUrl={userAvatarUrl}
          staff={staff}
          viewMode={effectiveViewMode}
          envOptions={envOptions}
          activeEnv={activeEnv}
          viewerId={viewerId}
          cohortId={activeCohort}
          onCollapse={() => setCollapsed(!collapsed)}
        />
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-ca-ink/[0.08] bg-ca-surface px-4 py-2.5 md:hidden">
        <button
          data-tour="menu-movil"
          onClick={() => setMobileOpen(true)}
          className="grid h-11 w-11 place-items-center rounded-xl text-ca-ink transition-colors hover:bg-ca-bg-soft"
          aria-label="Abrir menú"
        >
          <SvgIcon name="menu" size={20} />
        </button>
        <Logo />
        <div className="flex items-center gap-1">
          {viewerId && activeCohort && (
            <NotificationBell viewerId={viewerId} />
          )}
          <Link href="/classroom/profile" prefetch={false} className="grid h-11 w-11 place-items-center">
            <Avatar initials={userInitials} avatarUrl={userAvatarUrl} size={34} accent="bg-ca-lime" />
          </Link>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: "rgba(15, 19, 64, 0.45)", backdropFilter: "blur(4px)" }}
            onClick={() => setMobileOpen(false)}
          />

          {/* Drawer */}
          <aside
            ref={trapRef}
            className="ca-slide-in-left absolute bottom-0 left-0 top-0 flex w-[280px] flex-col bg-ca-surface pb-[env(safe-area-inset-bottom)] shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <Logo />
              <button
                onClick={() => setMobileOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl text-ca-ink-soft transition-colors hover:bg-ca-bg-soft"
                aria-label="Cerrar menú"
              >
                <SvgIcon name="x" size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-3">
              <StaffControls
                staff={staff}
                viewMode={effectiveViewMode}
                envOptions={envOptions}
                activeEnv={activeEnv}
                collapsed={false}
              />
              {NAV_SECTIONS.map(({ key, label }) => {
                const sectionItems = navItems.filter((i) => i.section === key);
                if (sectionItems.length === 0) return null;
                return (
                  <div key={key}>
                    <SectionLabel collapsed={false}>{label}</SectionLabel>
                    <div className="flex flex-col gap-1">
                      {sectionItems.map((item) => (
                        <NavItemButton
                          key={item.label}
                          item={item}
                          active={item.href ? isActive(item.href) : false}
                          collapsed={false}
                          onClick={() => setMobileOpen(false)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              <div className="mt-3 border-t border-ca-ink/[0.06] pt-3">
                <NavItemButton
                  item={HELP_ITEM}
                  active={isActive(HELP_ITEM.href!)}
                  collapsed={false}
                  onClick={() => setMobileOpen(false)}
                />
              </div>
            </div>

            <div className="border-t border-ca-ink/[0.08] px-3 py-3">
              <ProfileLink userInitials={userInitials} userName={userName} userAvatarUrl={userAvatarUrl} collapsed={false} onClick={() => setMobileOpen(false)} />
              <form action="/api/auth/signout" method="POST" className="mt-2">
                <button
                  type="submit"
                  className="w-full rounded-xl py-2.5 text-center text-[12px] font-bold uppercase tracking-[0.1em] text-ca-ink-soft transition-colors hover:bg-ca-bg-soft"
                >
                  Cerrar sesión
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
