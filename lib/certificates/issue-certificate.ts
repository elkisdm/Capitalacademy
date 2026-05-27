import { createAdminClient } from "@/lib/supabase/admin";
import { generateCertificatePdf, type CertificateConfig } from "./generate-pdf";
import { sendCertificateEmail } from "@/lib/email/certificate";

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

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("full_name")
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

  // 6. Get public URL for the PDF
  const { data: urlData } = supabase.storage
    .from("certificates")
    .getPublicUrl(storagePath);

  const pdfUrl = urlData.publicUrl;

  // 7. Insert into certificates table
  const { data: certificate, error: insertErr } = await supabase
    .from("certificates")
    .insert({
      enrollment_id: enrollmentId,
      program_id: programId,
      quiz_attempt_id: quizAttemptId ?? null,
      student_name: profile.full_name,
      verification_code: verificationCode,
      pdf_storage_path: storagePath,
      pdf_url: pdfUrl,
    })
    .select("id")
    .single();

  if (insertErr || !certificate) {
    throw new Error(`Failed to insert certificate: ${insertErr?.message}`);
  }

  // 8. Send certificate email
  const { data: studentProfile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", enrollment.student_id)
    .single();

  if (studentProfile?.email) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "https://capitalacademy.cl";
    const verifyUrl = `${baseUrl}/verificar/${verificationCode}`;

    const emailResult = await sendCertificateEmail({
      email: studentProfile.email,
      studentName: profile.full_name,
      programName: cohort.programs.name,
      verificationCode,
      pdfUrl,
      verifyUrl,
    });

    if (emailResult.success) {
      await supabase
        .from("certificates")
        .update({ emailed_at: new Date().toISOString() } as never)
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
