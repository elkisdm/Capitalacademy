import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { getCertificateSignedUrl } from "@/lib/certificates/get-certificate-url";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET  /api/admin/certificates?programId=xxx
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");

  if (!programId) {
    return NextResponse.json({ error: "programId es requerido" }, { status: 422 });
  }

  const admin = createAdminClient();

  const { data: certificates, error } = await admin
    .from("certificates")
    .select("id, student_name, verification_code, issued_at, pdf_storage_path")
    .eq("program_id", programId)
    .order("issued_at", { ascending: false });

  if (error) {
    console.error("Error fetching certificates:", error);
    return NextResponse.json({ error: "Error al obtener certificados" }, { status: 500 });
  }

  const mapped = await Promise.all(
    (certificates ?? []).map(async (c) => ({
      id: c.id,
      studentName: c.student_name,
      verificationCode: c.verification_code,
      issuedAt: c.issued_at,
      pdfUrl: await getCertificateSignedUrl(c.pdf_storage_path),
    })),
  );

  return NextResponse.json({ certificates: mapped });
}
