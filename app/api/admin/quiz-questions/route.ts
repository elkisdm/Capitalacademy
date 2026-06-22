import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import {
  questionPayloadSchema,
  payloadToDbFields,
} from "@/lib/classroom/quiz-question-schema";

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

  // Destino de la pregunta: una evaluación (preferido) o, por compat con el
  // manager del quiz final, un programa → su evaluación final.
  const targetSchema = z.object({
    evaluationId: uuidLike.optional(),
    programId: uuidLike.optional(),
    lessonId: uuidLike.optional(),
  });
  const target = targetSchema.safeParse(body);
  if (!target.success || (!target.data.evaluationId && !target.data.programId)) {
    return NextResponse.json(
      { error: "Se requiere evaluationId o programId" },
      { status: 422 },
    );
  }

  // El payload de la pregunta (validado por tipo) es lo que define la respuesta.
  const payload = questionPayloadSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: payload.error.issues },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  // Resolver la evaluación dueña y su program_id (anclaje de tenant).
  let evaluationId = target.data.evaluationId ?? null;
  let programId: string;
  if (evaluationId) {
    const { data: ev } = await admin
      .from("evaluations")
      .select("id, program_id")
      .eq("id", evaluationId)
      .single();
    if (!ev) {
      return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
    }
    programId = ev.program_id;
  } else {
    programId = target.data.programId!;
    // Compat: adjunta a la evaluación final del programa (la migrada en 0033).
    const { data: finalEval } = await admin
      .from("evaluations")
      .select("id")
      .eq("program_id", programId)
      .eq("scope", "final")
      .maybeSingle();
    evaluationId = finalEval?.id ?? null;
  }

  const dbFields = payloadToDbFields(payload.data);

  // sort_order siguiente dentro de la evaluación (o del programa si aún no hay eval).
  const { data: lastQuestion } = await admin
    .from("quiz_questions")
    .select("sort_order")
    .eq(evaluationId ? "evaluation_id" : "program_id", evaluationId ?? programId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (lastQuestion?.sort_order ?? 0) + 1;

  const { data: created, error } = await admin
    .from("quiz_questions")
    .insert({
      program_id: programId,
      evaluation_id: evaluationId,
      lesson_id: target.data.lessonId ?? null,
      question_text: payload.data.questionText,
      explanation: payload.data.explanation ?? null,
      is_generated: false,
      sort_order: nextSortOrder,
      ...dbFields,
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

  const { questionId, sortOrder } = body as {
    questionId?: string;
    sortOrder?: number;
  };

  if (!questionId) {
    return NextResponse.json({ error: "questionId es requerido" }, { status: 422 });
  }

  const updates: Record<string, unknown> = {};

  // Si viene un payload de pregunta completo (con questionType), se revalida por
  // tipo y se reemplazan tipo/opciones/respuesta de forma coherente.
  if ((body as { questionType?: string }).questionType !== undefined) {
    const payload = questionPayloadSchema.safeParse(body);
    if (!payload.success) {
      return NextResponse.json(
        { error: "Validación fallida", issues: payload.error.issues },
        { status: 422 },
      );
    }
    Object.assign(updates, payloadToDbFields(payload.data), {
      question_text: payload.data.questionText,
      explanation: payload.data.explanation ?? null,
    });
  }

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

  // Guard: no borrar una pregunta cuya evaluación tiene intentos EN CURSO —
  // rompería el `questions_presented` de ese intento (submit fallaría con 500).
  const { data: q } = await admin
    .from("quiz_questions")
    .select("evaluation_id")
    .eq("id", id)
    .maybeSingle();
  if (q?.evaluation_id) {
    const { count } = await admin
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
      .eq("evaluation_id", q.evaluation_id)
      .is("completed_at", null);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar: hay intentos en curso de esta evaluación" },
        { status: 409 },
      );
    }
  }

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
