import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function authorizeAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ops", "admin"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  }

  return { user };
}

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
