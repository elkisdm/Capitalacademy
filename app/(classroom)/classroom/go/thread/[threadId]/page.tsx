import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/auth";
import { resolveViewerCohortForProgram } from "@/lib/classroom/resolve-viewer-cohort";

/**
 * Ruta neutra de enlace: la campana y el correo no conocen la cohorte del
 * destinatario (cross-cohorte/cross-programa). Resuelve una cohorte del
 * programa del hilo donde el viewer tenga acceso y redirige a la URL real
 * de Conversaciones. `notFound()` sin distinguir "hilo inexistente" de "sin
 * acceso" (no filtra existencia cross-tenant).
 */
export default async function GoThreadPage(
  props: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await props.params;

  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = createAdminClient();
  const { data: thread } = await supabase
    .from("conversation_threads")
    .select("program_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) notFound();

  const cohort = await resolveViewerCohortForProgram(user.id, thread.program_id);
  if (!cohort) notFound();

  redirect(`/classroom/${cohort.slug}/conversaciones/${threadId}`);
}
