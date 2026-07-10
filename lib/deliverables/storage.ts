import { createAdminClient } from "@/lib/supabase/admin";

export const DELIVERABLES_BUCKET = "deliverables";
// 1 hora: el alumno/staff recarga la página y obtiene una URL fresca (igual
// que recursos y certificados). Suficiente para iniciar la descarga.
const DELIVERABLE_URL_EXPIRY = 3_600;

type ResolvableSubmission = {
  storage_path?: string | null;
  [key: string]: unknown;
};

/**
 * Firma en un solo lote las URLs de descarga de un conjunto de entregas
 * (`deliverable_submissions`). Espejo de `resolveResourceUrls` pero contra el
 * bucket privado `deliverables`. `download: true` fuerza Content-Disposition:
 * attachment para que HTML/SVG no se ejecuten inline en el navegador.
 */
export async function resolveDeliverableUrls<T extends ResolvableSubmission>(
  rows: T[],
): Promise<(T & { signedUrl: string | null })[]> {
  if (rows.length === 0) return [];

  const paths = rows
    .map((r) => r.storage_path)
    .filter((p): p is string => Boolean(p));
  if (paths.length === 0) {
    return rows.map((r) => ({ ...r, signedUrl: null }));
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(DELIVERABLES_BUCKET)
    .createSignedUrls(paths, DELIVERABLE_URL_EXPIRY, { download: true });

  if (error || !data) {
    console.error("deliverable signed url error", error);
    return rows.map((r) => ({ ...r, signedUrl: null }));
  }

  const signedByPath = new Map<string, string | null>();
  data.forEach((entry) => {
    if (entry.path) signedByPath.set(entry.path, entry.signedUrl ?? null);
  });

  return rows.map((r) => ({
    ...r,
    signedUrl: r.storage_path ? (signedByPath.get(r.storage_path) ?? null) : null,
  }));
}
