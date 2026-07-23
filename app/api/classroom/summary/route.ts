import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyEnrollment } from "@/lib/classroom/verify-enrollment";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // --- Auth check ------------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // --- Validation ------------------------------------------------------------
  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get("lessonId");

  if (!lessonId) {
    return NextResponse.json(
      { error: "lessonId es requerido" },
      { status: 422 },
    );
  }

  // --- Authorization: verify lesson exists + user is enrolled ----------------
  const enrollmentId = await verifyEnrollment(user.id, lessonId);

  if (!enrollmentId) {
    return NextResponse.json(
      { error: "Lección no encontrada o no tienes matrícula activa" },
      { status: 403 },
    );
  }

  // --- Fetch summary ---------------------------------------------------------
  const { data: summary, error } = await supabase
    .from("lesson_summaries")
    .select("lesson_id, key_points, summary_text, glossary, generated_at")
    .eq("lesson_id", lessonId)
    .single();

  if (error || !summary) {
    return NextResponse.json(
      { error: "Resumen no disponible para esta leccion" },
      { status: 404 },
    );
  }

  return NextResponse.json(summary, {
    headers: {
      "Cache-Control": "private, max-age=3600",
    },
  });
}
