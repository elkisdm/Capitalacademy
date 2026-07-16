import { redirect } from "next/navigation";

/** La gestión de evaluaciones dejó de ser una pestaña de "Quizzes": el quiz es
 *  un TIPO de evaluación, no su contenedor (ADR-0022). Ruta viva solo para no
 *  romper bookmarks del staff. */
export default function QuizzesRedirect() {
  redirect("/admin/evaluaciones");
}
