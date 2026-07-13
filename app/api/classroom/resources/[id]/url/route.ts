import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/auth";
import { getClassroomAccess } from "@/lib/classroom/access";
import { resolveViewerCohortForProgram } from "@/lib/classroom/resolve-viewer-cohort";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const RESOURCE_BUCKET = "lesson-resources";
// 1 hora: fresca al clic, con margen para que el visor/descarga interna sigan
// válidos durante la sesión de visualización (mismo criterio que certificados).
const SIGNED_URL_EXPIRY = 3_600;

// ---------------------------------------------------------------------------
// GET  /api/classroom/resources/[id]/url?table=lesson|session
//   Firma una signed URL fresca al clic para "Ver"/"Descargar" de un recurso.
//   El gate de acceso se deriva SIEMPRE del recurso (lección→programa o
//   sesión→cohorte), nunca de params del cliente, para evitar IDOR.
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: Ctx) {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const idResult = uuidLike.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  const table = new URL(req.url).searchParams.get("table");
  if (table !== "lesson" && table !== "session") {
    return NextResponse.json({ error: "table inválido" }, { status: 422 });
  }

  const admin = createAdminClient();

  let storagePath: string | null;
  let url: string | null;

  if (table === "lesson") {
    const { data: row } = await admin
      .from("lesson_resources")
      .select("id, lesson_id, url, storage_path, type")
      .eq("id", id)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: "Recurso no encontrado" }, { status: 404 });
    }

    // Derivar el programa dueño de la lección (mismo join que verify-enrollment.ts).
    const { data: lesson } = await admin
      .from("lessons")
      .select("id, program_modules!inner(program_id)")
      .eq("id", row.lesson_id)
      .single();
    const programId = (lesson?.program_modules as { program_id: string } | null)
      ?.program_id;
    if (!programId) {
      return NextResponse.json({ error: "Recurso no encontrado" }, { status: 404 });
    }

    // Una lección es del programa completo (todas sus cohortes): el gate es
    // matrícula/rol en CUALQUIER cohorte del programa, o staff transversal.
    const cohort = await resolveViewerCohortForProgram(user.id, programId);
    if (!cohort) {
      return NextResponse.json({ error: "Recurso no encontrado" }, { status: 404 });
    }

    storagePath = row.storage_path;
    url = row.url;
  } else {
    const { data: row } = await admin
      .from("session_resources")
      .select("id, session_id, url, storage_path, type")
      .eq("id", id)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: "Recurso no encontrado" }, { status: 404 });
    }

    const { data: session } = await admin
      .from("class_sessions")
      .select("cohort_id")
      .eq("id", row.session_id)
      .single();
    if (!session?.cohort_id) {
      return NextResponse.json({ error: "Recurso no encontrado" }, { status: 404 });
    }

    // Misma regla que la página de la clase: acceso por cohorte de la sesión.
    const access = await getClassroomAccess(user.id, session.cohort_id);
    if (!access) {
      return NextResponse.json({ error: "Recurso no encontrado" }, { status: 404 });
    }

    storagePath = row.storage_path;
    url = row.url;
  }

  // Recurso externo: no hay nada que firmar, se devuelve la url tal cual
  // (defensivo; el cliente ya resuelve los links externos sin llamar aquí).
  if (!storagePath) {
    return NextResponse.json({ viewUrl: null, downloadUrl: url });
  }

  const { data, error } = await admin.storage
    .from(RESOURCE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);
  if (error || !data?.signedUrl) {
    console.error("resource click-to-sign error", error);
    return NextResponse.json({ error: "No se pudo firmar el recurso" }, { status: 500 });
  }

  return NextResponse.json({
    viewUrl: data.signedUrl,
    downloadUrl: `${data.signedUrl}&download=`,
  });
}
