import { createAdminClient } from "@/lib/supabase/admin";

const RESOURCE_BUCKET = "lesson-resources";
// 2 horas: el alumno recarga la página y obtiene una URL fresca (igual que los
// certificados, pero con más margen porque ahora la misma URL alimenta el
// visor in-app además de la descarga).
const RESOURCE_URL_EXPIRY = 7_200;

type ResolvableResource = {
  url: string | null;
  viewUrl?: string | null;
  storage_path?: string | null;
  [key: string]: unknown;
};

/**
 * Resuelve las URLs servibles de cada recurso de lección.
 *
 * - Link externo (`storage_path` vacío): se devuelve la `url` tal cual y
 *   `viewUrl = null` (nunca se previsualiza en el visor, se abre aparte).
 * - Archivo subido (`storage_path` presente): se firma una signed URL temporal
 *   SIN `download` (`viewUrl`), apta para previsualizar (fetch/iframe/img).
 *   `url` se deriva de esa misma firma anexando `&download=`, que fuerza
 *   Content-Disposition: attachment para que HTML/SVG no se ejecuten inline
 *   en el navegador cuando el alumno descarga.
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
    .createSignedUrls(paths, RESOURCE_URL_EXPIRY);

  if (error || !data) {
    console.error("resource signed url error", error);
    // Degradar con gracia: sin URL el recurso no se podrá abrir, pero no rompe
    // la página de la lección.
    return resources.map((r) =>
      r.storage_path ? { ...r, url: null, viewUrl: null } : r,
    );
  }

  const signedByPath = new Map<string, string | null>();
  data.forEach((entry) => {
    if (entry.path) signedByPath.set(entry.path, entry.signedUrl ?? null);
  });

  return resources.map((r) => {
    if (!r.storage_path) return r;
    const signedUrl = signedByPath.get(r.storage_path) ?? null;
    return {
      ...r,
      viewUrl: signedUrl,
      url: signedUrl ? `${signedUrl}&download=` : null,
    };
  });
}
