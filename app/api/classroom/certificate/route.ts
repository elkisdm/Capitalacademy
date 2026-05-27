import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/classroom/certificate?programId=xxx
 *
 * Student-facing endpoint. Returns certificate data if one exists
 * for the authenticated student's enrollment in the given program.
 * Enrollment is resolved from session — never accepted from client.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");

  if (!programId) {
    return NextResponse.json(
      { error: "programId es requerido" },
      { status: 422 },
    );
  }

  // Resolve enrollment from authenticated user — prevents IDOR
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, cohorts!inner(program_id)")
    .eq("student_id", user.id)
    .eq("cohorts.program_id", programId)
    .limit(1)
    .single();

  if (!enrollment) {
    return NextResponse.json(
      { error: "No tienes inscripcion en este programa" },
      { status: 404 },
    );
  }

  const { data: certificate, error } = await supabase
    .from("certificates")
    .select("id, verification_code, pdf_url, student_name, issued_at")
    .eq("enrollment_id", enrollment.id)
    .single();

  if (error || !certificate) {
    return NextResponse.json(
      { error: "Certificado no encontrado" },
      { status: 404 },
    );
  }

  return NextResponse.json(certificate);
}
