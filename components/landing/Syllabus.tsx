import type { ProgramMeta } from "@/lib/landing/programs";
import { themeStyles } from "@/lib/landing/programs";

/**
 * Currículum expandible — usa <details> nativo (sin JS, accesible por keyboard).
 * Inspirado en Udemy curriculum + Coursera modules.
 */
export function Syllabus({ d }: { d: ProgramMeta }) {
  const t = themeStyles[d.theme];
  return (
    <div className="mt-10 rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-6 sm:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
            Currículum
          </p>
          <h3 className="mt-1 text-xl font-black tracking-[-0.02em] text-[var(--color-ca-ink)] sm:text-2xl">
            {d.modules} módulos · {d.duration}
          </h3>
        </div>
        <span
          className={`hidden items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] sm:inline-flex ${t.badge}`}
        >
          Plan completo
        </span>
      </div>

      <ul className="mt-6 divide-y divide-[rgba(20,22,58,0.08)]">
        {d.syllabus.map((m) => (
          <li key={m.num}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-4 py-4 transition-colors hover:bg-[var(--color-ca-bg)]/60 [&::-webkit-details-marker]:hidden">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-ca-bg)] text-xs font-black tabular-nums text-[var(--color-ca-violet)] group-open:bg-[var(--color-ca-violet)] group-open:text-white">
                  {String(m.num).padStart(2, "0")}
                </span>
                <span className="flex-1 text-sm font-bold text-[var(--color-ca-ink)] sm:text-base">
                  {m.title}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0 text-[var(--color-ca-ink-soft)] transition-transform group-open:rotate-180"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </summary>
              <ul className="ml-14 mb-4 mt-1 space-y-2">
                {m.topics.map((topic) => (
                  <li
                    key={topic}
                    className="flex items-start gap-3 text-sm text-[var(--color-ca-ink-soft)]"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ca-lime-deep)]" />
                    {topic}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
