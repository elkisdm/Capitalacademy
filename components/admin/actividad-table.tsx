import { Avatar } from "@/components/classroom/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { formatActiveDuration, formatInactivity } from "@/lib/classroom/actividad";
import { formatDateOnly } from "@/lib/time";
import type { StudentActivity } from "@/lib/admin/actividad-queries";

const RISK_TONE: Record<StudentActivity["risk"], string> = {
  ok: "var(--color-ca-lime-deep)",
  watch: "var(--color-ca-amber-text)",
  risk: "#e11d48",
};

function ClockEmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function ActividadTable({ students }: { students: StudentActivity[] }) {
  if (students.length === 0) {
    return (
      <EmptyState
        icon={ClockEmptyIcon}
        title="Sin alumnos activos"
        description="Esta cohorte no tiene matrículas activas que medir."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ca-ink/[0.08] bg-white">
      {/* La tabla scrollea dentro de su propio contenedor: el body de la página
          nunca debe scrollear en horizontal. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-ca-ink/[0.08]">
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
                Alumno
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
                Tiempo con la plataforma abierta
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
                Días que entró
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
                Promedio por día
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
                Última vez
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr
                key={s.enrollment_id}
                className="border-b border-ca-ink/[0.06] last:border-b-0"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar initials={s.initials} size={34} accent="bg-ca-lime" />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-bold text-ca-ink">
                        {s.full_name}
                      </div>
                      <div className="truncate font-mono text-[11px] font-semibold text-ca-ink-soft">
                        {s.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-[14px] font-black text-ca-ink">
                  {formatActiveDuration(s.total_seconds)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-[14px] font-semibold text-ca-ink">
                  {s.active_days}
                </td>
                <td className="px-4 py-3 text-right font-mono text-[13px] font-semibold text-ca-ink-soft">
                  {formatActiveDuration(s.avg_seconds_per_active_day)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div
                    className="font-mono text-[13px] font-bold"
                    style={{ color: RISK_TONE[s.risk] }}
                  >
                    {formatInactivity(s.days_since_last_active)}
                  </div>
                  {s.last_active_date && (
                    <div className="text-[10px] font-semibold text-ca-ink-soft">
                      {formatDateOnly(s.last_active_date, {
                        day: "2-digit",
                        month: "short",
                      })}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
