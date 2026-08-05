import { createClient } from "@/lib/supabase/server";
import { uuidLike } from "@/lib/utils/zod";
import { INSTRUCTOR_PROFILE_COLUMNS, type InstructorProfile } from "./types";

/**
 * Ficha de un docente para la pantalla de perfil del alumno (ADR-0028).
 *
 * NO lleva chequeo de autorización propio a propósito: lo hace la RLS. La policy
 * `instructors_program_scoped_select` (migración 0059) solo devuelve la fila si
 * quien consulta es platform staff o tiene `has_program_access()` en algún
 * programa donde ese instructor dicta sesiones. Para un alumno de otro programa
 * la consulta devuelve `null` y el caller responde `notFound()` — el mismo
 * resultado que para un id inexistente, así que la pantalla no filtra si el
 * instructor existe o no.
 *
 * NO se filtra por `is_active`: un docente dado de baja sigue apareciendo en el
 * calendario de las clases que ya dictó, y sus enlaces deben seguir llevando a
 * alguna parte en vez de romperse.
 *
 * El guard de UUID evita que un id basura llegue a Postgres y vuelva como error
 * 22P02 (`invalid input syntax for type uuid`), que reventaría la página con un
 * 500 en vez del 404 que corresponde.
 */
export async function getInstructorProfile(
  instructorId: string,
): Promise<InstructorProfile | null> {
  if (!uuidLike.safeParse(instructorId).success) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("instructors")
    .select(INSTRUCTOR_PROFILE_COLUMNS)
    .eq("id", instructorId)
    .maybeSingle();

  if (error) {
    console.error("[getInstructorProfile] error leyendo instructors", {
      instructorId,
      code: error.code,
      message: error.message,
    });
    // Un fallo de infraestructura NO puede presentarse como "este docente no
    // existe". El precedente concreto es el statement timeout 57014 del 21-jul
    // (cascada de RLS, migración 0079): repetido hoy, cada ficha respondería un
    // 404 tranquilizador, nadie se enteraría del outage y no hay Sentry que lo
    // levante. Se relanza para que la página falle de forma visible.
    //
    // El 404 se reserva para "no hay fila", que es lo que devuelve `data: null`
    // sin error, y que cubre por igual "no existe" y "la RLS no te lo deja ver"
    // — sin esa distinción no se pueden enumerar docentes.
    if (error.code !== "PGRST116") throw error;
    return null;
  }
  return (data as unknown as InstructorProfile | null) ?? null;
}

/**
 * Puente `profiles.id` → `instructors.id` (ADR-0028 §4).
 *
 * `program_modules.teacher_id` apunta a `profiles`, no a `instructors`: la card
 * "Profesor" del módulo y el chip de la lección salen de esa otra fuente. Para
 * poder enlazarlas al perfil sin migrar el modelo de datos, se resuelve el
 * `profile_id` contra el catálogo de docentes.
 *
 * Devuelve un Map con SOLO los que la RLS dejó ver: un profesor que no dicta
 * ninguna sesión en vivo del programa del alumno no aparece, y la UI degrada a
 * texto plano como hoy. Nada impide dos fichas con el mismo `profile_id`
 * (`lib/docente/queries.ts` ya deduplica por ese caso), así que se ordena por
 * `created_at` y gana la primera: determinista, no al azar.
 *
 * Degrada a un Map vacío ante cualquier fallo — es un enriquecimiento de la UI,
 * nunca motivo para tumbar la página del módulo.
 */
export async function getInstructorIdsByProfileIds(
  profileIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const valid = [...new Set(profileIds.filter((id) => uuidLike.safeParse(id).success))];
  if (valid.length === 0) return map;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("instructors")
      .select("id, profile_id")
      .in("profile_id", valid)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    for (const row of (data ?? []) as Array<{ id: string; profile_id: string | null }>) {
      if (!row.profile_id || map.has(row.profile_id)) continue;
      map.set(row.profile_id, row.id);
    }
  } catch (e) {
    console.error("[getInstructorIdsByProfileIds] degradando (sin enlace al perfil)", e);
  }
  return map;
}
