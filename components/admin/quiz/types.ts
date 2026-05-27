export type Program = { id: string; name: string };

export type QuizQuestion = {
  id: string;
  program_id: string;
  lesson_id: string | null;
  question_text: string;
  options: Record<string, string>;
  correct_option: string;
  explanation: string | null;
  is_generated: boolean;
  sort_order: number;
  lessons?: { title: string } | null;
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

export type Certificate = {
  id: string;
  studentName: string;
  verificationCode: string;
  issuedAt: string;
  pdfUrl: string | null;
};

export type Tab = "preguntas" | "configuracion" | "intentos" | "certificados";

export type QuizManagerProps = {
  programs: { id: string; name: string }[];
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
