import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueCertificate } from "@/lib/certificates/issue-certificate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { programId } = body as { programId?: string };

  if (!programId) {
    return NextResponse.json(
      { error: "programId es requerido" },
      { status: 422 },
    );
  }

  const { data: enrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("id, cohort_id, cohorts!inner(program_id)")
    .eq("student_id", user.id)
    .eq("cohorts.program_id", programId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (enrollmentError) {
    return NextResponse.json(
      { error: "No se pudo verificar tu matrícula" },
      { status: 500 },
    );
  }

  if (!enrollment) {
    return NextResponse.json(
      { error: "No tienes matrícula activa" },
      { status: 403 },
    );
  }

  const { data: existingCert } = await supabase
    .from("certificates")
    .select("id")
    .eq("enrollment_id", enrollment.id)
    .maybeSingle();

  if (existingCert) {
    return NextResponse.json(
      { error: "Ya tienes un certificado emitido" },
      { status: 409 },
    );
  }

  // El certificado lo emite SOLO el quiz FINAL. Acotamos el intento aprobado a la
  // evaluación scope='final' del programa: un quiz formativo aprobado (que comparte
  // program_id) NO debe habilitar el certificado.
  const admin = createAdminClient();
  const { data: finalEval } = await admin
    .from("evaluations")
    .select("id")
    .eq("program_id", programId)
    .eq("scope", "final")
    .eq("is_active", true)
    .maybeSingle();

  if (!finalEval) {
    return NextResponse.json(
      { error: "Este programa no tiene un examen final configurado" },
      { status: 422 },
    );
  }

  const { data: passedAttempt } = await supabase
    .from("quiz_attempts")
    .select("id")
    .eq("enrollment_id", enrollment.id)
    .eq("evaluation_id", finalEval.id)
    .eq("passed", true)
    .maybeSingle();

  if (!passedAttempt) {
    return NextResponse.json(
      { error: "No has aprobado el examen final" },
      { status: 422 },
    );
  }

  try {
    const cert = await issueCertificate(enrollment.id, passedAttempt.id);
    return NextResponse.json({
      verificationCode: cert.verificationCode,
      pdfUrl: cert.pdfUrl,
    }, { status: 201 });
  } catch (err) {
    console.error("Certificate retry failed:", err);
    return NextResponse.json(
      { error: "No se pudo emitir el certificado. Intenta más tarde." },
      { status: 500 },
    );
  }
}
