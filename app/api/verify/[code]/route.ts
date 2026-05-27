import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/verify/ABC12345
 *
 * PUBLIC endpoint — no auth required.
 * Verifies a certificate by its verification code.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const supabase = createAdminClient();

  const { data: certificate, error } = await supabase
    .from("certificates")
    .select("student_name, issued_at, program_id")
    .eq("verification_code", code.toUpperCase())
    .single();

  if (error || !certificate) {
    return NextResponse.json(
      { valid: false },
      {
        status: 404,
        headers: { "Cache-Control": "public, max-age=86400" },
      },
    );
  }

  // Separate query — certificates table has no FK to programs
  const { data: program } = await supabase
    .from("programs")
    .select("name")
    .eq("id", certificate.program_id)
    .single();

  return NextResponse.json(
    {
      valid: true,
      studentName: certificate.student_name,
      programName: program?.name ?? null,
      issuedAt: certificate.issued_at,
    },
    {
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
