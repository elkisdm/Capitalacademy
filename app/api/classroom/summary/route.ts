import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, module_id, program_modules(program_id)")
    .eq("id", lessonId)
    .single();

  if (!lesson) {
    return NextResponse.json(
      { error: "Leccion no encontrada" },
      { status: 404 },
    );
  }

  const programModule = lesson.program_modules as {
    program_id: string;
  } | null;
  if (!programModule) {
    return NextResponse.json(
      { error: "Modulo no encontrado" },
      { status: 404 },
    );
  }

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("id")
    .eq("program_id", programModule.program_id)
    .in("status", ["active", "planned"])
    .limit(1)
    .single();

  if (!cohort) {
    return NextResponse.json(
      { error: "Cohorte no encontrada" },
      { status: 404 },
    );
  }

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("student_id", user.id)
    .eq("cohort_id", cohort.id)
    .eq("status", "active")
    .single();

  if (!enrollment) {
    return NextResponse.json(
      { error: "No tienes matricula activa en esta cohorte" },
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
      "Cache-Control": "public, max-age=3600",
    },
  });
}
