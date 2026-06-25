import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { uniqueSlug } from "@/lib/utils/slug";

export const runtime = "nodejs";

type SessionRow = {
  id: string;
  cohort_id: string;
  module_id: string | null;
  lesson_id: string | null;
  title: string | null;
};

type RecordingLesson = {
  id: string;
  slug: string | null;
  mux_upload_id: string | null;
  mux_playback_id: string | null;
  video_duration_seconds: number | null;
  thumbnail_url: string | null;
};

async function loadSession(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string,
) {
  const { data } = await admin
    .from("class_sessions")
    .select("id, cohort_id, module_id, lesson_id, title")
    .eq("id", sessionId)
    .single<SessionRow>();
  return data;
}

/**
 * GET /api/admin/sessions/:sessionId/recording
 * Devuelve el estado de la repetición de una clase en vivo.
 *  - moduleMissing: la sesión no tiene módulo (no se puede crear la repetición).
 *  - lessonId: id de la lección-repetición, si ya fue preparada.
 *  - recording: estado Mux de la repetición (null mientras no haya video listo).
 */
export async function GET(
  _req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { sessionId } = await props.params;
  const parsedId = uuidLike.safeParse(sessionId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const session = await loadSession(admin, parsedId.data);
  if (!session) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }

  if (!session.lesson_id) {
    return NextResponse.json({
      lessonId: null,
      recording: null,
      moduleMissing: !session.module_id,
    });
  }

  const { data: lesson } = await admin
    .from("lessons")
    .select(
      "id, slug, mux_upload_id, mux_playback_id, video_duration_seconds, thumbnail_url",
    )
    .eq("id", session.lesson_id)
    .single<RecordingLesson>();

  return NextResponse.json({
    lessonId: session.lesson_id,
    recording: lesson ?? null,
    moduleMissing: !session.module_id,
  });
}

/**
 * POST /api/admin/sessions/:sessionId/recording
 * Crea-si-no-existe la lección-repetición (kind='recorded') bajo el módulo de la
 * sesión y la enlaza vía class_sessions.lesson_id. Idempotente: si ya existe,
 * devuelve la misma lección. Luego el cliente sube el video con MuxUploader
 * apuntando a `lessonId` (reusa /api/admin/mux/upload sin cambios).
 */
export async function POST(
  _req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { sessionId } = await props.params;
  const parsedId = uuidLike.safeParse(sessionId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const session = await loadSession(admin, parsedId.data);
  if (!session) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }

  // Idempotente: si ya hay repetición preparada, devuélvela.
  if (session.lesson_id) {
    return NextResponse.json({ lessonId: session.lesson_id });
  }

  if (!session.module_id) {
    return NextResponse.json(
      {
        error:
          "Asigna un módulo a la sesión antes de preparar la repetición.",
      },
      { status: 422 },
    );
  }

  // Posición al final del módulo (unique(module_id, position)).
  const { data: lastPos } = await admin
    .from("lessons")
    .select("position")
    .eq("module_id", session.module_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((lastPos?.position as number | undefined) ?? 0) + 1;

  // Slug único GLOBAL (lessons_slug_idx es global).
  const { data: slugRows } = await admin
    .from("lessons")
    .select("slug")
    .not("slug", "is", null);
  const taken = (slugRows ?? []).map((r) => r.slug as string);
  const title = `Repetición — ${session.title ?? "Clase en vivo"}`;
  const slug = uniqueSlug(title, taken);

  const { data: lesson, error: insertError } = await admin
    .from("lessons")
    .insert({
      module_id: session.module_id,
      title,
      kind: "recorded",
      position,
      slug,
    } as never)
    .select("id")
    .single<{ id: string }>();

  if (insertError || !lesson) {
    console.error("recording lesson insert error", insertError);
    return NextResponse.json(
      { error: "Error al preparar la repetición" },
      { status: 500 },
    );
  }

  const { error: linkError } = await admin
    .from("class_sessions")
    .update({ lesson_id: lesson.id } as never)
    .eq("id", parsedId.data);

  if (linkError) {
    // Rollback de la lección huérfana para no dejar basura.
    await admin.from("lessons").delete().eq("id", lesson.id);
    console.error("recording link error", linkError);
    return NextResponse.json(
      { error: "Error al enlazar la repetición" },
      { status: 500 },
    );
  }

  return NextResponse.json({ lessonId: lesson.id });
}

/**
 * DELETE /api/admin/sessions/:sessionId/recording
 * Desenlaza y borra la lección-repetición de la sesión. El asset en Mux no se
 * elimina (fuera de alcance). Falla si la lección tiene progreso que la bloquea.
 */
export async function DELETE(
  _req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { sessionId } = await props.params;
  const parsedId = uuidLike.safeParse(sessionId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const session = await loadSession(admin, parsedId.data);
  if (!session) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }
  if (!session.lesson_id) {
    return NextResponse.json({ ok: true });
  }

  const lessonId = session.lesson_id;

  // Primero desenlaza para liberar el unique index, luego borra la lección.
  const { error: unlinkError } = await admin
    .from("class_sessions")
    .update({ lesson_id: null } as never)
    .eq("id", parsedId.data);

  if (unlinkError) {
    console.error("recording unlink error", unlinkError);
    return NextResponse.json(
      { error: "Error al desenlazar la repetición" },
      { status: 500 },
    );
  }

  const { error: deleteError } = await admin
    .from("lessons")
    .delete()
    .eq("id", lessonId);

  if (deleteError) {
    console.error("recording lesson delete error", deleteError);
    return NextResponse.json(
      { error: "Error al borrar la lección-repetición" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
