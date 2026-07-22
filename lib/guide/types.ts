import type { LucideIcon } from "lucide-react";

/**
 * Tipos del Centro de Ayuda. Cada artículo es una "página dedicada" por
 * ruta/uso. El índice y la página de artículo consumen esta misma fuente.
 */

export type Audience = "student" | "teacher" | "team";

export type GuideCtx = { cohortSlug: string | null; adminCohortId: string | null };

export type Faq = { q: string; a: string };

export type Article = {
  slug: string;
  audience: Audience;
  category: string;
  icon: LucideIcon;
  title: string;
  summary: string; // para la tarjeta del índice
  overview: string; // "para qué sirve"
  steps: string[];
  tips?: string[];
  faqs?: Faq[];
  route?: (ctx: GuideCtx) => string | null;
  routeLabel?: string;
};

export const cohort = (ctx: GuideCtx, sub: string) =>
  ctx.cohortSlug ? `/classroom/${ctx.cohortSlug}${sub}` : null;
