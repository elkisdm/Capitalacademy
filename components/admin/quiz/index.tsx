"use client";

import { useState, useEffect, useCallback } from "react";
import type { Tab, QuizQuestion, QuizManagerProps } from "./types";
import { TabBar } from "./tab-bar";
import { EvaluacionesTab } from "./evaluaciones-tab";
import { PreguntasTab } from "./preguntas-tab";
import { ConfiguracionTab } from "./configuracion-tab";
import { IntentosTab } from "./intentos-tab";
import { CertificadosTab } from "./certificados-tab";

export function QuizManager({ programs, initialProgramId }: QuizManagerProps) {
  const [selectedProgram, setSelectedProgram] = useState(
    initialProgramId && programs.some((p) => p.id === initialProgramId)
      ? initialProgramId
      : programs[0]?.id ?? "",
  );
  const [tab, setTab] = useState<Tab>("evaluaciones");
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
    // Carga inicial de preguntas: sincroniza con un sistema externo (la API).
    if (selectedProgram) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
              setTab("evaluaciones");
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
      {tab === "evaluaciones" && <EvaluacionesTab programId={selectedProgram} />}
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
