import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCohortProgressReport } from "@/lib/classroom/admin-queries";
import { getActiveEnv } from "@/lib/admin/active-env";
import { ProgressTable } from "@/components/admin/progress-table";
import { CohortSelector } from "./cohort-selector";

export default async function AdminProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: allCohorts } = await supabase
    .from("cohorts")
    .select("id, name, code, status, program_id, programs(name)")
    .order("created_at", { ascending: false });

  // Scope al entorno activo: solo cohortes del programa seleccionado.
  const activeEnv = await getActiveEnv();
  const cohorts = activeEnv
    ? (allCohorts ?? []).filter((c) => c.program_id === activeEnv)
    : allCohorts ?? [];

  if (cohorts.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-2xl font-black text-ca-ink">Progreso de la cohorte</h1>
        <p className="mt-4 text-ca-ink-soft">
          {activeEnv
            ? "Este entorno no tiene cohortes registradas."
            : "No hay cohortes registradas."}
        </p>
      </div>
    );
  }

  const params = await searchParams;
  // Si el `?cohort` no pertenece al entorno activo, cae a la primera del scope.
  const selectedCohortId = cohorts.some((c) => c.id === params.cohort)
    ? (params.cohort as string)
    : cohorts[0].id;

  const cohortOptions = cohorts.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    programName: (c.programs as { name: string } | null)?.name ?? "",
  }));

  const report = await getCohortProgressReport(selectedCohortId);

  if (!report) {
    return (
      <div className="ca-fade-up mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
        <div className="mb-7">
          <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
            Operaciones · Reportes
          </div>
          <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">
            Progreso de la cohorte
          </h1>
        </div>
        <CohortSelector cohorts={cohortOptions} selectedId={selectedCohortId} />
        <p className="mt-4 text-ca-ink-soft">No se encontró la cohorte seleccionada.</p>
      </div>
    );
  }

  const { cohort, program, modules, students } = report;

  const allPcts = students.flatMap((s) => s.module_progress.map((m) => m.percentage));
  const cohortAvg = allPcts.length > 0 ? Math.round(allPcts.reduce((a, b) => a + b, 0) / allPcts.length) : 0;
  const behind = students.filter((s) => s.overall_percentage < 30).length;
  const complete = students.filter((s) => s.overall_percentage >= 90).length;

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-7">
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Operaciones · Reportes
        </div>
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">
          Progreso de la cohorte
        </h1>
        <p className="mt-1 text-[14px] font-semibold text-ca-ink-soft">
          {(program as { name: string }).name} · {cohort.name} · {students.length} alumnos activos
        </p>
      </div>

      <CohortSelector cohorts={cohortOptions} selectedId={selectedCohortId} />

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Promedio cohorte", value: `${cohortAvg}%`, tone: "var(--color-ca-violet)" },
          { label: "Completaron todo", value: `${complete}`, sub: `de ${students.length} alumnos`, tone: "var(--color-ca-lime-deep)" },
          { label: "En riesgo (<30%)", value: `${behind}`, sub: "requieren outreach", tone: "#e11d48" },
          { label: "Total alumnos", value: `${students.length}`, sub: "activos en la cohorte", tone: "var(--color-ca-navy)" },
        ].map((s) => (
          <div key={s.label} className="ca-card relative overflow-hidden p-5">
            <div className="shape-circle absolute -right-4 -top-4 h-16 w-16 opacity-[0.08]" style={{ background: s.tone }} />
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">{s.label}</div>
            <div className="mt-2 font-mono text-[32px] font-black tracking-tight" style={{ color: s.tone }}>{s.value}</div>
            {s.sub && <div className="text-[11px] font-semibold text-ca-ink-soft">{s.sub}</div>}
          </div>
        ))}
      </div>

      <ProgressTable
        students={students}
        modules={(modules ?? []) as Array<{ id: string; title: string; position: number }>}
      />
    </div>
  );
}
