"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFocusTrap } from "@/lib/utils/use-focus-trap";
import { Logo, Avatar } from "./primitives";

const ICON_PATHS: Record<string, React.ReactNode> = {
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  book: <><path d="M4 4h12a3 3 0 013 3v13H7a3 3 0 01-3-3V4z" /><path d="M4 17a3 3 0 013-3h12" /></>,
  filmLines: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></>,
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
};

function SvgIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name]}
    </svg>
  );
}

type NavItem = {
  icon: string;
  label: string;
  href?: string;
  badge?: string;
  section: "learn" | "ops";
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
  const content = (
    <span
      className={`group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all ${
        active ? "bg-ca-violet text-white" : "text-ca-ink hover:bg-ca-bg-soft"
      }`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center">
        <SvgIcon name={item.icon} size={18} />
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 text-[13px] font-semibold tracking-tight">{item.label}</span>
          {item.badge && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? "bg-ca-lime text-ca-ink" : "bg-ca-violet text-white"}`}>
              {item.badge}
            </span>
          )}
        </>
      )}
      {active && <span className="shape-circle absolute right-2 top-2 h-1.5 w-1.5 bg-ca-lime" title="En progreso" />}
    </span>
  );

  if (item.href) {
    return <Link href={item.href} prefetch={false} onClick={onClick}>{content}</Link>;
  }
  return <button type="button" className="w-full" onClick={onClick}>{content}</button>;
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="mx-3 my-2 h-px bg-ca-ink/[0.08]" />;
  return <div className="mb-1 mt-5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">{children}</div>;
}

function SidebarContent({
  items,
  isActive,
  collapsed,
  cohortId,
  userInitials,
  userName,
  userRole,
  onCollapse,
  onNavClick,
}: {
  items: NavItem[];
  isActive: (path: string) => boolean;
  collapsed: boolean;
  cohortId?: string;
  userInitials: string;
  userName: string;
  userRole: string;
  onCollapse?: () => void;
  onNavClick?: () => void;
}) {
  const learnItems = items.filter((i) => i.section === "learn");
  const opsItems = items.filter((i) => i.section === "ops");

  return (
    <>
      <div className="flex items-center justify-between px-4 py-5">
        <Logo collapsed={collapsed} />
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-3">
        <SectionLabel collapsed={collapsed}>Aprender</SectionLabel>
        <div className="flex flex-col gap-1">
          {learnItems.map((item) => (
            <NavItemButton
              key={item.label}
              item={item}
              active={item.href ? isActive(item.href) : false}
              collapsed={collapsed}
              onClick={onNavClick}
            />
          ))}
        </div>

        {opsItems.length > 0 && (
          <>
            <SectionLabel collapsed={collapsed}>Operaciones</SectionLabel>
            <div className="flex flex-col gap-1">
              {opsItems.map((item) => (
                <NavItemButton
                  key={item.label}
                  item={item}
                  active={item.href ? isActive(item.href) : false}
                  collapsed={collapsed}
                  onClick={onNavClick}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="border-t border-ca-ink/[0.08] px-3 py-3">
        {onCollapse && (
          <div className="mb-2 flex">
            <button
              onClick={onCollapse}
              className="shape-circle ml-auto grid h-8 w-8 place-items-center text-ca-ink-soft transition-colors hover:bg-ca-bg-soft"
              aria-label="Colapsar sidebar"
            >
              <SvgIcon name={collapsed ? "chevronsRight" : "chevronsLeft"} size={16} />
            </button>
          </div>
        )}
        <div className={`flex items-center gap-3 rounded-2xl bg-ca-bg-soft p-2 ${collapsed ? "justify-center" : ""}`}>
          <Avatar initials={userInitials} size={36} accent="bg-ca-lime" />
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[12px] font-bold text-ca-ink">{userName}</div>
              <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-ca-ink-soft">
                {ROLE_LABELS[userRole] ?? "Usuario"}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  ops: "Operaciones",
  user: "Usuario",
  student: "Alumno",
  teacher: "Profesor",
};

export function ClassroomSidebar({
  userInitials,
  userName,
  userRole = "user",
  cohortId,
  showOps = false,
}: {
  userInitials: string;
  userName: string;
  userRole?: string;
  cohortId?: string;
  showOps?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const trapRef = useFocusTrap(mobileOpen);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (path: string) => {
    if (path === "/classroom") {
      return pathname === "/classroom";
    }
    if (path === `/classroom/${cohortId}`) {
      return pathname.startsWith(`/classroom/${cohortId}`);
    }
    return pathname.startsWith(path);
  };

  const navItems: NavItem[] = [
    { icon: "home", label: "Mis programas", href: "/classroom", section: "learn" },
    { icon: "book", label: "Workshop", href: cohortId ? `/classroom/${cohortId}` : "/classroom", section: "learn" },
    ...(showOps ? [
      { icon: "users", label: "Usuarios", href: "/admin/users", section: "ops" as const },
      { icon: "upload", label: "Subir videos", href: "/admin/lessons", section: "ops" as const },
      { icon: "folder", label: "Recursos", href: "/admin/resources", section: "ops" as const },
      { icon: "users", label: "Progreso cohorte", href: "/admin/progress", section: "ops" as const },
      { icon: "clipboardCheck", label: "Quizzes", href: "/admin/quizzes", section: "ops" as const },
    ] : []),
  ];

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="relative hidden shrink-0 flex-col border-r border-ca-ink/[0.08] bg-ca-surface md:flex"
        style={{ width: collapsed ? 76 : 256, transition: "width 220ms ease" }}
      >
        <SidebarContent
          items={navItems}
          isActive={isActive}
          collapsed={collapsed}
          cohortId={cohortId}
          userInitials={userInitials}
          userName={userName}
          userRole={userRole}
          onCollapse={() => setCollapsed(!collapsed)}
        />
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-ca-ink/[0.08] bg-ca-surface px-4 py-3 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-xl text-ca-ink transition-colors hover:bg-ca-bg-soft"
          aria-label="Abrir menú"
        >
          <SvgIcon name="menu" size={20} />
        </button>
        <Logo />
        <div className="flex items-center gap-2">
          <button className="grid h-10 w-10 place-items-center rounded-xl text-ca-ink-soft transition-colors hover:bg-ca-bg-soft" aria-label="Notificaciones">
            <SvgIcon name="bell" size={18} />
          </button>
          <Avatar initials={userInitials} size={32} accent="bg-ca-lime" />
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
            className="ca-fade-up absolute bottom-0 left-0 top-0 flex w-[280px] flex-col bg-ca-surface shadow-2xl"
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
              <SectionLabel collapsed={false}>Aprender</SectionLabel>
              <div className="flex flex-col gap-1">
                {navItems.filter((i) => i.section === "learn").map((item) => (
                  <NavItemButton
                    key={item.label}
                    item={item}
                    active={item.href ? isActive(item.href) : false}
                    collapsed={false}
                    onClick={() => setMobileOpen(false)}
                  />
                ))}
              </div>

              {navItems.some((i) => i.section === "ops") && (
                <>
                  <SectionLabel collapsed={false}>Operaciones</SectionLabel>
                  <div className="flex flex-col gap-1">
                    {navItems.filter((i) => i.section === "ops").map((item) => (
                      <NavItemButton
                        key={item.label}
                        item={item}
                        active={item.href ? isActive(item.href) : false}
                        collapsed={false}
                        onClick={() => setMobileOpen(false)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-ca-ink/[0.08] px-3 py-3">
              <div className="flex items-center gap-3 rounded-2xl bg-ca-bg-soft p-2">
                <Avatar initials={userInitials} size={36} accent="bg-ca-lime" />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[12px] font-bold text-ca-ink">{userName}</div>
                  <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-ca-ink-soft">
                    {ROLE_LABELS[userRole] ?? "Usuario"}
                  </div>
                </div>
              </div>
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
