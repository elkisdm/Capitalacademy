"use client";

import { useState } from "react";
import { useToast } from "@/components/admin/toast";
import type { QuizQuestion } from "./types";
import { LoaderIcon, PlusIcon } from "./icons";

export function AddQuestionForm({
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
