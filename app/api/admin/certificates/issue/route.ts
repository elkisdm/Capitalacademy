import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { issueCertificate } from "@/lib/certificates/issue-certificate";

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
// POST  /api/admin/certificates/issue
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { enrollmentId } = body as { enrollmentId?: string };

  if (!enrollmentId) {
    return NextResponse.json({ error: "enrollmentId es requerido" }, { status: 422 });
  }

  try {
    const result = await issueCertificate(enrollmentId);

    return NextResponse.json({
      certificate: {
        id: result.certificateId,
        verificationCode: result.verificationCode,
        pdfUrl: result.pdfUrl,
      },
    }, { status: 201 });
  } catch (err) {
    console.error("Error issuing certificate:", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `Error al emitir certificado: ${message}` }, { status: 500 });
  }
}
