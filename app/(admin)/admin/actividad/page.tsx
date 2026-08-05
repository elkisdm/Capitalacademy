import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCohortActivityReport } from "@/lib/admin/actividad-queries";
import { formatActiveDuration, resolveRangeDays } from "@/lib/classroom/actividad";
import { formatDateOnly } from "@/lib/time";
import { getActiveEnv } from "@/lib/admin/active-env";
import { StatStrip } from "@/components/admin/students/shared";
import { ActividadTable } from "@/components/admin/actividad-table";
import { ActividadFiltros } from "./filtros";

export default async function AdminActividadPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string; dias?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: allCohorts } = await supabase
    .from("cohorts")
    .select("id, name, code, status, program_id, programs(name)")
    .order("created_at", { ascending: false });

  // Scope al entorno activo, igual que /admin/progress.
  const activeEnv = await getActiveEnv();
  const cohorts = activeEnv
    ? (allCohorts ?? []).filter((c) => c.program_id === activeEnv)
    : allCohorts ?? [];

  if (cohorts.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-2xl font-black text-ca-ink">Actividad de los alumnos</h1>
        <p className="mt-4 text-ca-ink-soft">
          {activeEnv
            ? "Este entorno no tiene cohortes registradas."
            : "No hay cohortes registradas."}
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const selectedCohortId = cohorts.some((c) => c.id === params.cohort)
    ? (params.cohort as string)
    : cohorts[0].id;

  const rangeDays = resolveRangeDays(params.dias);

  const cohortOptions = cohorts.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    programName: (c.programs as { name: string } | null)?.name ?? "",
  }));

  const report = await getCohortActivityReport(selectedCohortId, rangeDays);

  const header = (
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Operaciones · Reportes
        </div>
        <h1 className="mt-1 text-[24px] font-black tracking-[-0.025em] text-ca-ink">
          Actividad de los alumnos
        </h1>
        {report && (
          <p className="mt-1 text-[14px] font-semibold text-ca-ink-soft">
            {report.program.name} · {report.cohort.name} ·{" "}
            {report.students.length} alumnos activos
          </p>
        )}
      </div>

      <ActividadFiltros
        cohorts={cohortOptions}
        selectedId={selectedCohortId}
        rangeDays={rangeDays}
      />
    </div>
  );

  if (!report) {
    return (
      <div className="ca-fade-up mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
        {header}
        <p className="mt-4 text-ca-ink-soft">No se encontró la cohorte seleccionada.</p>
      </div>
    );
  }

  const { summary, students, fromDate, toDate } = report;

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
      {header}

      <StatStrip
        items={[
          {
            label: "Usaron la plataforma",
            value: `${summary.used_platform}`,
            sub: `de ${summary.total_students} alumnos`,
            tone: "var(--color-ca-violet)",
          },
          {
            label: "Tiempo promedio",
            value: formatActiveDuration(summary.avg_seconds_per_student),
            sub: "por alumno en el rango",
            tone: "var(--color-ca-navy)",
          },
          {
            label: "Vistos esta semana",
            value: `${summary.active_last_7}`,
            sub: "entraron en los últimos 7 días",
            tone: "var(--color-ca-lime-deep)",
          },
          {
            label: "Inactivos",
            value: `${summary.at_risk}`,
            sub: "14+ días sin entrar o nunca",
            tone: "#e11d48",
          },
        ]}
      />

      <p className="mb-4 text-[12px] font-semibold text-ca-ink-soft">
        Del{" "}
        {formatDateOnly(fromDate, { day: "2-digit", month: "long" })} al{" "}
        {formatDateOnly(toDate, { day: "2-digit", month: "long", year: "numeric" })} (hora
        de Chile). Se mide el <strong>tiempo con la plataforma abierta y visible</strong>,
        que no es lo mismo que horas de estudio: sirve para detectar quién dejó de
        entrar, no para evaluar desempeño. La medición arranca el día que se activó
        el registro, así que no hay datos anteriores a esa fecha.
      </p>

      <ActividadTable students={students} />
    </div>
  );
}
