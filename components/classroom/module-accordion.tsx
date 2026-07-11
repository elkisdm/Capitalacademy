import Link from "next/link";
import { LessonStatusIcon, ProgressBar, StatusPill } from "@/components/classroom/primitives";

export type ClassRowData = {
  key: string;
  title: string;
  status: "completed" | "in_progress" | "available" | "locked";
  href: string | null;
  durationOrDate: string;
  unlockLabel?: string;
  /** Clase en vivo con repetición lista; href ya va a clase/[sessionId]. */
  hasRecording?: boolean;
};

export type ModuleAccordionItemProps = {
  position: number;
  title: string;
  teacherName?: string | null;
  pct: number;
  completed: number;
  contentCount: number;
  moduleStatus: "completed" | "in_progress" | "available" | "locked";
  isCurrent: boolean;
  rows: ClassRowData[];
};

function ClassRow({ row }: { row: ClassRowData }) {
  if (row.href) {
    return (
      <Link
        href={row.href}
        prefetch={false}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-ca-violet/[0.04]"
      >
        <LessonStatusIcon status={row.status} size={22} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ca-ink">
          {row.title}
        </span>
        {row.hasRecording && (
          <span className="shrink-0 rounded-full bg-ca-violet/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-ca-violet">
            Repetición
          </span>
        )}
        <span className="shrink-0 font-mono text-[11px] text-ca-ink-soft">
          {row.durationOrDate}
        </span>
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 opacity-60">
      <LessonStatusIcon status="locked" size={22} />
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ca-ink-soft">
        {row.title}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-ca-ink-soft">
        {row.unlockLabel ?? row.durationOrDate}
      </span>
    </div>
  );
}

export function ModuleAccordionItem({
  position,
  title,
  teacherName,
  pct,
  completed,
  contentCount,
  moduleStatus,
  isCurrent,
  rows,
}: ModuleAccordionItemProps) {
  return (
    <details className="ca-card group overflow-hidden" open={isCurrent}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-ca-bg-soft [&::-webkit-details-marker]:hidden">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ca-violet/10 text-xs font-black tabular-nums text-ca-violet group-open:bg-ca-violet group-open:text-white">
          {String(position).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold text-ca-ink">{title}</p>
          <p className="mt-0.5 truncate text-[11px] text-ca-ink-soft">
            {contentCount} clases · {completed} completadas
            {teacherName ? ` · ${teacherName}` : ""}
          </p>
          <div className="mt-1.5 max-w-[240px]">
            <ProgressBar value={pct} completed={pct === 100} height={4} />
          </div>
        </div>
        <StatusPill status={moduleStatus} size="sm" />
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 shrink-0 text-ca-ink-soft transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="divide-y divide-ca-ink/[0.06] border-t border-ca-ink/[0.06]">
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-center text-[13px] text-ca-ink-soft">
            Este módulo aún no tiene contenido.
          </p>
        ) : (
          rows.map((row) => <ClassRow key={row.key} row={row} />)
        )}
      </div>
    </details>
  );
}
