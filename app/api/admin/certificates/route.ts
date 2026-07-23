import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { CERT_URL_EXPIRY_DISPLAY } from "@/lib/certificates/get-certificate-url";

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
    .order("issued_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Error fetching certificates:", error);
    return NextResponse.json({ error: "Error al obtener certificados" }, { status: 500 });
  }

  const paths = (certificates ?? [])
    .map((c) => c.pdf_storage_path)
    .filter((path): path is string => Boolean(path));

  const signedUrlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed, error: signError } = await admin.storage
      .from("certificates")
      .createSignedUrls(paths, CERT_URL_EXPIRY_DISPLAY);
    if (signError) console.error("Error al firmar certificados:", signError);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedUrlByPath.set(s.path, s.signedUrl);
    }
  }

  const mapped = (certificates ?? []).map((c) => ({
    id: c.id,
    studentName: c.student_name,
    verificationCode: c.verification_code,
    issuedAt: c.issued_at,
    pdfUrl: c.pdf_storage_path ? (signedUrlByPath.get(c.pdf_storage_path) ?? null) : null,
  }));

  return NextResponse.json({ certificates: mapped });
}
