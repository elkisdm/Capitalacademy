import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";

interface CertificateEmailInput {
  email: string;
  studentName: string;
  programName: string;
  verificationCode: string;
  pdfUrl: string;
  verifyUrl: string;
}

export async function sendCertificateEmail(
  params: CertificateEmailInput,
): Promise<{ success: boolean; error?: string }> {
  const resend = getResendClient();

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.email,
      subject: `Tu certificado · ${params.programName}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #14163a; font-size: 22px; font-weight: 900; margin: 0;">Capital Academy</h1>
            <p style="color: #5e17eb; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.2em; margin: 4px 0 0;">Certificado emitido</p>
          </div>

          <p style="color: #14163a; font-size: 16px; font-weight: 700; margin: 0 0 8px;">
            ¡Felicitaciones, ${params.studentName}!
          </p>
          <p style="color: #6b6e8a; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
            Has completado exitosamente el programa <strong style="color: #14163a;">${params.programName}</strong>. Tu certificado ya está disponible.
          </p>

          <div style="background: #f8f8fc; border-radius: 16px; padding: 24px; margin: 24px 0; text-align: center;">
            <p style="color: #6b6e8a; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.15em; margin: 0 0 8px;">Código de verificación</p>
            <p style="color: #14163a; font-size: 24px; font-weight: 900; letter-spacing: 0.12em; margin: 0; font-family: monospace;">${params.verificationCode}</p>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${params.pdfUrl}" style="display: inline-block; background: #5e17eb; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 12px; margin-bottom: 12px;">
              Descargar certificado PDF
            </a>
          </div>

          <p style="color: #6b6e8a; font-size: 13px; line-height: 1.5; text-align: center; margin: 0 0 8px;">
            Tu certificado puede ser verificado en cualquier momento en:
          </p>
          <p style="text-align: center; margin: 0 0 24px;">
            <a href="${params.verifyUrl}" style="color: #5e17eb; font-size: 13px; font-weight: 600; text-decoration: underline;">${params.verifyUrl}</a>
          </p>

          <hr style="border: none; border-top: 1px solid #f0f0f3; margin: 32px 0 16px;" />
          <p style="color: #9b9db5; font-size: 11px; text-align: center; margin: 0;">
            Capital Academy · Capital Inteligente
          </p>
        </div>
      `,
      text: `¡Felicitaciones, ${params.studentName}!\n\nHas completado el programa ${params.programName}.\n\nCódigo de verificación: ${params.verificationCode}\n\nDescargar certificado: ${params.pdfUrl}\nVerificar: ${params.verifyUrl}`,
    });

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Certificate email error:", msg);
    return { success: false, error: msg };
  }
}
