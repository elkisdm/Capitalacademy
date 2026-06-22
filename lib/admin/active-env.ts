import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Entorno activo (program_id) y modo de vista del staff. Ambos viven en cookies
 * para persistir en TODO el panel admin (no en la URL), sobreviviendo navegación
 * y recarga. Esto unifica el scope por programa que antes estaba fragmentado en
 * cada página (Usuarios con filtro client-side, Lecciones/Recursos con `?program`).
 *
 * Es un concepto de VISTA, no de permisos: el staff sigue siendo admin global y
 * RLS no cambia. Solo decide qué entorno se muestra por defecto.
 */
export const ENV_COOKIE = "ca_admin_env";
export const VIEW_MODE_COOKIE = "ca_view_mode";

export type ViewMode = "admin" | "student";
export type EnvOption = { id: string; name: string };

/** program_id del entorno activo, o `null` cuando es "Todos los entornos". */
export async function getActiveEnv(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(ENV_COOKIE)?.value;
  return value && value !== "all" ? value : null;
}

/** Modo de vista del staff. Por defecto `admin`. */
export async function getViewMode(): Promise<ViewMode> {
  const store = await cookies();
  return store.get(VIEW_MODE_COOKIE)?.value === "student" ? "student" : "admin";
}

/** Lista de entornos (programas) para poblar el selector. */
export async function getEnvOptions(): Promise<EnvOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("programs")
    .select("id, name")
    .order("name", { ascending: true });
  return (data ?? []) as EnvOption[];
}

/**
 * Resuelve el program_id efectivo para una página que también acepta `?program`.
 * Precedencia: param de URL válido > cookie de entorno > primer programa.
 * Devuelve `null` solo si no hay programas.
 */
export function resolveProgramScope(
  paramProgramId: string | undefined,
  cookieEnv: string | null,
  options: EnvOption[],
): string | null {
  if (options.length === 0) return null;
  const fromParam = options.find((p) => p.id === paramProgramId)?.id;
  if (fromParam) return fromParam;
  const fromCookie = options.find((p) => p.id === cookieEnv)?.id;
  if (fromCookie) return fromCookie;
  return options[0].id;
}
