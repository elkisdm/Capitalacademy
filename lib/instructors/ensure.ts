import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Puente entre las DOS cosas que la plataforma llama "profesor" (ADR-0036).
 *
 * `cohort_roles(role='teacher')` son PERMISOS sobre una cohorte y apuntan a
 * `profiles`. `instructors` es la IDENTIDAD PÚBLICA del docente (foto, titular,
 * reseña, redes) y es a donde apunta `class_sessions.teacher_id`. Son cosas
 * distintas a propósito: un relator invitado dicta una clase sin permisos sobre
 * la cohorte, y un asistente tiene permisos sin ser cara visible.
 *
 * El problema que esto cierra es que el puente (`instructors.profile_id`) era
 * manual: asignar el rol docente NO creaba ficha, y sin ficha la persona no
 * aparecía en el selector al crear una clase — que lee solo `instructors`.
 *
 * Idempotente: si ya existe una ficha enlazada a esa cuenta, la devuelve sin
 * tocarla. NUNCA reactiva una ficha desactivada a propósito ni pisa el nombre
 * de una ficha existente: la ficha es la identidad publicable y su contenido lo
 * gobierna operaciones desde `/admin/docentes`.
 */
export type EnsuredInstructor = {
  id: string;
  full_name: string;
  created: boolean;
};

export async function ensureInstructorForProfile(
  supabase: SupabaseClient,
  profileId: string,
): Promise<{ data: EnsuredInstructor | null; error: string | null }> {
  const { data: existing, error: readError } = await supabase
    .from("instructors")
    .select("id, full_name")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Un fallo de lectura NO se degrada a "no existe": crear una segunda ficha
  // para la misma persona duplica su identidad pública y ensucia el selector.
  if (readError) return { data: null, error: readError.message };
  if (existing) {
    return {
      data: { id: existing.id as string, full_name: existing.full_name as string, created: false },
      error: null,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) return { data: null, error: profileError.message };
  if (!profile) return { data: null, error: "La cuenta no existe" };

  // El nombre es lo único que se copia. El resto de la ficha (titular, reseña,
  // redes, foto) lo completa la propia persona en `/docente/perfil` o el equipo
  // en `/admin/docentes`: inventarlo acá sería publicar datos que nadie escribió.
  const fullName = (profile.full_name as string | null)?.trim();
  if (!fullName) return { data: null, error: "La cuenta no tiene nombre" };

  const { data: created, error: insertError } = await supabase
    .from("instructors")
    .insert({ full_name: fullName, profile_id: profileId, is_active: true })
    .select("id, full_name")
    .single();

  if (insertError) return { data: null, error: insertError.message };

  return {
    data: { id: created.id as string, full_name: created.full_name as string, created: true },
    error: null,
  };
}
