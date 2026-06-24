export type Program = { id: string; name: string };

export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "short_answer";

export type EvaluationScope = "final" | "module" | "lesson" | "session";

export type QuizQuestion = {
  id: string;
  program_id: string;
  evaluation_id: string | null;
  lesson_id: string | null;
  question_text: string;
  options: Record<string, string>;
  question_type: QuestionType;
  // Respuesta correcta unificada (jsonb):
  //   single_choice / true_false → "A"
  //   multiple_choice            → ["A","C"]
  //   short_answer               → ["respuesta aceptada", "sinónimo"]
  correct_answer: string | string[] | null;
  // Legacy single_choice; se conserva para compat. Usa correct_answer en lo nuevo.
  correct_option: string | null;
  explanation: string | null;
  is_generated: boolean;
  sort_order: number;
  lessons?: { title: string } | null;
};

export type Evaluation = {
  id: string;
  program_id: string;
  scope: EvaluationScope;
  module_id: string | null;
  lesson_id: string | null;
  session_id: string | null;
  title: string;
  description: string | null;
  passing_grade_pct: number;
  questions_per_attempt: number | null;
  max_attempts: number;
  time_limit_minutes: number | null;
  min_completion_pct: number | null;
  is_active: boolean;
};

export type QuizConfig = {
  id: string;
  program_id: string;
  min_completion_pct: number;
  passing_grade_pct: number;
  questions_per_attempt: number;
  max_attempts: number;
  time_limit_minutes: number | null;
  is_active: boolean;
};

export type QuizAttempt = {
  id: string;
  studentName: string;
  scorePct: number | null;
  passed: boolean | null;
  startedAt: string;
  completedAt: string | null;
};

/** Desglose pregunta-a-pregunta de un intento (vista admin "Respuestas"). */
export type AttemptBreakdownItem = {
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  givenDisplay: string;
  correctDisplay: string;
  isCorrect: boolean;
};

/** Intento de una evaluación con su desglose, servido por
 *  GET /api/admin/evaluations/[id]/attempts. */
export type EvaluationAttempt = {
  id: string;
  studentName: string;
  scorePct: number | null;
  passed: boolean | null;
  startedAt: string;
  completedAt: string | null;
  totalPresented: number;
  correctCount: number;
  breakdown: AttemptBreakdownItem[];
};

export type Certificate = {
  id: string;
  studentName: string;
  verificationCode: string;
  issuedAt: string;
  pdfUrl: string | null;
};

export type Tab = "evaluaciones" | "preguntas" | "configuracion" | "intentos" | "certificados";

export type QuizManagerProps = {
  programs: { id: string; name: string }[];
  /** Entorno activo (program_id) para preseleccionar el programa. */
  initialProgramId?: string;
};

export const CONFIG_DEFAULTS = {
  min_completion_pct: 80,
  passing_grade_pct: 70,
  questions_per_attempt: 10,
  max_attempts: 3,
  time_limit_minutes: null as number | null,
  is_active: false,
};

export function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
