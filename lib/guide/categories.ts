import type { Audience } from "./types";

export const STUDENT_CATEGORIES = ["Empezar", "Aprender", "Evaluaciones", "Comunidad", "Tu cuenta"];
export const TEACHER_CATEGORIES = ["Empezar", "Tu clase", "Evaluar", "Comunidad"];
export const TEAM_CATEGORIES = ["Personas", "Contenido", "Evaluación", "Operación"];

export const CATEGORIES_BY_AUDIENCE: Record<Audience, readonly string[]> = {
  student: STUDENT_CATEGORIES,
  teacher: TEACHER_CATEGORIES,
  team: TEAM_CATEGORIES,
};
