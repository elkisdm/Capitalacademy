import { createClient } from "@/lib/supabase/server";
import {
  activityRiskLevel,
  chileDateKey,
  daysBetweenDateKeys,
  shiftDateKey,
  type ActivityRiskLevel,
} from "@/lib/classroom/actividad";

/**
 * Reportes de actividad del alumno para el panel de operaciones (ADR-0029).
 *
 * Responde las tres preguntas de la reunión del 29-jul: quién usa la
 * plataforma, cuánto tiempo, y quién está inactivo.
 *
 * OJO CON EL DATO: `total_seconds` es tiempo con la plataforma ABIERTA Y
 * VISIBLE, no horas de estudio. Sirve para detectar ausencia, no para evaluar
 * desempeño — para eso están las evaluaciones (ADR-0018/0022).
 *
 * La agregación se hace en TypeScript sobre filas crudas, igual que
 * getCohortProgressReport: la tabla ya viene agregada por día, así que el
 * volumen es (alumnos × días del rango), del orden de cientos de filas.
 */

export type StudentActivity = {
  student_id: string;
  enrollment_id: string;
  full_name: string;
  email: string;
  initials: string;
  /** Segundos con la plataforma abierta y visible en el rango. */
  total_seconds: number;
  /** Días distintos en que se le vio al menos un latido. */
  active_days: number;
  /** Promedio por día en que efectivamente entró (no por día del rango). */
  avg_seconds_per_active_day: number;
  /** Día calendario de Chile del último latido; null si nunca entró. */
  last_active_date: string | null;
  /** Días desde el último latido; null si nunca entró. */
  days_since_last_active: number | null;
  risk: ActivityRiskLevel;
};

export type ActivityRow = {
  enrollment_id: string;
  activity_date: string;
  active_seconds: number;
};

export type EnrollmentRef = {
  enrollment_id: string;
  student_id: string;
  full_name: string | null;
  email: string;
};

/**
 * Cruza las matrículas con sus filas diarias y produce una fila por alumno.
 * Pura y sin dependencias de red: es donde vive toda la lógica del reporte.
 *
 * `today` se recibe como parámetro (y no se lee del reloj acá) para que el
 * cálculo de "días sin entrar" sea determinista y testeable.
 */
export function buildActivityRows(
  enrollments: EnrollmentRef[],
  rows: ActivityRow[],
  today: string,
): StudentActivity[] {
  const byEnrollment = new Map<string, ActivityRow[]>();
  for (const row of rows) {
    const list = byEnrollment.get(row.enrollment_id) ?? [];
    list.push(row);
    byEnrollment.set(row.enrollment_id, list);
  }

  const students = enrollments.map((enr) => {
    const name = enr.full_name ?? enr.email ?? "Alumno";
    const initials = name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const own = byEnrollment.get(enr.enrollment_id) ?? [];

    // Solo cuentan como "día activo" los días con tiempo acreditado: una fila
    // con 0 segundos es alguien que abrió y cerró sin quedarse.
    const withTime = own.filter((r) => Number(r.active_seconds) > 0);
    const totalSeconds = withTime.reduce((sum, r) => sum + Number(r.active_seconds), 0);
    const activeDays = withTime.length;

    const lastActiveDate =
      withTime.length > 0
        ? withTime.map((r) => r.activity_date).sort().reverse()[0]
        : null;

    const daysSince = lastActiveDate ? daysBetweenDateKeys(lastActiveDate, today) : null;

    return {
      student_id: enr.student_id,
      enrollment_id: enr.enrollment_id,
      full_name: name,
      email: enr.email ?? "",
      initials,
      total_seconds: totalSeconds,
      active_days: activeDays,
      avg_seconds_per_active_day:
        activeDays > 0 ? Math.round(totalSeconds / activeDays) : 0,
      last_active_date: lastActiveDate,
      days_since_last_active: daysSince,
      risk: activityRiskLevel(daysSince),
    };
  });

  // Más tiempo primero; quien nunca entró queda al final, que es justo donde
  // el equipo lo tiene que ir a buscar.
  students.sort((a, b) => b.total_seconds - a.total_seconds);
  return students;
}

export type ActivitySummary = {
  total_students: number;
  /** Alumnos con al menos un día activo en el rango. */
  used_platform: number;
  /** Alumnos vistos en los últimos 7 días. */
  active_last_7: number;
  /** Alumnos con 14+ días sin aparecer, o que nunca aparecieron. */
  at_risk: number;
  /** Segundos sumados de toda la cohorte en el rango. */
  total_seconds: number;
  /** Promedio por alumno del curso, contando también a los que no entraron. */
  avg_seconds_per_student: number;
};

export function summarizeActivity(students: StudentActivity[]): ActivitySummary {
  const total = students.length;
  const totalSeconds = students.reduce((sum, s) => sum + s.total_seconds, 0);

  return {
    total_students: total,
    used_platform: students.filter((s) => s.active_days > 0).length,
    active_last_7: students.filter(
      (s) => s.days_since_last_active !== null && s.days_since_last_active <= 7,
    ).length,
    at_risk: students.filter((s) => s.risk === "risk").length,
    total_seconds: totalSeconds,
    avg_seconds_per_student: total > 0 ? Math.round(totalSeconds / total) : 0,
  };
}

export type CohortActivityReport = {
  cohort: { id: string; name: string };
  program: { id: string; name: string };
  rangeDays: number;
  fromDate: string;
  toDate: string;
  students: StudentActivity[];
  summary: ActivitySummary;
};

export async function getCohortActivityReport(
  cohortId: string,
  rangeDays = 30,
): Promise<CohortActivityReport | null> {
  const supabase = await createClient();

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("id, name, program_id, programs(id, name)")
    .eq("id", cohortId)
    .single();

  if (!cohort) return null;

  const program = (cohort.programs as { id: string; name: string } | null) ?? {
    id: cohort.program_id as string,
    name: "",
  };

  const today = chileDateKey();
  // rangeDays - 1: un rango de 30 días incluye hoy y los 29 anteriores.
  const fromDate = shiftDateKey(today, -(rangeDays - 1));

  const base = {
    cohort: { id: cohort.id as string, name: cohort.name as string },
    program,
    rangeDays,
    fromDate,
    toDate: today,
  };

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, student_id, profiles(full_name, email)")
    .eq("cohort_id", cohortId)
    .eq("status", "active");

  const refs: EnrollmentRef[] = (enrollments ?? []).map((e) => {
    const profile = e.profiles as { full_name: string | null; email: string } | null;
    return {
      enrollment_id: e.id as string,
      student_id: e.student_id as string,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? "",
    };
  });

  if (refs.length === 0) {
    return { ...base, students: [], summary: summarizeActivity([]) };
  }

  const { data: activity, error } = await supabase
    .from("student_activity_daily")
    .select("enrollment_id, activity_date, active_seconds")
    .in(
      "enrollment_id",
      refs.map((r) => r.enrollment_id),
    )
    .gte("activity_date", fromDate);

  if (error) throw error;

  const students = buildActivityRows(refs, (activity ?? []) as ActivityRow[], today);

  return { ...base, students, summary: summarizeActivity(students) };
}
