import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, cohort_id, cohorts(program_id)")
    .eq("student_id", user.id)
    .eq("status", "active")
    .single();

  if (!enrollment) {
    return NextResponse.json(
      { error: "No tienes matrícula activa" },
      { status: 403 },
    );
  }

  const cohort = enrollment.cohorts as unknown as { program_id: string } | null;
  if (cohort?.program_id !== programId) {
    return NextResponse.json(
      { error: "Programa no coincide con tu matrícula" },
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

  const { data: passedAttempt } = await supabase
    .from("quiz_attempts")
    .select("id")
    .eq("enrollment_id", enrollment.id)
    .eq("passed", true)
    .maybeSingle();

  if (!passedAttempt) {
    return NextResponse.json(
      { error: "No has aprobado el quiz" },
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
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("Certificate retry failed:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
