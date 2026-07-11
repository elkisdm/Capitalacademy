/**
 * Detección pura del tipo de visor a usar para un recurso de clase/lección.
 *
 * Invariante de seguridad: HTML y SVG NUNCA se renderizan inline (iframe/img
 * directo) porque podrían ejecutar script arbitrario servido desde el mismo
 * origen firmado; siempre se degradan a `'download'` (Content-Disposition:
 * attachment vía `resolveResourceUrls`).
 */

export type ViewerKind = "pdf" | "office" | "image" | "external" | "download";

const OFFICE_EXTENSIONS = new Set(["ppt", "pptx", "doc", "docx", "xls", "xlsx"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

type DetectViewerKindInput = {
  storagePath: string | null;
  url: string | null;
  type: string;
};

function extractExtension({ storagePath, url }: Pick<DetectViewerKindInput, "storagePath" | "url">): string | null {
  const source = storagePath || urlPathname(url);
  if (!source) return null;
  const lastSegment = source.split("/").pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === lastSegment.length - 1) return null;
  return lastSegment.slice(dotIndex + 1).toLowerCase();
}

function urlPathname(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname;
  } catch {
    // URL relativa o inválida: se usa tal cual como "pathname".
    return url;
  }
}

export function detectViewerKind({ storagePath, url, type }: DetectViewerKindInput): ViewerKind {
  const ext = extractExtension({ storagePath, url });

  if (type === "link" || (!storagePath && !ext)) {
    return "external";
  }

  if (ext === "pdf") return "pdf";
  if (ext && OFFICE_EXTENSIONS.has(ext)) return "office";
  if (ext && IMAGE_EXTENSIONS.has(ext)) return "image";
  // svg incluido aquí a propósito: nunca inline (ver invariante arriba).
  return "download";
}

/**
 * URL de embed de Microsoft Office Online para previsualizar Office
 * (pptx/doc/docx/xls/xlsx). CRÍTICO: `encodeURIComponent` sobre la signed URL
 * completa, incluyendo su querystring (`?token=...`), para no truncarla.
 */
export function officeEmbedUrl(viewUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewUrl)}`;
}
