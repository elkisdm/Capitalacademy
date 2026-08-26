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
 * 3. **La selección manual se INTERSECTA con el filtro, no lo reemplaza** (0092).
 *    Quien fue elegido a mano pero ya no cumple el filtro —se retiró, cambió de
 *    estado— queda fuera igual. Así una lista guardada hace dos semanas no puede
 *    escribirle a alguien que hoy no corresponde.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { isRealStudent } from "@/lib/profiles/account-type";

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
  /**
   * Selección manual de destinatarios (0092). null/undefined = toda la audiencia
   * del filtro. Se intersecta con el resultado del filtro, nunca lo reemplaza.
   */
  studentIds?: string[] | null;
};

/** Estados de matrícula que tiene sentido ofrecer en un envío. */
export const AUDIENCE_STATUSES = ["active", "invited", "completed", "suspended"] as const;

type EnrollmentRow = {
  student_id: string;
  profiles: {
    email: string | null;
    full_name: string | null;
    role: string | null;
    account_type: string | null;
  } | null;
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
    .select(
      "student_id, profiles!inner(email, full_name, role, account_type), cohorts!inner(program_id)",
    )
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

  // La selección manual se aplica en memoria y no en la query: la lista puede
  // traer ids que ya no cumplen el filtro, y filtrar acá deja que el resto de
  // las reglas (staff fuera, dedup por correo) sigan corriendo igual.
  const selected = filter.studentIds?.length ? new Set(filter.studentIds) : null;

  const byEmail = new Map<string, CampaignRecipient>();
  for (const row of data ?? []) {
    const profile = row.profiles;
    const email = profile?.email?.trim().toLowerCase();
    if (!email) continue;
    if (profile?.role !== "student") continue;
    // El filtro por `role` no alcanza: dos personas del equipo tienen cuenta
    // con role='student' (ADR-0037). La etiqueta explícita sí las atrapa.
    if (!isRealStudent(profile)) continue;
    if (selected && !selected.has(row.student_id)) continue;
    if (byEmail.has(email)) continue;
    byEmail.set(email, {
      studentId: row.student_id,
      email,
      fullName: profile.full_name ?? "",
    });
  }

  return [...byEmail.values()];
}
