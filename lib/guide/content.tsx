/**
 * Contenido del Centro de Ayuda. Cada artículo es una "página dedicada" por
 * ruta/uso. El índice y la página de artículo consumen esta misma fuente.
 *
 * Barrel: los tipos viven en `./types`, las categorías en `./categories` y
 * los artículos por audiencia en `./articles/{student,teacher,team}`. Este
 * archivo solo compone y expone la API pública para no forzar a que dos
 * lotes de contenido en paralelo toquen el mismo archivo.
 */

export * from "./types";
export * from "./categories";

import { STUDENT_ARTICLES } from "./articles/student";
import { TEACHER_ARTICLES } from "./articles/teacher";
import { TEAM_ARTICLES } from "./articles/team";
import type { Article, Audience } from "./types";

export const ARTICLES: Article[] = [...STUDENT_ARTICLES, ...TEACHER_ARTICLES, ...TEAM_ARTICLES];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

export function articlesByAudience(audience: Audience): Article[] {
  return ARTICLES.filter((a) => a.audience === audience);
}
