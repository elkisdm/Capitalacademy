import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { scoreAnswer, type QuestionType, type StudentAnswer } from "@/lib/classroom/quiz-runtime";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ evaluationId: string }> };

// ---------------------------------------------------------------------------
// GET  /api/admin/evaluations/[evaluationId]/attempts
//   Intentos de UNA evaluación + desglose pregunta-a-pregunta (respuesta del
//   alumno vs la correcta), para la pestaña "Respuestas" del panel admin.
//   El staff ya tiene acceso a las respuestas correctas (RLS staff), así que el
//   desglose se calcula server-side reusando `scoreAnswer` (misma lógica de
//   corrección que el alumno) y se entrega listo para render.
// ---------------------------------------------------------------------------

type DbQuestion = {
  id: string;
  question_text: string;
  question_type: QuestionType;
  options: Record<string, string> | null;
  correct_answer: unknown;
  correct_option: string | null;
};

/** Convierte una respuesta (letra/set/texto) a algo legible para el admin. */
function toDisplay(
  type: QuestionType,
  value: StudentAnswer,
  options: Record<string, string>,
): string {
  if (value === null || value === undefined || (typeof value === "string" && value === "")) {
    return "—";
  }
  if (type === "short_answer") {
    return Array.isArray(value) ? value.join(" / ") : String(value);
  }
  const keys = Array.isArray(value) ? value : [String(value)];
  return keys.map((k) => options[k] ?? k).join(", ");
}

/** Respuesta correcta normalizada a array de claves/textos para mostrar. */
function correctValue(q: DbQuestion): StudentAnswer {
  if (Array.isArray(q.correct_answer)) return q.correct_answer.map((v) => String(v));
  if (typeof q.correct_answer === "string") return q.correct_answer;
  return q.correct_option ?? null;
}

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { evaluationId } = await params;
  const admin = createAdminClient();

  const { data: questionsRaw, error: questionsError } = await admin
    .from("quiz_questions")
    .select("id, question_text, question_type, options, correct_answer, correct_option")
    .eq("evaluation_id", evaluationId)
    .order("sort_order", { ascending: true });

  if (questionsError) {
    console.error("Error fetching evaluation questions:", questionsError);
    return NextResponse.json({ error: "Error al obtener las preguntas" }, { status: 500 });
  }

  const questions = (questionsRaw ?? []) as DbQuestion[];
  const byId = new Map(questions.map((q) => [q.id, q]));

  const { data: attemptsRaw, error } = await admin
    .from("quiz_attempts")
    .select(
      "id, score_pct, passed, started_at, completed_at, questions_presented, answers, enrollments(student_id, profiles(full_name))",
    )
    .eq("evaluation_id", evaluationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching evaluation attempts:", error);
    return NextResponse.json({ error: "Error al obtener los intentos" }, { status: 500 });
  }

  const attempts = (attemptsRaw ?? []).map((a) => {
    const enrollment = a.enrollments as unknown as {
      student_id: string;
      profiles: { full_name: string | null };
    } | null;

    const presented = (a.questions_presented as string[] | null) ?? [];
    const answers = (a.answers as Record<string, StudentAnswer> | null) ?? {};

    // Si el intento sigue en progreso (sin completar), no hay desglose útil.
    const breakdown =
      a.completed_at == null
        ? []
        : presented
            .map((qid) => {
              const q = byId.get(qid);
              if (!q) return null;
              const options = q.options ?? {};
              const given = answers[qid];
              return {
                questionId: qid,
                questionText: q.question_text,
                questionType: q.question_type,
                givenDisplay: toDisplay(q.question_type, given, options),
                correctDisplay: toDisplay(q.question_type, correctValue(q), options),
                isCorrect: scoreAnswer(
                  { id: q.id, question_type: q.question_type, correct_answer: q.correct_answer },
                  given,
                ),
              };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      id: a.id,
      studentName: enrollment?.profiles?.full_name ?? "Sin nombre",
      scorePct: a.score_pct,
      passed: a.passed,
      startedAt: a.started_at,
      completedAt: a.completed_at,
      totalPresented: presented.length,
      correctCount: breakdown.filter((b) => b.isCorrect).length,
      breakdown,
    };
  });

  return NextResponse.json({ attempts });
}
