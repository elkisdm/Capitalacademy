// Fuente única de categorías del foro de conversaciones. Se usa en la UI
// (composer, filtros) y en la validación del API. La columna `category` de
// `conversation_threads` es `text not null default 'general'`.

export const CONVERSATION_CATEGORIES = [
  { key: "general", label: "General" },
  { key: "dudas", label: "Dudas" },
  { key: "recursos", label: "Recursos" },
  { key: "logros", label: "Logros" },
  { key: "presentaciones", label: "Presentaciones" },
] as const;

export type ConversationCategoryKey = (typeof CONVERSATION_CATEGORIES)[number]["key"];

export const CATEGORY_KEYS: string[] = CONVERSATION_CATEGORIES.map((c) => c.key);

export function isValidCategory(v: unknown): boolean {
  return typeof v === "string" && CATEGORY_KEYS.includes(v);
}

export function categoryLabel(key: string): string {
  return CONVERSATION_CATEGORIES.find((c) => c.key === key)?.label ?? "General";
}
