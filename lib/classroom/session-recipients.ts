import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type SessionRecipient = {
  studentId: string;
  email: string;
  fullName: string | null;
};

/**
 * A quién le toca una clase concreta: matrículas ACTIVAS de su cohorte.
 *
 * Es la misma cuenta que hace el cron de recordatorios, extraída acá para que el
 * aviso de reprogramación (0094) le escriba exactamente al mismo grupo. Si las
 * dos listas se separan, alguien recibe el recordatorio con la hora vieja y no
 * recibe la corrección — que es el peor de los dos mundos.
 *
 * El filtro por `audience` importa: una clase marcada para el segmento interno
 * de Capital Inteligente no le corresponde al resto de la cohorte.
 */
export async function getSessionRecipients(
  admin: SupabaseClient<Database>,
  session: { cohort_id: string; audience?: string | null },
): Promise<SessionRecipient[]> {
  let query = admin
    .from("enrollments")
    .select("student_id, profiles(email, full_name)")
    .eq("cohort_id", session.cohort_id)
    .eq("status", "active")
    .order("student_id", { ascending: true });

  if (session.audience === "capital_inteligente") {
    query = query.eq("segment", "capital_inteligente");
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`No se pudo resolver a quién avisar: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    student_id: string;
    profiles: { email: string; full_name: string | null } | null;
  }>;

  // Dedup por correo: una persona con dos matrículas en la cohorte no recibe el
  // aviso dos veces.
  const byEmail = new Map<string, SessionRecipient>();
  for (const row of rows) {
    const email = row.profiles?.email?.trim().toLowerCase();
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, {
      studentId: row.student_id,
      email,
      fullName: row.profiles?.full_name ?? null,
    });
  }

  return [...byEmail.values()];
}
