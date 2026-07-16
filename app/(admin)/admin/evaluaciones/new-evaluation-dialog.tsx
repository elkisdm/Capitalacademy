"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/admin/toast";
import { LoaderIcon } from "@/components/admin/quiz/icons";
import type { EvaluationKind, EvaluationScope } from "@/components/admin/quiz/types";
import { formatChile } from "@/lib/time";
import { creationBlockers, type EvaluationRow } from "@/lib/admin/evaluation-list";

type ModuleTarget = { id: string; title: string };
type LessonTarget = { id: string; title: string; moduleId: string; moduleTitle: string; isRecording: boolean };
type SessionTarget = { id: string; title: string | null; startsAt: string; moduleTitle: string | null; cohortName: string };

type TargetsResponse = {
  modules: ModuleTarget[];
  lessons: LessonTarget[];
  sessions: SessionTarget[];
};

const SCOPE_OPTIONS: { value: EvaluationScope; label: string }[] = [
  { value: "final", label: "Final del programa" },
  { value: "module", label: "Del módulo" },
  { value: "lesson", label: "De la lección" },
  { value: "session", label: "De la clase en vivo" },
];

/**
 * Modal de creación independiente de cualquier evaluación (Paso 3). Un solo
 * paso, cuatro campos: Tipo, Alcance, Target (condicional) y Título. El tipo
 * y el alcance/target NO son editables después de crear (ADR-0018) — este
 * modal es el único momento para elegirlos.
 */
