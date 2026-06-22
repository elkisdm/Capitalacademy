import { createAdminClient } from "@/lib/supabase/admin";

const RESOURCE_BUCKET = "lesson-resources";
// 1 hora: el alumno recarga la página y obtiene una URL fresca (igual que los
// certificados). Suficiente para iniciar la descarga.
const RESOURCE_URL_EXPIRY = 3_600;

type ResolvableResource = {
  url: string | null;
  storage_path?: string | null;
  [key: string]: unknown;
};

/**
 * Resuelve la URL servible de cada recurso de lección.
 *
 * - Link externo (`storage_path` vacío): se devuelve la `url` tal cual.
 * - Archivo subido (`storage_path` presente): se firma una signed URL temporal
 *   contra el bucket privado, con `download` forzado (Content-Disposition:
 *   attachment) para que HTML/SVG no se ejecuten inline en el navegador.
 *
 * Las firmas se generan en un solo lote para no abrir una conexión por recurso.
 */
export async function resolveResourceUrls<T extends ResolvableResource>(
  resources: T[],
): Promise<T[]> {
  const uploaded = resources.filter((r) => r.storage_path);
  if (uploaded.length === 0) return resources;

  const supabase = createAdminClient();
  const paths = uploaded.map((r) => r.storage_path as string);
  const { data, error } = await supabase.storage
    .from(RESOURCE_BUCKET)
    .createSignedUrls(paths, RESOURCE_URL_EXPIRY, { download: true });

  if (error || !data) {
    console.error("resource signed url error", error);
    // Degradar con gracia: sin URL el recurso no se podrá abrir, pero no rompe
    // la página de la lección.
    return resources.map((r) => (r.storage_path ? { ...r, url: null } : r));
  }

  const signedByPath = new Map<string, string | null>();
  data.forEach((entry) => {
    if (entry.path) signedByPath.set(entry.path, entry.signedUrl ?? null);
  });

  return resources.map((r) =>
    r.storage_path
      ? { ...r, url: signedByPath.get(r.storage_path) ?? null }
      : r,
  );
}
