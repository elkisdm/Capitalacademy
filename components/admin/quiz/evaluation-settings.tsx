"use client";

import { useState } from "react";
import { useToast } from "@/components/admin/toast";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import type { Evaluation } from "./types";
import { LoaderIcon, CheckCircleIcon } from "./icons";

/** Estado local del form: los numéricos opcionales se manejan como string para
 *  permitir el campo vacío (= "todas" / "sin límite"). */
type FormState = {
  title: string;
  description: string;
  passingGradePct: string;
  maxAttempts: string;
  questionsPerAttempt: string;
  timeLimitMinutes: string;
  minCompletionPct: string;
  weightPct: string;
  opensAt: string;
  closesAt: string;
};

// timestamptz ISO → valor para el <DatePicker> (hora local). Mismo patrón que
// lesson-edit-form.tsx / deliverables-manager.tsx.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Valor del <DatePicker> (hora local) → ISO; vacío = null (sin límite).
function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function fromEvaluation(ev: Evaluation): FormState {
  return {
    title: ev.title,
    description: ev.description ?? "",
    passingGradePct: String(ev.passing_grade_pct),
    maxAttempts: String(ev.max_attempts),
    questionsPerAttempt: ev.questions_per_attempt != null ? String(ev.questions_per_attempt) : "",
    timeLimitMinutes: ev.time_limit_minutes != null ? String(ev.time_limit_minutes) : "",
    minCompletionPct: ev.min_completion_pct != null ? String(ev.min_completion_pct) : "",
    weightPct: ev.weight_pct != null ? String(ev.weight_pct) : "",
    opensAt: isoToLocalInput(ev.opens_at),
    closesAt: isoToLocalInput(ev.closes_at),
  };
}

/**
 * Pestaña "Ajustes": edita la configuración de la evaluación (intentos, % para
 * aprobar, preguntas por intento, límite de tiempo, título/descripción).
 * Cablea al PATCH /api/admin/evaluations/[id] existente — solo envía los campos
 * que el endpoint valida.
 */
