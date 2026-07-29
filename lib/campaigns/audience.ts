/**
 * Resolución de la audiencia de un envío masivo (comunicados y encuestas).
 *
 * Unifica la query que hoy está copiada a mano en cada script one-off
 * (`scripts/send-novedades-alumnos.mjs` y hermanos) y en `lib/deliverables/notify.ts`.
 *
 * Dos reglas que NO son obvias y por eso viven aquí y no en cada llamador:
 *
 * 1. **Se excluye al staff.** Se filtra `profiles.role = 'student'` igual que los
 *    scripts. Sin ese filtro, un comunicado del Ciclo CI (239 matrículas, equipo
 *    interno incluido) le llega al propio equipo como si fuera alumnado. La
 *    columna `role` es la legacy (`student|teacher|ops|admin`), distinta de
 *    `system_role` que gobierna permisos: aquí solo se usa para decidir a quién
 *    se le habla, nunca para autorizar.
 * 2. **Dedup por correo, no por matrícula.** Una misma persona puede tener dos
 *    matrículas en el mismo programa (dos cohortes/generaciones). Sin dedup
 *    recibiría el mismo correo dos veces.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type CampaignRecipient = {
  studentId: string;
  email: string;
  fullName: string;
};

export type AudienceFilter = {
  programId: string;
  /** null/undefined = todas las cohortes del programa. */
  cohortId?: string | null;
  /** Estados de matrícula incluidos. Por defecto solo `active`. */
  statuses?: string[];
  /** Segmento de `enrollments.segment` (0024). null = sin filtro. */
  segment?: string | null;
};

/** Estados de matrícula que tiene sentido ofrecer en un envío. */
export const AUDIENCE_STATUSES = ["active", "invited", "completed", "suspended"] as const;

type EnrollmentRow = {
  student_id: string;
  profiles: { email: string | null; full_name: string | null; role: string | null } | null;
};

/**
 * El cliente llega por parámetro (y no se crea aquí) para que los llamadores
 * reusen el suyo y los tests puedan inyectar un doble.
 */
export async function resolveAudience(
  admin: SupabaseClient<Database>,
  filter: AudienceFilter,
): Promise<CampaignRecipient[]> {
  const statuses = filter.statuses?.length ? filter.statuses : ["active"];

  let query = admin
    .from("enrollments")
    .select("student_id, profiles!inner(email, full_name, role), cohorts!inner(program_id)")
    .eq("cohorts.program_id", filter.programId)
    .in("status", statuses as ("active" | "invited" | "completed" | "suspended" | "dropped")[]);

  if (filter.cohortId) query = query.eq("cohort_id", filter.cohortId);
  if (filter.segment) query = query.eq("segment", filter.segment);

  const { data, error } = (await query) as unknown as {
    data: EnrollmentRow[] | null;
    error: { message?: string } | null;
  };

  if (error) {
    throw new Error(`No se pudo resolver la audiencia: ${error.message ?? "error desconocido"}`);
  }

  const byEmail = new Map<string, CampaignRecipient>();
  for (const row of data ?? []) {
    const profile = row.profiles;
    const email = profile?.email?.trim().toLowerCase();
    if (!email) continue;
    if (profile?.role !== "student") continue;
    if (byEmail.has(email)) continue;
    byEmail.set(email, {
      studentId: row.student_id,
      email,
      fullName: profile.full_name ?? "",
    });
  }

  return [...byEmail.values()];
}
