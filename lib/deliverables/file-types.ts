// Categorías de tipo de archivo aceptadas por un entregable. Compartido por la
// API de subida (validación server-side) y la UI (labels + atributo `accept`).

export const CATEGORY_EXTENSIONS: Record<string, string[]> = {
  pdf: [".pdf"],
  word: [".doc", ".docx"],
  excel: [".xls", ".xlsx"],
  image: [".png", ".jpg", ".jpeg", ".webp", ".gif"],
};

export const CATEGORY_LABELS: Record<string, string> = {
  pdf: "PDF",
  word: "Word",
  excel: "Excel",
  image: "Imagen",
};

export const FILE_CATEGORIES = Object.keys(CATEGORY_EXTENSIONS);

/** true si la extensión de `filename` cae dentro de alguna de las `categories`. */
export function extensionAllowed(filename: string, categories: string[]): boolean {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return false;
  const ext = filename.slice(dot).toLowerCase();
  return categories.some((cat) => CATEGORY_EXTENSIONS[cat]?.includes(ext));
}
