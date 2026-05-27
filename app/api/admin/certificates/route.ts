import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

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
    .select("id, student_name, verification_code, issued_at, pdf_url")
    .eq("program_id", programId)
    .order("issued_at", { ascending: false });

  if (error) {
    console.error("Error fetching certificates:", error);
    return NextResponse.json({ error: "Error al obtener certificados" }, { status: 500 });
  }

  const mapped = (certificates ?? []).map((c) => ({
    id: c.id,
    studentName: c.student_name,
    verificationCode: c.verification_code,
    issuedAt: c.issued_at,
    pdfUrl: c.pdf_url,
  }));

  return NextResponse.json({ certificates: mapped });
}
