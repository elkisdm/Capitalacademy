import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * `getUser()` deduplicado por request vía React `cache()`.
 *
 * `supabase.auth.getUser()` hace un round-trip al Auth server de Supabase para
 * validar el JWT (no es una lectura local). El layout del classroom y cada page
 * lo necesitan, y sin memoización cada uno pagaba su propia llamada de red en la
 * misma navegación. `cache()` dedupe todas esas llamadas dentro de un mismo
 * render, dejando un solo round-trip por request.
 *
 * Nota: `cache()` es per-request (no cruza requests ni usuarios), así que es
 * seguro para datos de sesión.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getUser();
});

/**
 * Perfil propio (`profiles`) deduplicado por request vía React `cache()`.
 *
 * El layout del classroom y varias pages repetían el mismo
 * `.from("profiles").select(...).eq("id", user.id)` dentro del mismo request.
 * El select cubre el superset de columnas que consume cada consumidor
 * (layout, home, quiz, clase, conversaciones, lección, guía). La page de
 * edición de perfil (`classroom/profile`) selecciona campos adicionales y
 * mantiene su propio query.
 */
export const getViewerProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("full_name, role, system_role, onboarding_completed_at, avatar_url")
    .eq("id", userId)
    .single();
  return data;
});
