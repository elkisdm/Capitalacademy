"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/admin/toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Program = { id: string; name: string };

type QuizQuestion = {
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

type QuizConfig = {
  id: string;
  program_id: string;
  min_completion_pct: number;
  passing_grade_pct: number;
  questions_per_attempt: number;
  max_attempts: number;
  time_limit_minutes: number | null;
  is_active: boolean;
};

type QuizAttempt = {
  id: string;
  studentName: string;
  scorePct: number | null;
  passed: boolean | null;
  startedAt: string;
  completedAt: string | null;
};

type Certificate = {
  id: string;
  studentName: string;
  verificationCode: string;
  issuedAt: string;
  pdfUrl: string | null;
};

type Tab = "preguntas" | "configuracion" | "intentos" | "certificados";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONFIG_DEFAULTS = {
  min_completion_pct: 80,
  passing_grade_pct: 70,
  questions_per_attempt: 10,
  max_attempts: 3,
  time_limit_minutes: null as number | null,
  is_active: false,
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Icons (inline SVG to match sidebar pattern)
// ---------------------------------------------------------------------------

function SparklesIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-transform duration-200"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function LoaderIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "preguntas", label: "Preguntas" },
    { id: "configuracion", label: "Configuracion" },
    { id: "intentos", label: "Intentos" },
    { id: "certificados", label: "Certificados" },
  ];

  return (
    <div className="flex gap-1 rounded-2xl bg-ca-bg-soft p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className="rounded-xl px-4 py-2 text-[13px] font-bold tracking-tight transition-all"
          style={{
            background: active === t.id ? "var(--color-ca-ink)" : "transparent",
            color: active === t.id ? "#fff" : "var(--color-ca-ink-soft)",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Card
// ---------------------------------------------------------------------------

function QuestionCard({
  question,
  index,
  onSave,
  onDelete,
}: {
  question: QuizQuestion;
  index: number;
  onSave: (q: QuizQuestion) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(question.question_text);
  const [opts, setOpts] = useState<Record<string, string>>({ ...question.options });
  const [correct, setCorrect] = useState(question.correct_option);
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [showExplanation, setShowExplanation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty =
    text !== question.question_text ||
    correct !== question.correct_option ||
    explanation !== (question.explanation ?? "") ||
    JSON.stringify(opts) !== JSON.stringify(question.options);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      ...question,
      question_text: text,
      options: opts,
      correct_option: correct,
      explanation: explanation || null,
    });
    setSaving(false);
    setEditing(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(question.id);
    setDeleting(false);
  };

  return (
    <div className="ca-card overflow-hidden">
      <div className="p-5">
        {/* Header row */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] font-bold text-ca-ink-soft">
              #{String(index + 1).padStart(2, "0")}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                background: question.is_generated
                  ? "rgba(94,23,235,0.10)"
                  : "rgba(20,22,58,0.06)",
                color: question.is_generated
                  ? "var(--color-ca-violet)"
                  : "var(--color-ca-ink-soft)",
              }}
            >
              {question.is_generated ? "IA" : "Manual"}
            </span>
            {question.lessons?.title && (
              <span className="rounded-full bg-ca-bg-soft px-2 py-0.5 text-[10px] font-semibold text-ca-ink-soft">
                {question.lessons.title}
              </span>
            )}
          </div>
          <button
            onClick={() => setEditing(!editing)}
            className="text-[12px] font-bold text-ca-violet hover:underline"
          >
            {editing ? "Cancelar" : "Editar"}
          </button>
        </div>

        {/* Question text */}
        {editing ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
          />
        ) : (
          <p className="text-[14px] font-semibold leading-relaxed text-ca-ink">{question.question_text}</p>
        )}

        {/* Options */}
        <div className="mt-3 grid gap-2">
          {(["A", "B", "C", "D"] as const).map((key) => {
            const isCorrect = correct === key;
            return (
              <div key={key} className="flex items-center gap-2">
                {editing ? (
                  <button
                    type="button"
                    onClick={() => setCorrect(key)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors"
                    style={{
                      borderColor: isCorrect ? "var(--color-ca-lime-deep)" : "rgba(20,22,58,0.12)",
                      background: isCorrect ? "rgba(168,211,16,0.18)" : "transparent",
                    }}
                  >
                    {isCorrect && (
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-ca-lime-deep)" }} />
                    )}
                  </button>
                ) : (
                  <div
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                    style={{
                      background: isCorrect ? "rgba(168,211,16,0.22)" : "rgba(20,22,58,0.05)",
                      color: isCorrect ? "#3f5a05" : "var(--color-ca-ink-soft)",
                    }}
                  >
                    {isCorrect ? <CheckCircleIcon /> : key}
                  </div>
                )}
                {editing ? (
                  <input
                    value={opts[key] ?? ""}
                    onChange={(e) => setOpts({ ...opts, [key]: e.target.value })}
                    className="min-w-0 flex-1 rounded-xl border border-ca-ink/[0.08] bg-white px-3 py-2 text-[13px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
                    placeholder={`Opcion ${key}`}
                  />
                ) : (
                  <span
                    className="text-[13px]"
                    style={{
                      color: isCorrect ? "#3f5a05" : "var(--color-ca-ink)",
                      fontWeight: isCorrect ? 700 : 500,
                    }}
                  >
                    <span className="mr-1.5 font-mono text-[11px] font-bold text-ca-ink-soft">{key}.</span>
                    {opts[key]}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Explanation (collapsible) */}
        <div className="mt-3">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-ca-ink-soft hover:text-ca-ink"
          >
            <ChevronIcon open={showExplanation} />
            Explicacion
          </button>
          {showExplanation && (
            <div className="mt-2">
              {editing ? (
                <textarea
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  rows={2}
                  placeholder="Justificacion de la respuesta correcta..."
                  className="w-full rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[13px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
                />
              ) : (
                <p className="text-[13px] leading-relaxed text-ca-ink-soft">
                  {question.explanation || "Sin explicacion"}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {editing && (
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-ca-ink transition-colors disabled:opacity-40"
              style={{ background: "var(--color-ca-lime)" }}
            >
              {saving ? <LoaderIcon /> : <CheckCircleIcon />}
              Guardar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-red-600/70 transition-colors hover:bg-red-50 disabled:opacity-40"
            >
              {deleting ? <LoaderIcon /> : <TrashIcon />}
              Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Question Form
// ---------------------------------------------------------------------------

function AddQuestionForm({
  programId,
  onAdded,
}: {
  programId: string;
  onAdded: (q: QuizQuestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [opts, setOpts] = useState({ A: "", B: "", C: "", D: "" });
  const [correct, setCorrect] = useState("A");
  const [explanation, setExplanation] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast, ToastContainer } = useToast();

  const valid = text.trim() && opts.A.trim() && opts.B.trim() && opts.C.trim() && opts.D.trim();

  const reset = () => {
    setText("");
    setOpts({ A: "", B: "", C: "", D: "" });
    setCorrect("A");
    setExplanation("");
  };

  const handleSubmit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/quiz-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          questionText: text.trim(),
          options: opts,
          correctOption: correct,
          explanation: explanation.trim() || undefined,
        }),
      });
      if (res.ok) {
        const { question } = await res.json();
        onAdded(question);
        reset();
        setOpen(false);
        toast("Pregunta agregada", "success");
      } else {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        toast(err.error ?? "Error al agregar", "error");
      }
    } catch {
      toast("Error de conexion", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <>
        <ToastContainer />
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-xl border-2 border-dashed border-ca-ink/[0.10] px-4 py-3 text-[13px] font-bold text-ca-ink-soft transition-colors hover:border-ca-violet/30 hover:text-ca-violet"
        >
          <PlusIcon />
          Agregar pregunta manual
        </button>
      </>
    );
  }

  return (
    <>
      <ToastContainer />
      <div className="ca-card overflow-hidden border-2 border-ca-violet/20">
        <div className="border-b border-ca-ink/[0.06] bg-ca-bg-soft px-5 py-3">
          <span className="text-[13px] font-bold text-ca-ink">Nueva pregunta manual</span>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Pregunta
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="Escribe la pregunta..."
              className="w-full rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Opciones
            </label>
            <div className="grid gap-2">
              {(["A", "B", "C", "D"] as const).map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrect(key)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold transition-colors"
                    style={{
                      borderColor: correct === key ? "var(--color-ca-lime-deep)" : "rgba(20,22,58,0.12)",
                      background: correct === key ? "rgba(168,211,16,0.18)" : "transparent",
                      color: correct === key ? "#3f5a05" : "var(--color-ca-ink-soft)",
                    }}
                  >
                    {correct === key ? (
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-ca-lime-deep)" }} />
                    ) : (
                      key
                    )}
                  </button>
                  <input
                    value={opts[key]}
                    onChange={(e) => setOpts({ ...opts, [key]: e.target.value })}
                    placeholder={`Opcion ${key}`}
                    className="min-w-0 flex-1 rounded-xl border border-ca-ink/[0.08] bg-white px-3 py-2 text-[13px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
                  />
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-ca-ink-soft">
              Haz click en el circulo para marcar la respuesta correcta
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Explicacion (opcional)
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={2}
              placeholder="Por que esta es la respuesta correcta..."
              className="w-full rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[13px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={saving || !valid}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-ca-ink transition-colors disabled:opacity-40"
              style={{ background: "var(--color-ca-lime)" }}
            >
              {saving ? <LoaderIcon /> : <PlusIcon />}
              {saving ? "Guardando..." : "Agregar pregunta"}
            </button>
            <button
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-ca-ink-soft transition-colors hover:bg-ca-bg-soft"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab: Preguntas
// ---------------------------------------------------------------------------

function PreguntasTab({
  programId,
  questions,
  setQuestions,
  loading,
}: {
  programId: string;
  questions: QuizQuestion[];
  setQuestions: React.Dispatch<React.SetStateAction<QuizQuestion[]>>;
  loading: boolean;
}) {
  const [generating, setGenerating] = useState(false);
  const { toast, ToastContainer } = useToast();

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      });
      if (res.ok) {
        const { questionCount } = await res.json();
        toast(`${questionCount} preguntas generadas con IA`, "success");
        // Refresh questions list
        const refresh = await fetch(`/api/admin/quiz-questions?programId=${programId}`);
        if (refresh.ok) {
          const { questions: fresh } = await refresh.json();
          setQuestions(fresh);
        }
      } else {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        toast(err.error ?? "Error al generar", "error");
      }
    } catch {
      toast("Error de conexion", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (q: QuizQuestion) => {
    const res = await fetch("/api/admin/quiz-questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: q.id,
        questionText: q.question_text,
        options: q.options,
        correctOption: q.correct_option,
        explanation: q.explanation,
      }),
    });
    if (res.ok) {
      const { question: updated } = await res.json();
      setQuestions((prev) =>
        prev.map((p) => (p.id === q.id ? { ...p, ...updated } : p)),
      );
      toast("Pregunta actualizada", "success");
    } else {
      toast("Error al guardar", "error");
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/quiz-questions?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setQuestions((prev) => prev.filter((p) => p.id !== id));
      toast("Pregunta eliminada", "success");
    } else {
      toast("Error al eliminar", "error");
    }
  };

  const handleAdded = (q: QuizQuestion) => {
    setQuestions((prev) => [...prev, q]);
  };

  return (
    <div>
      <ToastContainer />

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[13px] font-bold text-ca-ink">
            {questions.length} {questions.length === 1 ? "pregunta" : "preguntas"} en el pool
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white transition-colors disabled:opacity-60"
            style={{ background: "var(--color-ca-violet)" }}
          >
            {generating ? <LoaderIcon /> : <SparklesIcon />}
            {generating ? "Generando..." : "Generar con IA"}
          </button>
        </div>
      </div>

      {/* Add manual question form */}
      <div className="mb-4">
        <AddQuestionForm programId={programId} onAdded={handleAdded} />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="grid place-items-center py-16">
          <LoaderIcon />
          <p className="mt-3 text-[13px] font-semibold text-ca-ink-soft">Cargando preguntas...</p>
        </div>
      )}

      {/* Question list */}
      {!loading && questions.length === 0 && (
        <div className="grid place-items-center py-16">
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ca-bg-soft">
              <SparklesIcon />
            </div>
            <div className="mt-3 text-[14px] font-bold text-ca-ink">Sin preguntas</div>
            <div className="text-[12px] text-ca-ink-soft">
              Genera preguntas con IA o agrega manualmente.
            </div>
          </div>
        </div>
      )}

      {!loading && questions.length > 0 && (
        <div className="flex flex-col gap-3">
          {questions.map((q, idx) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={idx}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Configuracion
// ---------------------------------------------------------------------------

function ConfiguracionTab({ programId }: { programId: string }) {
  const [config, setConfig] = useState(CONFIG_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, ToastContainer } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/quiz-config?programId=${programId}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            if (data.config) {
              setConfig({
                min_completion_pct: data.config.min_completion_pct,
                passing_grade_pct: data.config.passing_grade_pct,
                questions_per_attempt: data.config.questions_per_attempt,
                max_attempts: data.config.max_attempts,
                time_limit_minutes: data.config.time_limit_minutes,
                is_active: data.config.is_active,
              });
            } else if (data.defaults) {
              setConfig(data.defaults);
            }
          }
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [programId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/quiz-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          minCompletionPct: config.min_completion_pct,
          passingGradePct: config.passing_grade_pct,
          questionsPerAttempt: config.questions_per_attempt,
          maxAttempts: config.max_attempts,
          timeLimitMinutes: config.time_limit_minutes,
          isActive: config.is_active,
        }),
      });
      if (res.ok) {
        toast("Configuracion guardada", "success");
      } else {
        toast("Error al guardar configuracion", "error");
      }
    } catch {
      toast("Error de conexion", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="grid place-items-center py-16">
        <LoaderIcon />
        <p className="mt-3 text-[13px] font-semibold text-ca-ink-soft">Cargando configuracion...</p>
      </div>
    );
  }

  return (
    <div>
      <ToastContainer />

      <div className="mb-5 flex items-center gap-3">
        <span
          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{
            background: config.is_active ? "rgba(168,211,16,0.22)" : "rgba(20,22,58,0.06)",
            color: config.is_active ? "#3f5a05" : "var(--color-ca-ink-soft)",
          }}
        >
          {config.is_active ? "Activo" : "Inactivo"}
        </span>
      </div>

      <div className="ca-card p-5">
        <div className="grid gap-5 md:grid-cols-2">
          {/* Completitud minima */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Completitud minima
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={config.min_completion_pct}
                onChange={(e) => setConfig({ ...config, min_completion_pct: Number(e.target.value) })}
                className="w-24 rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-mono text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
              />
              <span className="text-[13px] font-semibold text-ca-ink-soft">%</span>
            </div>
            <p className="mt-1 text-[11px] text-ca-ink-soft">
              Porcentaje de lecciones completadas requerido para habilitar el quiz
            </p>
          </div>

          {/* Nota de aprobacion */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Nota de aprobacion
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={config.passing_grade_pct}
                onChange={(e) => setConfig({ ...config, passing_grade_pct: Number(e.target.value) })}
                className="w-24 rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-mono text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
              />
              <span className="text-[13px] font-semibold text-ca-ink-soft">%</span>
            </div>
            <p className="mt-1 text-[11px] text-ca-ink-soft">
              Nota minima para aprobar el quiz
            </p>
          </div>

          {/* Preguntas por intento */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Preguntas por intento
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={config.questions_per_attempt}
              onChange={(e) => setConfig({ ...config, questions_per_attempt: Number(e.target.value) })}
              className="w-24 rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-mono text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
            />
            <p className="mt-1 text-[11px] text-ca-ink-soft">
              Cantidad de preguntas aleatorias por cada intento
            </p>
          </div>

          {/* Maximo intentos */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Maximo intentos
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={config.max_attempts}
              onChange={(e) => setConfig({ ...config, max_attempts: Number(e.target.value) })}
              className="w-24 rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-mono text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
            />
            <p className="mt-1 text-[11px] text-ca-ink-soft">
              Numero maximo de intentos permitidos por alumno
            </p>
          </div>

          {/* Tiempo limite */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Tiempo limite (minutos)
            </label>
            <input
              type="number"
              min={0}
              max={360}
              value={config.time_limit_minutes ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  time_limit_minutes: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="Sin limite"
              className="w-32 rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-mono text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
            />
            <p className="mt-1 text-[11px] text-ca-ink-soft">
              Dejar vacio para sin limite de tiempo
            </p>
          </div>

          {/* Quiz activo */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Quiz activo
            </label>
            <button
              type="button"
              onClick={() => setConfig({ ...config, is_active: !config.is_active })}
              className="relative h-7 w-12 rounded-full transition-colors"
              style={{
                background: config.is_active
                  ? "var(--color-ca-lime-deep)"
                  : "rgba(20,22,58,0.12)",
              }}
            >
              <div
                className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform"
                style={{
                  transform: config.is_active ? "translateX(22px)" : "translateX(2px)",
                }}
              />
            </button>
            <p className="mt-1 text-[11px] text-ca-ink-soft">
              Los alumnos solo veran el quiz si esta activo
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-ca-ink/[0.06] pt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-ca-ink transition-colors disabled:opacity-40"
            style={{ background: "var(--color-ca-lime)" }}
          >
            {saving ? <LoaderIcon /> : <CheckCircleIcon />}
            {saving ? "Guardando..." : "Guardar configuracion"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Intentos
// ---------------------------------------------------------------------------

function IntentosTab({ programId }: { programId: string }) {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/quiz-attempts?programId=${programId}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setAttempts(data.attempts ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [programId]);

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <LoaderIcon />
        <p className="mt-3 text-[13px] font-semibold text-ca-ink-soft">Cargando intentos...</p>
      </div>
    );
  }

  // Stats
  const totalAttempts = attempts.length;
  const completed = attempts.filter((a) => a.completedAt);
  const passed = completed.filter((a) => a.passed === true);
  const passRate = completed.length > 0 ? Math.round((passed.length / completed.length) * 100) : 0;
  const avgScore =
    completed.length > 0
      ? Math.round(completed.reduce((sum, a) => sum + (a.scorePct ?? 0), 0) / completed.length)
      : 0;

  return (
    <div>
      {/* Stats */}
      <div className="mb-5 grid grid-cols-3 gap-4">
        <div className="ca-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Total intentos</div>
          <div className="mt-1 font-mono text-[28px] font-black text-ca-ink">{totalAttempts}</div>
        </div>
        <div className="ca-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Tasa aprobacion</div>
          <div className="mt-1 font-mono text-[28px] font-black" style={{ color: "var(--color-ca-lime-deep)" }}>
            {passRate}%
          </div>
        </div>
        <div className="ca-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Nota promedio</div>
          <div className="mt-1 font-mono text-[28px] font-black" style={{ color: "var(--color-ca-violet)" }}>
            {avgScore}%
          </div>
        </div>
      </div>

      {/* Table */}
      {attempts.length === 0 ? (
        <div className="grid place-items-center py-16">
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ca-bg-soft">
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            </div>
            <div className="mt-3 text-[14px] font-bold text-ca-ink">Sin intentos</div>
            <div className="text-[12px] text-ca-ink-soft">
              Aun no hay alumnos que hayan tomado el quiz.
            </div>
          </div>
        </div>
      ) : (
        <div className="ca-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--color-ca-bg-soft)" }}>
                  <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Alumno
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Nota
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Fecha
                  </th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => {
                  const status =
                    a.completedAt == null
                      ? { label: "En progreso", bg: "rgba(20,22,58,0.06)", color: "var(--color-ca-ink-soft)" }
                      : a.passed
                        ? { label: "Aprobado", bg: "rgba(168,211,16,0.22)", color: "#3f5a05" }
                        : { label: "Reprobado", bg: "rgba(245,158,11,0.18)", color: "#92400e" };

                  return (
                    <tr key={a.id} className="border-t border-ca-ink/[0.08] transition-colors hover:bg-ca-bg-soft">
                      <td className="px-5 py-3">
                        <span className="text-[13px] font-bold text-ca-ink">{a.studentName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[15px] font-black text-ca-ink">
                          {a.scorePct != null ? `${a.scorePct}%` : "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: status.bg, color: status.color }}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[12px] font-medium text-ca-ink-soft">
                          {formatDate(a.completedAt ?? a.startedAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Certificados
// ---------------------------------------------------------------------------

function CertificadosTab({ programId }: { programId: string }) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState("");
  const { toast, ToastContainer } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/certificates?programId=${programId}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setCertificates(data.certificates ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [programId]);

  const handleIssue = async () => {
    if (!enrollmentId.trim()) return;
    setIssuing(true);
    try {
      const res = await fetch("/api/admin/certificates/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId: enrollmentId.trim() }),
      });
      if (res.ok) {
        toast("Certificado emitido exitosamente", "success");
        setEnrollmentId("");
        setShowIssueForm(false);
        // Refresh
        const refresh = await fetch(`/api/admin/certificates?programId=${programId}`);
        if (refresh.ok) {
          const data = await refresh.json();
          setCertificates(data.certificates ?? []);
        }
      } else {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        toast(err.error ?? "Error al emitir", "error");
      }
    } catch {
      toast("Error de conexion", "error");
    } finally {
      setIssuing(false);
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <LoaderIcon />
        <p className="mt-3 text-[13px] font-semibold text-ca-ink-soft">Cargando certificados...</p>
      </div>
    );
  }

  return (
    <div>
      <ToastContainer />

      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <span className="font-mono text-[13px] font-bold text-ca-ink">
          {certificates.length} {certificates.length === 1 ? "certificado" : "certificados"} emitidos
        </span>
        <button
          onClick={() => setShowIssueForm(!showIssueForm)}
          className="flex items-center gap-2 rounded-xl border-2 border-ca-violet/20 px-4 py-2 text-[13px] font-bold text-ca-violet transition-colors hover:bg-ca-violet/5"
        >
          <PlusIcon />
          Emitir manualmente
        </button>
      </div>

      {/* Issue form */}
      {showIssueForm && (
        <div className="ca-card mb-5 border-2 border-ca-violet/20 p-5">
          <div className="mb-3 text-[13px] font-bold text-ca-ink">Emitir certificado manual</div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
                ID de enrollment
              </label>
              <input
                value={enrollmentId}
                onChange={(e) => setEnrollmentId(e.target.value)}
                placeholder="ej: abc123-def456..."
                className="w-full rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-mono text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
              />
            </div>
            <button
              onClick={handleIssue}
              disabled={issuing || !enrollmentId.trim()}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-ca-ink transition-colors disabled:opacity-40"
              style={{ background: "var(--color-ca-lime)" }}
            >
              {issuing ? <LoaderIcon /> : <CheckCircleIcon />}
              {issuing ? "Emitiendo..." : "Emitir"}
            </button>
            <button
              onClick={() => {
                setShowIssueForm(false);
                setEnrollmentId("");
              }}
              className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-ca-ink-soft hover:bg-ca-bg-soft"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {certificates.length === 0 ? (
        <div className="grid place-items-center py-16">
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ca-bg-soft">
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M7 8h10M7 12h6" />
              </svg>
            </div>
            <div className="mt-3 text-[14px] font-bold text-ca-ink">Sin certificados</div>
            <div className="text-[12px] text-ca-ink-soft">
              Aun no se han emitido certificados para este programa.
            </div>
          </div>
        </div>
      ) : (
        <div className="ca-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--color-ca-bg-soft)" }}>
                  <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Alumno
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Codigo
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Fecha emision
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    PDF
                  </th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((c) => (
                  <tr key={c.id} className="border-t border-ca-ink/[0.08] transition-colors hover:bg-ca-bg-soft">
                    <td className="px-5 py-3">
                      <span className="text-[13px] font-bold text-ca-ink">{c.studentName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[12px] font-semibold text-ca-ink-soft">
                        {c.verificationCode}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] font-medium text-ca-ink-soft">
                        {formatDate(c.issuedAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.pdfUrl ? (
                        <a
                          href={c.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold text-ca-violet transition-colors hover:bg-ca-violet/5"
                        >
                          <DownloadIcon />
                          Descargar
                        </a>
                      ) : (
                        <span className="text-[11px] text-ca-ink-soft">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

type QuizManagerProps = {
  programs: { id: string; name: string }[];
};

export function QuizManager({ programs }: QuizManagerProps) {
  const [selectedProgram, setSelectedProgram] = useState(programs[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>("preguntas");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Load questions when program changes
  const fetchQuestions = useCallback(async (programId: string) => {
    if (!programId) return;
    setLoadingQuestions(true);
    try {
      const res = await fetch(`/api/admin/quiz-questions?programId=${programId}`);
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions ?? []);
      }
    } finally {
      setLoadingQuestions(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProgram) {
      fetchQuestions(selectedProgram);
    }
  }, [selectedProgram, fetchQuestions]);

  if (programs.length === 0) {
    return (
      <div className="grid place-items-center py-16">
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ca-bg-soft">
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <div className="mt-3 text-[14px] font-bold text-ca-ink">Sin programas</div>
          <div className="text-[12px] text-ca-ink-soft">Crea un programa antes de gestionar quizzes.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Program selector */}
      {programs.length > 1 && (
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
            Programa
          </label>
          <select
            value={selectedProgram}
            onChange={(e) => {
              setSelectedProgram(e.target.value);
              setTab("preguntas");
            }}
            className="rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-semibold text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
          >
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Single program — show name */}
      {programs.length === 1 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Programa:</span>
          <span className="text-[14px] font-bold text-ca-ink">{programs[0].name}</span>
        </div>
      )}

      {/* Tabs */}
      <TabBar active={tab} onChange={setTab} />

      {/* Tab content */}
      {tab === "preguntas" && (
        <PreguntasTab
          programId={selectedProgram}
          questions={questions}
          setQuestions={setQuestions}
          loading={loadingQuestions}
        />
      )}
      {tab === "configuracion" && <ConfiguracionTab programId={selectedProgram} />}
      {tab === "intentos" && <IntentosTab programId={selectedProgram} />}
      {tab === "certificados" && <CertificadosTab programId={selectedProgram} />}
    </div>
  );
}