export function NewEvaluationDialog({
  open,
  onClose,
  programId,
  existingRows,
}: {
  open: boolean;
  onClose: () => void;
  programId: string;
  existingRows: EvaluationRow[];
}) {
  const router = useRouter();
  const { toast, ToastContainer } = useToast();

  const [kind, setKind] = useState<EvaluationKind>("quiz");
  const [scope, setScope] = useState<EvaluationScope>("module");
  const [moduleId, setModuleId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [targets, setTargets] = useState<TargetsResponse>({ modules: [], lessons: [], sessions: [] });
  const [loadingTargets, setLoadingTargets] = useState(false);

  const blockers = useMemo(() => creationBlockers(existingRows), [existingRows]);
  const multiCohort = useMemo(() => new Set(targets.sessions.map((s) => s.cohortName)).size > 1, [targets.sessions]);
  // Las repeticiones de clases en vivo evalúan en su propia sesión (fix
  // 2026-07-13); nunca se ofrecen como target de scope='lesson'.
  const contentLessons = useMemo(() => targets.lessons.filter((l) => !l.isRecording), [targets.lessons]);

  // Reset al abrir/cerrar, y un solo fetch de targets al abrir.
  useEffect(() => {
    if (!open) return;
    setKind("quiz");
    setScope("module");
    setModuleId("");
    setLessonId("");
    setSessionId("");
    setTitle("");
    setTitleTouched(false);
    setLoadingTargets(true);
    fetch(`/api/admin/evaluations/targets?programId=${programId}`)
      .then((res) => (res.ok ? res.json() : { modules: [], lessons: [], sessions: [] }))
      .then((data) => setTargets(data))
      .finally(() => setLoadingTargets(false));
  }, [open, programId]);

  // Una final manual jamás emitiría certificado (ADR-0007 gatea por `passed`
  // de un intento; una manual no tiene intentos) — se bloquea en la UI.
  useEffect(() => {
    if (kind === "manual" && scope === "final") setScope("module");
  }, [kind, scope]);

  // Un módulo admite varias notas manuales pero un solo quiz
  // (`evaluations_one_active_per_module`, 0072). Si el módulo seleccionado ya
  // tiene un quiz y el usuario cambia Tipo a "quiz", la selección queda
  // inválida — se limpia para que vuelva a elegir.
  useEffect(() => {
    if (scope === "module" && kind === "quiz" && moduleId && blockers.moduleQuizzesTaken.has(moduleId)) {
      setModuleId("");
      setTitleTouched(false);
    }
  }, [kind, scope, moduleId, blockers.moduleQuizzesTaken]);

  const selectedModuleTitle = targets.modules.find((m) => m.id === moduleId)?.title ?? "";
  const selectedLessonTitle = contentLessons.find((l) => l.id === lessonId)?.title ?? "";
  const selectedSession = targets.sessions.find((s) => s.id === sessionId) ?? null;
  const selectedSessionLabel = selectedSession
    ? `${selectedSession.title?.trim() || "Clase en vivo"} — ${formatChile(selectedSession.startsAt, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : "";

  // Prefill automático del título mientras el usuario no lo haya editado a mano.
  useEffect(() => {
    if (titleTouched) return;
    if (scope === "final") setTitle("Evaluación final");
    else if (scope === "module" && selectedModuleTitle) setTitle(`Evaluación: ${selectedModuleTitle}`);
    else if (scope === "lesson" && selectedLessonTitle) setTitle(`Evaluación: ${selectedLessonTitle}`);
    else if (scope === "session" && selectedSessionLabel) setTitle(`Evaluación: ${selectedSessionLabel}`);
    else setTitle("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, selectedModuleTitle, selectedLessonTitle, selectedSessionLabel, titleTouched]);

  function handleScopeChange(next: EvaluationScope) {
    setScope(next);
    setModuleId("");
    setLessonId("");
    setSessionId("");
    setTitleTouched(false);
  }

  const canSubmit =
    title.trim().length > 0 &&
    (scope === "final" ||
      (scope === "module" && moduleId) ||
      (scope === "lesson" && lessonId) ||
      (scope === "session" && sessionId));

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          scope,
          kind,
          title: title.trim(),
          ...(scope === "module" ? { moduleId } : {}),
          ...(scope === "lesson" ? { lessonId } : {}),
          ...(scope === "session" ? { sessionId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onClose();
        router.push(`/admin/evaluaciones/${data.evaluation.id}`);
      } else {
        toast(data.error ?? "Error al crear la evaluación", "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="new-evaluation-title" className="max-w-lg">
      <ToastContainer />
      <h2 id="new-evaluation-title" className="text-[17px] font-black tracking-tight text-ca-ink">
        Nueva evaluación
      </h2>

      <div className="mt-5 flex flex-col gap-5">
        {/* Tipo */}
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
            Tipo
          </label>
          <div className="flex items-center gap-1 rounded-2xl bg-ca-bg-soft p-1">
            {(["quiz", "manual"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex-1 rounded-xl px-3 py-2 text-[12.5px] font-bold transition-colors ${
                  kind === k ? "bg-white text-ca-ink shadow-sm" : "text-ca-ink-soft hover:text-ca-ink"
                }`}
              >
                {k === "quiz" ? "Quiz" : "Nota manual"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-ca-ink-soft">
            Un quiz se autocorrige; una nota manual la calificas tú (roleplay, guión de venta). El tipo no se puede
            cambiar después.
          </p>
        </div>

        {/* Alcance */}
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
            Alcance
          </label>
          <Select
            value={scope}
            onChange={(e) => handleScopeChange(e.target.value as EvaluationScope)}
          >
            {SCOPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.value === "final" && (blockers.finalTaken || kind === "manual")}>
                {opt.label}
              </option>
            ))}
          </Select>
          {scope === "final" && blockers.finalTaken && (
            <p className="mt-1.5 text-[12px] text-ca-ink-soft">Este programa ya tiene su evaluación final.</p>
          )}
          {kind === "manual" && (
            <p className="mt-1.5 text-[12px] text-ca-ink-soft">
              La evaluación final debe ser un quiz: es la que emite el certificado.
            </p>
          )}
        </div>

        {/* Target condicional */}
        {scope === "module" && (
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Módulo
            </label>
            <Select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setTitleTouched(false); }} disabled={loadingTargets}>
              <option value="">Selecciona un módulo</option>
              {targets.modules.map((m) => {
                const taken = kind === "quiz" && blockers.moduleQuizzesTaken.has(m.id);
                return (
                  <option key={m.id} value={m.id} disabled={taken}>
                    {m.title}
                    {taken ? " · ya tiene quiz" : ""}
                  </option>
                );
              })}
            </Select>
          </div>
        )}

        {scope === "lesson" && (
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Lección
            </label>
            <Select value={lessonId} onChange={(e) => { setLessonId(e.target.value); setTitleTouched(false); }} disabled={loadingTargets}>
              <option value="">Selecciona una lección</option>
              {targets.modules.map((m) => (
                <optgroup key={m.id} label={m.title}>
                  {contentLessons
                    .filter((l) => l.moduleId === m.id)
                    .map((l) => {
                      const taken = blockers.lessonsTaken.has(l.id);
                      return (
                        <option key={l.id} value={l.id} disabled={taken}>
                          {m.title} — {l.title}
                          {taken ? " · ya tiene evaluación" : ""}
                        </option>
                      );
                    })}
                </optgroup>
              ))}
            </Select>
          </div>
        )}

        {scope === "session" && (
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Clase en vivo
            </label>
            <Select value={sessionId} onChange={(e) => { setSessionId(e.target.value); setTitleTouched(false); }} disabled={loadingTargets}>
              <option value="">Selecciona una clase</option>
              {targets.sessions.map((s) => {
                const taken = blockers.sessionsTaken.has(s.id);
                const label = [
                  s.title?.trim() || "Clase en vivo",
                  formatChile(s.startsAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
                  multiCohort ? s.cohortName : null,
                ]
                  .filter(Boolean)
                  .join(" — ");
                return (
                  <option key={s.id} value={s.id} disabled={taken}>
                    {label}
                    {taken ? " · ya tiene evaluación" : ""}
                  </option>
                );
              })}
            </Select>
          </div>
        )}

        {/* Título */}
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
            Título
          </label>
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
            maxLength={200}
            placeholder="Título de la evaluación"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" variant="lime" onClick={handleSubmit} disabled={!canSubmit || submitting}>
          {submitting ? <LoaderIcon /> : null}
          Crear evaluación
        </Button>
      </div>
    </Dialog>
  );
}
