import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveEnv, getEnvOptions, resolveProgramScope } from "@/lib/admin/active-env";
import { getStudentPanelReport } from "@/lib/admin/student-panel-queries";
import { StudentTable } from "./student-table";
import { CohortFilter } from "./cohort-filter";

export default async function AdminAlumnosPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const envOptions = await getEnvOptions();
  const activeEnv = await getActiveEnv();
  const programId = resolveProgramScope(undefined, activeEnv, envOptions);

  if (!programId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-2xl font-black text-ca-ink">Alumnos</h1>
        <p className="mt-4 text-ca-ink-soft">No hay entornos registrados.</p>
      </div>
    );
  }

  const params = await searchParams;
  const report = await getStudentPanelReport(programId, params.cohort);

  if (!report) {
    return (
      <div className="ca-fade-up mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
        <div className="mb-7">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
            Operaciones · Reportes
          </div>
          <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">Alumnos</h1>
        </div>
        <p className="mt-4 text-ca-ink-soft">No se encontró el entorno seleccionado.</p>
      </div>
    );
  }

  const { program, cohorts, students } = report;

  const total = students.length;
  const enRiesgo = students.filter((s) => s.atRisk).length;
  const asistProm =
    total > 0 ? Math.round(students.reduce((sum, s) => sum + s.attendance.pct, 0) / total) : 0;
  const avanceProm =
    total > 0 ? Math.round(students.reduce((sum, s) => sum + s.progress.pct, 0) / total) : 0;

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-7">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Operaciones · Reportes
        </div>
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">Alumnos</h1>
        <p className="mt-1 text-[14px] font-semibold text-ca-ink-soft">
          {program.name} · {total} alumnos activos
        </p>
      </div>

      <CohortFilter
        cohorts={cohorts}
        selectedId={cohorts.some((c) => c.id === params.cohort) ? params.cohort : undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Total alumnos", value: `${total}`, sub: "activos", tone: "var(--color-ca-navy)" },
          { label: "En riesgo", value: `${enRiesgo}`, sub: "2+ inasistencias", tone: "#e11d48" },
          { label: "Asistencia prom.", value: `${asistProm}%`, tone: "var(--color-ca-violet)" },
          { label: "Avance prom.", value: `${avanceProm}%`, tone: "var(--color-ca-lime-deep)" },
        ].map((s) => (
          <div key={s.label} className="ca-card relative overflow-hidden p-5">
            <div className="shape-circle absolute -right-4 -top-4 h-16 w-16 opacity-[0.08]" style={{ background: s.tone }} />
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">{s.label}</div>
            <div className="mt-2 font-mono text-[32px] font-black tracking-tight" style={{ color: s.tone }}>{s.value}</div>
            {s.sub && <div className="text-[11px] font-semibold text-ca-ink-soft">{s.sub}</div>}
          </div>
        ))}
      </div>

      <StudentTable students={students} />
    </div>
  );
}
