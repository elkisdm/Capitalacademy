import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/auth";
import { resolveViewerCohortForProgram } from "@/lib/classroom/resolve-viewer-cohort";

/**
 * Ruta neutra de enlace: la campana y el correo no conocen la cohorte del
 * destinatario (cross-cohorte/cross-programa). Resuelve una cohorte del
 * programa de la lección donde el viewer tenga acceso y redirige a la URL
 * real de la lección. La página de lección ya reenvía sola las grabaciones
 * a la pantalla de clase (ver `[lessonSlug]/page.tsx`), así que no hay que
 * replicar esa lógica acá. `notFound()` sin distinguir "lección inexistente"
 * de "sin acceso" (no filtra existencia cross-tenant).
 */
export default async function GoLessonPage(
  props: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await props.params;

  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = createAdminClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("slug, program_modules(id, slug, program_id)")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) notFound();

  const moduleRow = lesson.program_modules as
    | { id: string; slug: string | null; program_id: string }
    | null;
  if (!moduleRow) notFound();

  const cohort = await resolveViewerCohortForProgram(user.id, moduleRow.program_id);
  if (!cohort) notFound();

  redirect(`/classroom/${cohort.slug}/${moduleRow.slug ?? moduleRow.id}/${lesson.slug ?? lessonId}`);
}
