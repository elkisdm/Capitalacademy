"use client";

type QuestionType = "single_choice" | "multiple_choice" | "true_false" | "short_answer";

export type RunnerQuestion = {
  id: string;
  question_text: string;
  options: Record<string, string>;
  question_type: QuestionType;
};

export type AnswerValue = string | string[] | undefined;

/**
 * Render del input de UNA pregunta según su tipo. En modo revisión (`review`),
 * marca la(s) respuesta(s) correcta(s) y la elegida, y bloquea la edición.
 */
export function QuestionInput({
  question,
  value,
  onChange,
  review,
}: {
  question: RunnerQuestion;
  value: AnswerValue;
  onChange?: (v: AnswerValue) => void;
  review?: { correctAnswer: unknown; isCorrect: boolean };
}) {
  const disabled = !!review;
  const correctSet = toSet(review?.correctAnswer);

  if (question.question_type === "short_answer") {
    return (
      <div>
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          placeholder="Tu respuesta…"
          aria-label="Tu respuesta"
          className="w-full rounded-xl border border-ca-ink/[0.10] bg-white px-4 py-2.5 text-[16px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40 disabled:opacity-70 md:text-[14px]"
        />
        {review && (
          <p className="mt-2 text-[12px] font-semibold text-ca-ink-soft">
            Respuestas aceptadas:{" "}
            <span style={{ color: "#3f5a05" }}>
              {Array.isArray(review.correctAnswer) ? review.correctAnswer.join(", ") : ""}
            </span>
          </p>
        )}
      </div>
    );
  }

  // Opción única / V-F (selección exclusiva) o múltiple (toggle).
  const multi = question.question_type === "multiple_choice";
  const selected = multi
    ? new Set(Array.isArray(value) ? value : [])
    : new Set(typeof value === "string" ? [value] : []);

  const toggle = (key: string) => {
    if (disabled || !onChange) return;
    if (multi) {
      const next = new Set(selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onChange([...next]);
    } else {
      onChange(key);
    }
  };

  return (
    <div className="grid gap-2">
      {Object.entries(question.options).map(([key, label]) => {
        const isSelected = selected.has(key);
        const isCorrect = correctSet.has(key);
        // Colores en revisión: verde = correcta; rojo = elegida e incorrecta.
        let border = "rgba(20,22,58,0.12)";
        let bg = "transparent";
        if (review) {
          if (isCorrect) {
            border = "var(--color-ca-lime-deep)";
            bg = "rgba(168,211,16,0.16)";
          } else if (isSelected) {
            border = "#dc2626";
            bg = "rgba(220,38,38,0.08)";
          }
        } else if (isSelected) {
          border = "var(--color-ca-violet)";
          bg = "rgba(94,23,235,0.06)";
        }
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            disabled={disabled}
            className={`flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-left transition-[border-color,background,transform,box-shadow] duration-[120ms] ease-[cubic-bezier(0.4,0,0.2,1)] disabled:cursor-not-allowed ${!disabled ? "hover:-translate-y-px hover:shadow-[0_0_0_3px_rgba(94,23,235,0.08)] active:scale-[0.98] active:[transition-duration:60ms]" : ""}`}
            style={{ borderColor: border, background: bg }}
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center text-[11px] font-bold"
              style={{
                borderRadius: multi ? "0.4rem" : "9999px",
                border: `2px solid ${isSelected || (review && isCorrect) ? border : "rgba(20,22,58,0.2)"}`,
                background: isSelected ? border : "transparent",
                color: isSelected ? "white" : "var(--color-ca-ink-soft)",
              }}
            >
              {isSelected ? "✓" : key}
            </span>
            <span className="text-[14px] font-medium text-ca-ink">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function toSet(correctAnswer: unknown): Set<string> {
  if (Array.isArray(correctAnswer)) return new Set(correctAnswer.map(String));
  if (typeof correctAnswer === "string") return new Set([correctAnswer]);
  return new Set();
}
