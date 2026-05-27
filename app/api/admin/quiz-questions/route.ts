import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET  /api/admin/quiz-questions?programId=xxx
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

  const { data: questions, error } = await admin
    .from("quiz_questions")
    .select("*, lessons(title)")
    .eq("program_id", programId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching quiz questions:", error);
    return NextResponse.json({ error: "Error al obtener preguntas" }, { status: 500 });
  }

  return NextResponse.json({ questions: questions ?? [] });
}

// ---------------------------------------------------------------------------
// POST  /api/admin/quiz-questions
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

  const { programId, questionText, options, correctOption, explanation, lessonId } =
    body as {
      programId?: string;
      questionText?: string;
      options?: Record<string, string>;
      correctOption?: string;
      explanation?: string;
      lessonId?: string;
    };

  if (!programId || !questionText || !options || !correctOption) {
    return NextResponse.json(
      { error: "programId, questionText, options y correctOption son requeridos" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  // Determine next sort_order
  const { data: lastQuestion } = await admin
    .from("quiz_questions")
    .select("sort_order")
    .eq("program_id", programId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const nextSortOrder = (lastQuestion?.sort_order ?? 0) + 1;

  const { data: created, error } = await admin
    .from("quiz_questions")
    .insert({
      program_id: programId,
      lesson_id: lessonId ?? null,
      question_text: questionText,
      options,
      correct_option: correctOption,
      explanation: explanation ?? null,
      is_generated: false,
      sort_order: nextSortOrder,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating quiz question:", error);
    return NextResponse.json({ error: "Error al crear pregunta" }, { status: 500 });
  }

  return NextResponse.json({ question: created }, { status: 201 });
}

// ---------------------------------------------------------------------------
// PATCH  /api/admin/quiz-questions
// ---------------------------------------------------------------------------

export async function PATCH(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { questionId, questionText, options, correctOption, explanation, sortOrder } =
    body as {
      questionId?: string;
      questionText?: string;
      options?: Record<string, string>;
      correctOption?: string;
      explanation?: string;
      sortOrder?: number;
    };

  if (!questionId) {
    return NextResponse.json({ error: "questionId es requerido" }, { status: 422 });
  }

  const updates: Record<string, unknown> = {};
  if (questionText !== undefined) updates.question_text = questionText;
  if (options !== undefined) updates.options = options;
  if (correctOption !== undefined) updates.correct_option = correctOption;
  if (explanation !== undefined) updates.explanation = explanation;
  if (sortOrder !== undefined) updates.sort_order = sortOrder;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No se enviaron campos para actualizar" }, { status: 422 });
  }

  const admin = createAdminClient();

  const { data: updated, error } = await admin
    .from("quiz_questions")
    .update(updates as never)
    .eq("id", questionId)
    .select()
    .single();

  if (error) {
    console.error("Error updating quiz question:", error);
    return NextResponse.json({ error: "Error al actualizar pregunta" }, { status: 500 });
  }

  return NextResponse.json({ question: updated });
}

// ---------------------------------------------------------------------------
// DELETE  /api/admin/quiz-questions?id=xxx
// ---------------------------------------------------------------------------

export async function DELETE(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id es requerido" }, { status: 422 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("quiz_questions")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting quiz question:", error);
    return NextResponse.json({ error: "Error al eliminar pregunta" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
