"use client";

import type { ReactNode } from "react";

const PLATFORM_ROLE_STYLES = {
  admin: { background: "var(--color-ca-violet)", color: "#fff" },
  ops: { background: "var(--color-ca-navy, #14163a)", color: "#fff" },
  user: { background: "rgba(20,22,58,0.08)", color: "var(--color-ca-ink-soft)" },
} as const;

type PlatformRole = keyof typeof PLATFORM_ROLE_STYLES;

const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  admin: "Admin",
  ops: "Ops",
  user: "Usuario",
};

export function PlatformBadge({ role }: { role: PlatformRole }) {
  const style = PLATFORM_ROLE_STYLES[role] ?? PLATFORM_ROLE_STYLES.user;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
      style={style}
    >
      {PLATFORM_ROLE_LABELS[role] ?? role}
    </span>
  );
}

const COHORT_ROLE_STYLES = {
  student: { background: "var(--color-ca-lime)", color: "var(--color-ca-ink)" },
  teacher: { background: "var(--color-ca-violet)", color: "#fff" },
  assistant: { background: "var(--color-ca-navy, #14163a)", color: "#fff" },
} as const;

type CohortRole = keyof typeof COHORT_ROLE_STYLES;

const COHORT_ROLE_LABELS: Record<CohortRole, string> = {
  student: "Alumno",
  teacher: "Profesor",
  assistant: "Ayudante",
};

export function CohortRoleBadge({ role }: { role: CohortRole }) {
  const style = COHORT_ROLE_STYLES[role] ?? COHORT_ROLE_STYLES.student;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
      style={style}
    >
      {COHORT_ROLE_LABELS[role] ?? role}
    </span>
  );
}

const STATE_STYLES = {
  active: { dot: "#3f5a05", bg: "rgba(168,211,16,0.20)", fg: "#3f5a05", label: "Activo" },
  completed: { dot: "var(--color-ca-ink-soft)", bg: "rgba(20,22,58,0.06)", fg: "var(--color-ca-ink-soft)", label: "Completado" },
  suspended: { dot: "#9f1b3e", bg: "rgba(225,29,72,0.10)", fg: "#9f1b3e", label: "Suspendido" },
  upcoming: { dot: "var(--color-ca-violet)", bg: "rgba(94,23,235,0.10)", fg: "var(--color-ca-violet-deep)", label: "Próximo" },
} as const;

type State = keyof typeof STATE_STYLES;

export function StateBadge({ state }: { state: State }) {
  const s = STATE_STYLES[state] ?? STATE_STYLES.active;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="shape-circle h-1.5 w-1.5" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

export function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors"
      style={{
        background: active ? "var(--color-ca-ink)" : "transparent",
        color: active ? "#fff" : "var(--color-ca-ink-soft)",
        border: active ? "1px solid var(--color-ca-ink)" : "1px solid rgba(20,22,58,0.14)",
      }}
    >
      {label}
      {count != null && (
        <span
          className="rounded-full px-1.5 text-[10px] font-bold"
          style={{
            background: active ? "var(--color-ca-lime)" : "var(--color-ca-bg-soft)",
            color: "var(--color-ca-ink)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

type CohortBadge = {
  name: string;
  role: CohortRole;
};

export function CohortBadgeStack({ cohorts }: { cohorts: CohortBadge[] }) {
  const visible = cohorts.slice(0, 2);
  const overflow = cohorts.length - 2;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((c, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold"
          style={{
            background: "rgba(20,22,58,0.06)",
            color: "var(--color-ca-ink)",
          }}
        >
          <span
            className="shape-circle h-1.5 w-1.5"
            style={{ background: COHORT_ROLE_STYLES[c.role]?.background ?? "var(--color-ca-ink-soft)" }}
          />
          <span className="max-w-[120px] truncate">{c.name}</span>
          <span className="text-[9px] uppercase tracking-[0.1em] opacity-60">
            {COHORT_ROLE_LABELS[c.role] ?? c.role}
          </span>
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: "rgba(20,22,58,0.06)", color: "var(--color-ca-ink-soft)" }}
        >
          +{overflow} más
        </span>
      )}
    </div>
  );
}

export { type PlatformRole, type CohortRole, type State, type CohortBadge };
