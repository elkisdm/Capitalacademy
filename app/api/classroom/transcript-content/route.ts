import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/auth";
import { resolveViewerCohortForProgram } from "@/lib/classroom/resolve-viewer-cohort";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET  /api/classroom/transcript-content?lessonId=
//   Devuelve el VTT (crudo + corregido) de una lección bajo demanda, al abrir
//   el drawer de transcripción, en vez de serializarlo en la carga inicial de
//   cada lección con video. El gate de acceso se deriva SIEMPRE de la lección
//   (lección→programa), nunca de params del cliente, para evitar IDOR — mismo
//   patrón que /api/classroom/resources/[id]/url.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const lessonId = new URL(req.url).searchParams.get("lessonId");
  const idResult = uuidLike.safeParse(lessonId);
  if (!idResult.success) {
    return NextResponse.json({ error: "lessonId inválido" }, { status: 422 });
  }

  const admin = createAdminClient();

  // Derivar el programa dueño de la lección (mismo join que la ruta de recursos).
  const { data: lesson } = await admin
    .from("lessons")
    .select("id, program_modules!inner(program_id)")
    .eq("id", idResult.data)
    .maybeSingle();
  const programId = (lesson?.program_modules as { program_id: string } | null)
    ?.program_id;
  if (!programId) {
    return NextResponse.json({ error: "Transcripción no encontrada" }, { status: 404 });
  }

  // Una lección es del programa completo (todas sus cohortes): el gate es
  // matrícula/rol en CUALQUIER cohorte del programa, o staff transversal.
  const cohort = await resolveViewerCohortForProgram(user.id, programId);
  if (!cohort) {
    return NextResponse.json({ error: "Transcripción no encontrada" }, { status: 404 });
  }

  const { data: transcript } = await admin
    .from("lesson_transcripts")
    .select("content_vtt, corrected_vtt")
    .eq("lesson_id", idResult.data)
    .eq("status", "ready")
    .maybeSingle();
  if (!transcript?.content_vtt) {
    return NextResponse.json({ error: "Transcripción no encontrada" }, { status: 404 });
  }

  return NextResponse.json(
    {
      contentVtt: transcript.content_vtt,
      correctedVtt: transcript.corrected_vtt ?? null,
    },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
