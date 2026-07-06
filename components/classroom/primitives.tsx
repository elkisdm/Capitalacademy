import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/brand/logo-on-light.png"
        alt="Capital Academy"
        width={96}
        height={95}
        className="h-9 w-auto shrink-0"
      />
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-[13px] font-extrabold tracking-tight text-ca-ink">
            Capital Academy
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ca-ink-soft">
            Classroom
          </div>
        </div>
      )}
    </div>
  );
}

export function BrandShapes({ variant = "default" }: { variant?: "default" | "hero" | "corner-violet" }) {
  if (variant === "hero") {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="shape-circle absolute -right-24 -top-24 h-72 w-72 bg-ca-lime opacity-90" />
        <div className="shape-circle ca-pulse absolute right-40 top-14 h-12 w-12 bg-ca-violet" />
        <div className="shape-half-left absolute -right-8 bottom-8 h-40 w-20 bg-ca-violet" />
        <div className="shape-circle absolute right-72 bottom-0 h-8 w-8 bg-ca-violet-soft" />
      </div>
    );
  }
  if (variant === "corner-violet") {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="shape-circle absolute -right-10 -top-10 h-28 w-28 bg-ca-violet opacity-[0.08]" />
        <div className="shape-half-right absolute -bottom-8 -left-8 h-20 w-20 bg-ca-lime opacity-70" />
      </div>
    );
  }
  return null;
}

const STATUS_MAP = {
  completed: { label: "Completado", dotBg: "bg-ca-amber", bg: "bg-ca-amber/15", fg: "text-[#8b6914]" },
  in_progress: { label: "En progreso", dotBg: "bg-ca-lime-deep", bg: "bg-ca-lime-deep/[0.14]", fg: "text-[#3f5a05]" },
  available: { label: "Disponible", dotBg: "bg-ca-violet", bg: "bg-ca-violet/10", fg: "text-ca-violet-deep" },
  locked: { label: "Bloqueado", dotBg: "bg-ca-ink-soft", bg: "bg-ca-ink/5", fg: "text-ca-ink-soft" },
  no_video: { label: "Próximamente", dotBg: "bg-ca-ink-soft", bg: "bg-ca-ink/5", fg: "text-ca-ink-soft" },
} as const;

export function StatusPill({ status, size = "md" }: { status: keyof typeof STATUS_MAP; size?: "sm" | "md" }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.available;
  const sz = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-[11px] px-2.5 py-1";
  const border = "";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${sz} ${s.bg} ${s.fg} ${border}`}>
      <span className={`shape-circle h-1.5 w-1.5 ${s.dotBg}`} />
      {s.label}
    </span>
  );
}

export function ProgressBar({
  value,
  height = 6,
  showStripe = false,
  completed = false,
  track = "bg-ca-ink/[0.08]",
  color,
}: {
  value: number;
  height?: number;
  showStripe?: boolean;
  completed?: boolean;
  track?: string;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = completed ? "bg-ca-lime-deep" : (color ?? "bg-ca-violet");
  return (
    <div className={`shape-circle relative w-full overflow-hidden ${track}`} style={{ height }}>
      <div
        className={`h-full ${fill} ${showStripe && !completed ? "ca-progress-stripe" : ""}`}
        style={{ width: `${pct}%`, transition: "width 320ms ease" }}
      />
    </div>
  );
}

export function Avatar({
  initials,
  avatarUrl,
  size = 36,
  accent = "bg-ca-violet",
}: {
  initials: string;
  avatarUrl?: string | null;
  size?: number;
  accent?: string;
}) {
  return (
    <div
      className="shape-circle relative inline-grid shrink-0 place-items-center bg-ca-navy-ink font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {avatarUrl ? (
        <Image src={avatarUrl} alt="" width={size} height={size} className="h-full w-full rounded-full object-cover" />
      ) : (
        initials
      )}
      <span
        className={`shape-circle absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 border-2 border-ca-surface ${accent}`}
      />
    </div>
  );
}

export function LessonStatusIcon({ status, size = 28 }: { status: string; size?: number }) {
  const wrap = { width: size, height: size };
  if (status === "completed") {
    return (
      <div className="shape-circle grid place-items-center bg-ca-lime-deep" style={wrap}>
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (status === "in_progress") {
    return (
      <div className="shape-circle grid place-items-center bg-ca-violet" style={wrap}>
        <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4z" fill="white" /></svg>
      </div>
    );
  }
  if (status === "locked") {
    return (
      <div className="shape-circle grid place-items-center border border-ca-ink/[0.08] bg-ca-bg-soft text-ca-ink-soft" style={wrap}>
        <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" />
        </svg>
      </div>
    );
  }
  return (
    <div className="shape-circle grid place-items-center border-[1.5px] border-ca-ink/[0.14] text-ca-ink-soft" style={wrap}>
      <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4z" fill="currentColor" /></svg>
    </div>
  );
}

export function Breadcrumb({ items }: { items: Array<{ label: string; href?: string; onClick?: () => void }> }) {
  return (
    <nav className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          )}
          {it.href ? (
            <Link href={it.href} className="transition-colors hover:text-ca-violet hover:underline underline-offset-2">{it.label}</Link>
          ) : it.onClick ? (
            <button onClick={it.onClick} className="transition-colors hover:text-ca-violet hover:underline underline-offset-2">{it.label}</button>
          ) : (
            <span className={i === items.length - 1 ? "text-ca-ink" : ""}>{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function IconButton({ children, label, onClick, size = 36, active = false }: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  size?: number;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`shape-circle grid place-items-center transition-all hover:scale-105 hover:bg-ca-bg-soft ${active ? "bg-ca-ink text-white" : "border border-ca-ink/[0.08] text-ca-ink"}`}
      style={{ width: size, height: size }}
    >
      {children}
    </button>
  );
}
