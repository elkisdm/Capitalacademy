import type { createAdminClient } from "@/lib/supabase/admin";
import { slugify, uniqueSlug } from "@/lib/utils/slug";

/**
 * Crea-si-no-existe la lección-repetición de una clase en vivo.
 *
 * Vivía dentro de `POST /api/admin/sessions/[sessionId]/recording` y se extrajo
 * acá cuando apareció el segundo camino (la grabación nativa, ADR-0034): los dos
 * tienen que producir EXACTAMENTE la misma lección, o el alumno vería dos
 * "repeticiones" de la misma clase compitiendo por el mismo lugar.
 */

type Admin = ReturnType<typeof createAdminClient>;

export type RecordingSession = {
  id: string;
  module_id: string | null;
  lesson_id: string | null;
  title: string | null;
};

export type EnsureRecordingLessonResult =
  | { ok: true; lessonId: string; created: boolean }
  | { ok: false; reason: "module_missing" | "insert_error" | "link_error" };

export async function ensureRecordingLesson(
  admin: Admin,
  session: RecordingSession,
): Promise<EnsureRecordingLessonResult> {
  // Idempotente: si ya hay repetición preparada, es esa y no otra.
  if (session.lesson_id) {
    return { ok: true, lessonId: session.lesson_id, created: false };
  }

  // Sin módulo no hay dónde colgarla. Crear una lección huérfana sería peor que
  // no crearla: no aparece en ninguna parte y nadie sabe que existe.
  if (!session.module_id) return { ok: false, reason: "module_missing" };

  // Posición al final del módulo (unique(module_id, position)).
  const { data: lastPos } = await admin
    .from("lessons")
    .select("position")
    .eq("module_id", session.module_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((lastPos?.position as number | undefined) ?? 0) + 1;

  // Slug único GLOBAL (lessons_slug_idx es global). Solo interesan los que
  // comparten prefijo con el candidato: traerse TODOS los slugs de la tabla
  // era aceptable cuando esto corría solo desde un clic del admin, pero ahora
  // corre en cada ingesta automatizada (webhook + cron).
  const title = `Repetición — ${session.title ?? "Clase en vivo"}`;
  const { data: slugRows } = await admin
    .from("lessons")
    .select("slug")
    .like("slug", `${slugify(title)}%`);
  const taken = (slugRows ?? []).map((r) => r.slug as string);
  const slug = uniqueSlug(title, taken);

  const { data: lesson, error: insertError } = await admin
    .from("lessons")
    .insert({
      module_id: session.module_id,
      title,
      kind: "recorded",
      position,
      slug,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !lesson) {
    console.error("[ensureRecordingLesson] insert falló", insertError);
    return { ok: false, reason: "insert_error" };
  }

  // Enlace CONDICIONAL: solo si la sesión sigue sin repetición. Dos llamadores
  // pueden correr a la vez (el clic del admin y la ingesta automatizada del
  // webhook/cron); sin la guarda, el segundo pisaría el enlace del primero y
  // su lección quedaría huérfana pero VISIBLE para los alumnos en el módulo.
  const { data: enlazada, error: linkError } = await admin
    .from("class_sessions")
    .update({ lesson_id: lesson.id })
    .eq("id", session.id)
    .is("lesson_id", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (linkError) {
    // Rollback de la lección huérfana para no dejar basura.
    await admin.from("lessons").delete().eq("id", lesson.id);
    console.error("[ensureRecordingLesson] enlace falló", linkError);
    return { ok: false, reason: "link_error" };
  }

  if (!enlazada) {
    // Otro llamador ganó la carrera: su lección es LA lección. Se borra la
    // nuestra y se devuelve la del ganador.
    await admin.from("lessons").delete().eq("id", lesson.id);
    const { data: actual } = await admin
      .from("class_sessions")
      .select("lesson_id")
      .eq("id", session.id)
      .maybeSingle<{ lesson_id: string | null }>();
    if (actual?.lesson_id) return { ok: true, lessonId: actual.lesson_id, created: false };
    return { ok: false, reason: "link_error" };
  }

  return { ok: true, lessonId: lesson.id, created: true };
}
