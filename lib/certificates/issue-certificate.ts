import { createAdminClient } from "@/lib/supabase/admin";
import { generateCertificatePdf, type CertificateConfig } from "./generate-pdf";
import { sendCertificateEmail } from "@/lib/email/certificate";
import {
  getCertificateSignedUrl,
  CERT_URL_EXPIRY_EMAIL,
} from "./get-certificate-url";
import { getPublicBaseUrl } from "@/lib/api/base-url";

// ---------------------------------------------------------------------------
// Verification code generator — 8 chars alphanumeric uppercase
// ---------------------------------------------------------------------------

function generateVerificationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

// ---------------------------------------------------------------------------
// Issue certificate
// ---------------------------------------------------------------------------

export async function issueCertificate(
  enrollmentId: string,
  quizAttemptId?: string,
): Promise<{
  certificateId: string;
  verificationCode: string;
  pdfUrl: string;
}> {
  const supabase = createAdminClient();

  // 1. Fetch enrollment + student profile + cohort → program
  const { data: enrollment, error: enrollmentErr } = await supabase
    .from("enrollments")
    .select("id, student_id, cohort_id, cohorts(program_id, programs(id, name))")
    .eq("id", enrollmentId)
    .single();

  if (enrollmentErr || !enrollment) {
    throw new Error(`Enrollment not found: ${enrollmentId}`);
  }

  const cohort = enrollment.cohorts as unknown as {
    program_id: string;
    programs: { id: string; name: string };
  };
  if (!cohort?.programs) {
    throw new Error(`Program not found for enrollment: ${enrollmentId}`);
  }

  const programId = cohort.programs.id;

  // Defensa en profundidad: si se ancla a un intento, debe ser del EXAMEN FINAL
  // y estar aprobado. Evita que un quiz formativo aprobado emita certificado,
  // aunque un caller futuro lo pase por error. (La emisión manual del admin no
  // pasa attemptId — es un override deliberado y se permite.)
  if (quizAttemptId) {
    const { data: att } = await supabase
      .from("quiz_attempts")
      .select("passed, evaluations(scope)")
      .eq("id", quizAttemptId)
      .maybeSingle();
    const scope = (att?.evaluations as unknown as { scope?: string } | null)?.scope;
    if (!att?.passed || scope !== "final") {
      throw new Error("El certificado solo se emite por un examen final aprobado");
    }
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", enrollment.student_id)
    .single();

  if (profileErr || !profile?.full_name) {
    throw new Error(`Student profile not found: ${enrollment.student_id}`);
  }

  // 2. Fetch certificate_template for the program
  const { data: template, error: templateErr } = await supabase
    .from("certificate_templates")
    .select("*")
    .eq("program_id", programId)
    .eq("is_active", true)
    .single();

  if (templateErr || !template) {
    throw new Error(`No active certificate template for program: ${programId}`);
  }

  // 3. Generate verification code
  const verificationCode = generateVerificationCode();

  // 4. Build config from template and generate PDF
  const config: CertificateConfig = {
    templatePngPath: template.template_png_path,
    fontPath: template.font_path,
    nameCenterX: template.name_center_x,
    nameBaselineY: template.name_baseline_y,
    defaultFontSize: template.default_font_size,
    minFontSize: template.min_font_size,
    maxNameWidth: template.max_name_width,
    nameColorHex: template.name_color_hex,
  };

  const pdfBytes = await generateCertificatePdf(profile.full_name, config);

  // 5. Upload PDF to Supabase Storage bucket "certificates"
  const storagePath = `${programId}/${enrollmentId}-${verificationCode}.pdf`;

  const { error: uploadErr } = await supabase.storage
    .from("certificates")
    .upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadErr) {
    throw new Error(`Failed to upload certificate PDF: ${uploadErr.message}`);
  }

  // 6. Generar signed URL de larga vigencia para el correo (bucket privado).
  const pdfUrl =
    (await getCertificateSignedUrl(storagePath, CERT_URL_EXPIRY_EMAIL)) ?? "";

  // 7. Insert into certificates table (pdf_url no se persiste: se genera on-demand)
  const { data: certificate, error: insertErr } = await supabase
    .from("certificates")
    .insert({
      enrollment_id: enrollmentId,
      program_id: programId,
      quiz_attempt_id: quizAttemptId ?? null,
      student_name: profile.full_name,
      verification_code: verificationCode,
      pdf_storage_path: storagePath,
    })
    .select("id")
    .single();

  if (insertErr?.code === "23505") {
    throw new Error("Este alumno ya tiene un certificado emitido");
  }

  if (insertErr || !certificate) {
    throw new Error(`Failed to insert certificate: ${insertErr?.message}`);
  }

  // 8. Send certificate email
  if (profile.email) {
    const baseUrl = getPublicBaseUrl();
    const verifyUrl = `${baseUrl}/verificar/${verificationCode}`;

    const emailResult = await sendCertificateEmail({
      email: profile.email,
      studentName: profile.full_name,
      programName: cohort.programs.name,
      verificationCode,
      pdfUrl,
      verifyUrl,
    });

    if (emailResult.success) {
      await supabase
        .from("certificates")
        .update({ emailed_at: new Date().toISOString() })
        .eq("id", certificate.id);
    }
  }

  // 9. Return certificate data
  return {
    certificateId: certificate.id,
    verificationCode,
    pdfUrl,
  };
}
