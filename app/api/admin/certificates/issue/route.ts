import { NextResponse } from "next/server";
import { issueCertificate } from "@/lib/certificates/issue-certificate";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

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

  if (!enrollmentId || !uuidLike.safeParse(enrollmentId).success) {
    return NextResponse.json(
      { error: "enrollmentId es requerido y debe ser un UUID válido" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();
  const { data: existingCert } = await admin
    .from("certificates")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();

  if (existingCert) {
    return NextResponse.json(
      { error: "Esta matrícula ya tiene un certificado emitido" },
      { status: 409 },
    );
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
