import { createAdminClient } from "@/lib/supabase/admin";

export type PublicAuthor = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  /** Booleano derivado de rol (admin/ops). NO es PII — no expone el rol crudo. */
  is_staff: boolean;
};

/**
 * Resuelve el "autor público" (SOLO id + nombre + avatar) de un conjunto de
 * usuarios, vía service-role, seleccionando explícitamente esas 3 columnas.
 *
 * La policy RLS de `profiles` está cerrada a dueño + staff (migración 0045),
 * así que un alumno NO puede leer la fila de otro (RUT, dirección, contacto de
 * emergencia, etc.) ni por la app ni por la API REST directa. Para mostrar el
 * autor de hilos/comentarios del foro se usa este helper server-side, que nunca
 * expone más que id/nombre/avatar.
 */
export async function getPublicAuthorsMap(
  ids: (string | null | undefined)[],
): Promise<Map<string, PublicAuthor>> {
  const map = new Map<string, PublicAuthor>();
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return map;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, system_role, role")
    .in("id", unique);

  for (const row of (data ?? []) as Array<{
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    system_role: string | null;
    role: string | null;
  }>) {
    const effectiveRole = row.system_role ?? row.role;
    map.set(row.id, {
      id: row.id,
      full_name: row.full_name ?? "Usuario",
      avatar_url: row.avatar_url ?? null,
      is_staff: effectiveRole === "admin" || effectiveRole === "ops",
    });
  }
  return map;
}