export function EvaluationSettings({
  evaluation,
  onEvaluationChange,
}: {
  evaluation: Evaluation;
  onEvaluationChange: (ev: Evaluation) => void;
}) {
  const [form, setForm] = useState<FormState>(() => fromEvaluation(evaluation));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, ToastContainer } = useToast();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isFinal = evaluation.scope === "final";
  const isManual = evaluation.kind === "manual";

  function buildPayload(): Record<string, unknown> | string {
    const title = form.title.trim();
    if (!title) return "El título es obligatorio.";

    const passing = Number(form.passingGradePct);
    if (!Number.isInteger(passing) || passing < 1 || passing > 100) {
      return "El % para aprobar debe estar entre 1 y 100.";
    }
    const attempts = Number(form.maxAttempts);
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 50) {
      return "El n.º de intentos debe estar entre 1 y 50.";
    }

    const payload: Record<string, unknown> = {
      title,
      description: form.description.trim() || null,
      passingGradePct: passing,
      maxAttempts: attempts,
    };

    // Opcionales: vacío = null (todas / sin límite).
    if (form.questionsPerAttempt.trim() === "") {
      payload.questionsPerAttempt = null;
    } else {
      const n = Number(form.questionsPerAttempt);
      if (!Number.isInteger(n) || n < 1 || n > 200) return "Preguntas por intento: entre 1 y 200, o vacío para todas.";
      payload.questionsPerAttempt = n;
    }

    if (form.timeLimitMinutes.trim() === "") {
      payload.timeLimitMinutes = null;
    } else {
      const n = Number(form.timeLimitMinutes);
      if (!Number.isInteger(n) || n < 1 || n > 600) return "Límite de tiempo: entre 1 y 600 minutos, o vacío para sin límite.";
      payload.timeLimitMinutes = n;
    }

    if (isFinal && form.minCompletionPct.trim() !== "") {
      const n = Number(form.minCompletionPct);
      if (!Number.isInteger(n) || n < 1 || n > 100) return "El % de avance mínimo debe estar entre 1 y 100.";
      payload.minCompletionPct = n;
    }

    // Peso informativo (0072): se captura y muestra, el cálculo es v2.
    if (form.weightPct.trim() === "") {
      payload.weightPct = null;
    } else {
      const n = Number(form.weightPct);
      if (Number.isNaN(n) || n < 0 || n > 100) return "El peso debe estar entre 0 y 100, o vacío.";
      payload.weightPct = n;
    }

    // Ventana de programación (0070): opcional, uniforme para todos los scopes (D4).
    const opensAt = fromLocalInput(form.opensAt);
    const closesAt = fromLocalInput(form.closesAt);
    if (opensAt && closesAt && new Date(closesAt) <= new Date(opensAt)) {
      return "La fecha de cierre debe ser posterior a la de apertura.";
    }
    payload.opensAt = opensAt;
    payload.closesAt = closesAt;

    return payload;
  }

  async function handleSave() {
    setError(null);
    const payload = buildPayload();
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/evaluations/${evaluation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onEvaluationChange(data.evaluation);
        toast("Ajustes guardados", "success");
      } else {
        const msg = data.error ?? "No se pudieron guardar los ajustes.";
        setError(msg);
        toast(msg, "error");
      }
    } finally {
      setSaving(false);
    }
  }

  const labelCls = "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-ca-ink-soft";
  const hintCls = "mt-1 text-[11px] text-ca-ink-soft";

  return (
    <>
      <ToastContainer />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className={labelCls} htmlFor="eval-title">Título</label>
          <Input
            id="eval-title"
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>

        <div className="md:col-span-2">
          <label className={labelCls} htmlFor="eval-desc">Descripción (opcional)</label>
          <Textarea
            id="eval-desc"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={2}
          />
        </div>

        {/* N.º de intentos / % para aprobar / preguntas por intento / tiempo:
            solo aplican a kind='quiz' — una nota manual no tiene intentos ni
            autocorrección. Los valores subyacentes se siguen enviando (con su
            default) para no tocar la validación existente. */}
        {!isManual && (
          <div>
            <label className={labelCls} htmlFor="eval-attempts">N.º de intentos</label>
            <Input
              id="eval-attempts"
              type="number"
              min={1}
              max={50}
              value={form.maxAttempts}
              onChange={(e) => set("maxAttempts", e.target.value)}
            />
            <p className={hintCls}>Cuántas veces puede rendir el alumno.</p>
          </div>
        )}

        {!isManual && (
          <div>
            <label className={labelCls} htmlFor="eval-passing">% para aprobar</label>
            <Input
              id="eval-passing"
              type="number"
              min={1}
              max={100}
              value={form.passingGradePct}
              onChange={(e) => set("passingGradePct", e.target.value)}
            />
            <p className={hintCls}>Nota mínima para aprobar la evaluación.</p>
          </div>
        )}

        {!isManual && (
          <div>
            <label className={labelCls} htmlFor="eval-perattempt">Preguntas por intento</label>
            <Input
              id="eval-perattempt"
              type="number"
              min={1}
              max={200}
              value={form.questionsPerAttempt}
              onChange={(e) => set("questionsPerAttempt", e.target.value)}
              placeholder="Todas"
            />
            <p className={hintCls}>Vacío = todas las preguntas del pool.</p>
          </div>
        )}

        {!isManual && (
          <div>
            <label className={labelCls} htmlFor="eval-time">Límite de tiempo (min)</label>
            <Input
              id="eval-time"
              type="number"
              min={1}
              max={600}
              value={form.timeLimitMinutes}
              onChange={(e) => set("timeLimitMinutes", e.target.value)}
              placeholder="Sin límite"
            />
            <p className={hintCls}>Vacío = sin límite de tiempo.</p>
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="eval-weight">Peso (%)</label>
          <Input
            id="eval-weight"
            type="number"
            min={0}
            max={100}
            value={form.weightPct}
            onChange={(e) => set("weightPct", e.target.value)}
            placeholder="Sin definir"
          />
          <p className={hintCls}>Informativo (v1): se muestra, no se calcula la nota final.</p>
        </div>

        {isFinal && (
          <div>
            <label className={labelCls} htmlFor="eval-completion">% de avance mínimo</label>
            <Input
              id="eval-completion"
              type="number"
              min={1}
              max={100}
              value={form.minCompletionPct}
              onChange={(e) => set("minCompletionPct", e.target.value)}
            />
            <p className={hintCls}>Avance del programa requerido para habilitar el final.</p>
          </div>
        )}

        <div>
          <DatePicker
            withTime
            label="Se abre"
            value={form.opensAt}
            onChange={(v) => set("opensAt", v)}
          />
          <p className={hintCls}>Vacío = disponible en cuanto la actives.</p>
        </div>

        <div>
          <DatePicker
            withTime
            label="Se cierra"
            value={form.closesAt}
            onChange={(v) => set("closesAt", v)}
          />
          <p className={hintCls}>Vacío = sin fecha de cierre.</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-ca-amber/40 bg-ca-amber/10 px-4 py-3 text-[13px] font-semibold text-[#8b6914]">
          {error}
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <Button
          type="button"
          variant="lime"
          onClick={handleSave}
          disabled={saving}
          className="h-auto gap-2 px-5 py-2.5 text-[13px]"
        >
          {saving ? <LoaderIcon /> : <CheckCircleIcon />}
          Guardar ajustes
        </Button>
      </div>
    </>
  );
}
