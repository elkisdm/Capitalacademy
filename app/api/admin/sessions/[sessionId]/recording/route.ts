import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { ensureRecordingLesson } from "@/lib/classroom/ensure-recording-lesson";

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
  mux_error: string | null;
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
 * Última grabación NATIVA de la clase (ADR-0034), si existe. El panel la
 * necesita para no invitar a subir a mano encima de una grabación automática
 * en curso: sin esto, ops ve "sin repetición" mientras la ingesta trabaja,
 * sube el archivo, y la ingesta nativa muere contra la subida manual.
 */
async function grabacionNativa(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string,
) {
  const { data } = await admin
    .from("session_recordings")
    .select("status, error, started_at, ended_at")
    .eq("session_id", sessionId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      status: string;
      error: string | null;
      started_at: string;
      ended_at: string | null;
    }>();
  if (!data) return null;
  return {
    estado: data.status,
    error: data.error,
    iniciadaEn: data.started_at,
    terminadaEn: data.ended_at,
  };
}

/**
 * GET /api/admin/sessions/:sessionId/recording
 * Devuelve el estado de la repetición de una clase en vivo.
 *  - moduleMissing: la sesión no tiene módulo (no se puede crear la repetición).
 *  - lessonId: id de la lección-repetición, si ya fue preparada.
 *  - recording: estado Mux de la repetición (null mientras no haya video listo).
 *  - nativa: última grabación automática de la sala (null si nunca hubo).
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

  const nativa = await grabacionNativa(admin, parsedId.data);

  if (!session.lesson_id) {
    return NextResponse.json({
      lessonId: null,
      recording: null,
      moduleMissing: !session.module_id,
      nativa,
    });
  }

  const { data: lesson } = await admin
    .from("lessons")
    .select(
      "id, slug, mux_upload_id, mux_playback_id, mux_error, video_duration_seconds, thumbnail_url",
    )
    .eq("id", session.lesson_id)
    .single<RecordingLesson>();

  return NextResponse.json({
    lessonId: session.lesson_id,
    recording: lesson ?? null,
    moduleMissing: !session.module_id,
    nativa,
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

  // La creación vive en lib/classroom/ensure-recording-lesson.ts porque la
  // comparte con la grabación nativa (ADR-0034): los dos caminos tienen que
  // producir la misma lección. Los mensajes al usuario siguen siendo de acá.
  const resultado = await ensureRecordingLesson(admin, session);

  if (!resultado.ok) {
    if (resultado.reason === "module_missing") {
      return NextResponse.json(
        {
          error:
            "Asigna un módulo a la sesión antes de preparar la repetición.",
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      {
        error:
          resultado.reason === "link_error"
            ? "Error al enlazar la repetición"
            : "Error al preparar la repetición",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ lessonId: resultado.lessonId });
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

  // Guarda de seguridad de datos: no borrar una lección con progreso de alumnos
  // (el borrado cascadearía video_progress). Misma guarda que
  // DELETE /api/admin/lessons/[lessonId].
  const { count: progressCount } = await admin
    .from("video_progress")
    .select("id", { count: "exact", head: true })
    .eq("lesson_id", lessonId);

  if ((progressCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "No se puede eliminar: la lección ya tiene progreso de alumnos. Edítala u ocúltala en su lugar.",
      },
      { status: 409 },
    );
  }

  // Primero desenlaza para liberar el unique index, luego borra la lección.
  const { error: unlinkError } = await admin
    .from("class_sessions")
    .update({ lesson_id: null })
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
