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
