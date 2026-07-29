"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  ExternalLink,
  Loader2,
  Plus,
  Send,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/admin/toast";
import { AUDIENCE_STATUSES } from "@/lib/campaigns/audience";
import {
  QuestionEditor,
  draftToPayload,
  emptyQuestion,
  type QuestionDraft,
} from "@/components/admin/encuestas/question-editor";

type SurveyCampaign = {
  id: string;
  title: string;
  mode: "anonymous" | "identified";
  status: string;
  external_survey_url: string;
  recipients_count: number;
  sent_count: number;
  error: string | null;
  created_at: string;
  cohorts?: { name: string } | null;
};

type ConfigStatus = Record<string, { ready: boolean; missing: string[] }>;

type Props = {
  programs: { id: string; name: string }[];
  cohorts: { id: string; name: string; program_id: string }[];
  initialProgramId?: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Sin enviar",
  sending: "Enviando",
  sent: "Enviada",
  failed: "Con fallos",
};

const STATUS_TONE: Record<string, "neutral" | "violet" | "lime" | "destructive"> = {
  draft: "neutral",
  sending: "violet",
  sent: "lime",
  failed: "destructive",
};

const ENROLLMENT_LABEL: Record<string, string> = {
  active: "Activas",
  invited: "Invitadas",
  completed: "Completadas",
  suspended: "Suspendidas",
};

export function SurveysManager({ programs, cohorts, initialProgramId }: Props) {
  const { toast, ToastContainer } = useToast();

  const [programId, setProgramId] = useState(initialProgramId ?? programs[0]?.id ?? "");
  const [surveys, setSurveys] = useState<SurveyCampaign[]>([]);
  const [config, setConfig] = useState<ConfigStatus>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"anonymous" | "identified">("anonymous");
  const [cohortId, setCohortId] = useState("");
  const [audienceStatus, setAudienceStatus] = useState<string[]>(["active"]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion(0)]);
  const [saving, setSaving] = useState(false);

  const [confirmSend, setConfirmSend] = useState<SurveyCampaign | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const [results, setResults] = useState<{
    title: string;
    mode: string;
    responseCount: number;
    questions: Array<{ key: string; title: string }>;
  } | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  const [audienceCount, setAudienceCount] = useState<number | null>(null);

  const programCohorts = useMemo(
    () => cohorts.filter((c) => c.program_id === programId),
    [cohorts, programId],
  );

  const createReady = config.create?.ready ?? true;
  const missingVars = config.create?.missing ?? [];

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!programId) return;
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/admin/surveys?programId=${programId}`, { signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Error al cargar");
        setSurveys(data.surveys ?? []);
        setConfig(data.config ?? {});
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setLoadError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [programId],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!editorOpen || !programId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ programId, status: audienceStatus.join(",") });
    if (cohortId) params.set("cohortId", cohortId);

    fetch(`/api/admin/campaigns/audience?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setAudienceCount(typeof d.count === "number" ? d.count : null))
      .catch(() => setAudienceCount(null));

    return () => controller.abort();
  }, [editorOpen, programId, cohortId, audienceStatus]);

  function openNew() {
    setTitle("");
    setMode("anonymous");
    setCohortId("");
    setAudienceStatus(["active"]);
    setQuestions([emptyQuestion(0)]);
    setAudienceCount(null);
    setEditorOpen(true);
  }

  function toggleStatus(status: string) {
    setAudienceStatus((prev) => {
      const next = prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status];
      return next.length ? next : prev;
    });
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          cohortId: cohortId || null,
          title: title.trim(),
          mode,
          audienceStatus,
          questions: questions.map(draftToPayload),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error ?? "No se pudo crear la encuesta", "error");
        return;
      }
      toast("Encuesta creada. Ya puedes enviarla.", "success");
      setEditorOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleSend(survey: SurveyCampaign) {
    setSendingId(survey.id);
    setConfirmSend(null);
    try {
      const res = await fetch(`/api/admin/surveys/${survey.id}/send`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error ?? "No se pudo enviar", "error");
      } else if (data.result?.status === "partial") {
        toast(`Enviadas ${data.result.sent}, fallaron ${data.result.failed}`, "error");
      } else {
        toast(`Encuesta enviada a ${data.result?.sent ?? 0} personas`, "success");
      }
      await load();
    } finally {
      setSendingId(null);
    }
  }

  async function openResults(survey: SurveyCampaign) {
    setResultsLoading(true);
    setResults(null);
    try {
      const res = await fetch(`/api/admin/surveys/${survey.id}/results`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error ?? "No se pudieron leer los resultados", "error");
        return;
      }
      setResults({
        title: data.survey?.title ?? survey.title,
        mode: data.survey?.mode ?? survey.mode,
        responseCount: data.responseCount ?? 0,
        questions: data.questions ?? [],
      });
    } finally {
      setResultsLoading(false);
    }
  }

  const canCreate =
    title.trim().length > 0 &&
    questions.length > 0 &&
    questions.every((q) => q.title.trim().length > 0) &&
    questions
      .filter((q) => q.type === "single_choice" || q.type === "multiple_choice")
      .every((q) => q.options.filter((o) => o.trim()).length >= 2);

  return (
    <div className="space-y-5">
      {!createReady && (
        <div className="rounded-2xl border border-ca-amber/40 bg-ca-amber/10 p-4">
          <p className="flex items-start gap-2 text-[13px] font-semibold text-ca-ink">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            Falta configurar la conexión con el sistema de encuestas
          </p>
          <p className="mt-1.5 pl-6 text-[12px] leading-relaxed text-ca-ink-soft">
            Puedes ver las encuestas existentes, pero no crear nuevas hasta definir:{" "}
            <code className="font-mono">{missingVars.join(", ")}</code>
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-[220px] flex-1">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
            Entorno
          </span>
          <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
        <Button onClick={openNew} disabled={!programId || !createReady}>
          <Plus size={16} /> Nueva encuesta
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : loadError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </p>
      ) : surveys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ca-ink/15 p-10 text-center">
          <ClipboardList className="mx-auto mb-3 text-ca-ink-soft" size={28} />
          <p className="text-sm font-semibold text-ca-ink">Aún no hay encuestas</p>
          <p className="mt-1 text-[13px] text-ca-ink-soft">
            Crea una para preguntarle algo a los alumnos de este entorno.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {surveys.map((survey) => (
            <li
              key={survey.id}
              className="rounded-2xl border border-ca-ink/[0.10] bg-ca-surface p-4 md:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[survey.status] ?? "neutral"} dot>
                      {STATUS_LABEL[survey.status] ?? survey.status}
                    </Badge>
                    <Badge tone={survey.mode === "anonymous" ? "violet" : "neutral"}>
                      {survey.mode === "anonymous" ? "Anónima" : "Identificada"}
                    </Badge>
                    <span className="text-[11px] text-ca-ink-soft">
                      {survey.cohorts?.name ?? "Todas las cohortes"}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-[15px] font-bold text-ca-ink">{survey.title}</p>
                  <p className="mt-0.5 text-[12px] text-ca-ink-soft">
                    {survey.sent_count > 0
                      ? `${survey.sent_count} de ${survey.recipients_count} invitaciones entregadas`
                      : "Todavía no se ha enviado"}
                  </p>
                  <a
                    href={survey.external_survey_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-ca-violet hover:underline"
                  >
                    Ver el formulario <ExternalLink size={12} />
                  </a>
                  {survey.error && (
                    <p className="mt-2 flex items-start gap-1.5 text-[12px] text-destructive">
                      <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                      {survey.error}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openResults(survey)}>
                    <BarChart3 size={14} /> Resultados
                  </Button>
                  {survey.status !== "sent" && survey.status !== "sending" && (
                    <Button
                      size="sm"
                      onClick={() => setConfirmSend(survey)}
                      disabled={sendingId === survey.id}
                    >
                      {sendingId === survey.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      {survey.status === "failed" ? "Reintentar" : "Enviar"}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Editor de encuesta */}
      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        aria-label="Nueva encuesta"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto"
      >
        <div className="space-y-4 p-5 md:p-6">
          <h2 className="text-[20px] font-black tracking-tight text-ca-ink">Nueva encuesta</h2>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
              Título
            </span>
            <Input
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="¿Qué te pareció la clase de IA?"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
                Modo
              </span>
              <Select
                value={mode}
                onChange={(e) => setMode(e.target.value as "anonymous" | "identified")}
              >
                <option value="anonymous">Anónima</option>
                <option value="identified">Identificada</option>
              </Select>
              <span className="mt-1 block text-[11px] leading-relaxed text-ca-ink-soft">
                {mode === "anonymous"
                  ? "El enlace es igual para todos y las respuestas no se pueden asociar a nadie."
                  : "Cada persona recibe un enlace propio; se envía por correo y WhatsApp."}
              </span>
            </label>

            <label>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
                Cohorte
              </span>
              <Select value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
                <option value="">Todas las cohortes</option>
                {programCohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div>
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
              Estado de matrícula
            </span>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCE_STATUSES.map((status) => {
                const on = audienceStatus.includes(status);
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleStatus(status)}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
                      on ? "bg-ca-violet text-white" : "bg-ca-ink/5 text-ca-ink-soft hover:bg-ca-ink/10"
                    }`}
                  >
                    {ENROLLMENT_LABEL[status] ?? status}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-ca-bg-soft px-4 py-3">
            <Users size={16} className="text-ca-ink-soft" />
            <p className="text-[13px] text-ca-ink">
              {audienceCount === null ? (
                "Calculando destinatarios…"
              ) : (
                <>
                  La recibirían <strong className="font-black">{audienceCount}</strong>{" "}
                  {audienceCount === 1 ? "persona" : "personas"}
                </>
              )}
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
                Preguntas
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQuestions((q) => [...q, emptyQuestion(q.length)])}
                disabled={questions.length >= 50}
              >
                <Plus size={14} /> Agregar
              </Button>
            </div>
            <ul className="space-y-3">
              {questions.map((question, index) => (
                <QuestionEditor
                  key={index}
                  question={question}
                  index={index}
                  total={questions.length}
                  onChange={(next) =>
                    setQuestions((prev) => prev.map((q, i) => (i === index ? next : q)))
                  }
                  onRemove={() =>
                    setQuestions((prev) =>
                      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev,
                    )
                  }
                  onMove={(direction) => moveQuestion(index, direction)}
                />
              ))}
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!canCreate || saving}>
              {saving && <Loader2 size={15} className="animate-spin" />}
              Crear encuesta
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Confirmación de envío */}
      <Dialog
        open={confirmSend !== null}
        onClose={() => setConfirmSend(null)}
        aria-label="Confirmar envío"
        className="w-full max-w-md"
      >
        {confirmSend && (
          <div className="space-y-4 p-6">
            <h2 className="text-[19px] font-black tracking-tight text-ca-ink">
              ¿Enviar esta encuesta?
            </h2>
            <p className="text-[14px] leading-relaxed text-ca-ink-soft">
              Se invitará a responder <strong className="text-ca-ink">“{confirmSend.title}”</strong>{" "}
              a los alumnos de {confirmSend.cohorts?.name ?? "todas las cohortes"}.{" "}
              {confirmSend.mode === "anonymous"
                ? "Todos reciben el mismo enlace, sin identificador."
                : "Cada persona recibe un enlace propio por correo y WhatsApp."}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmSend(null)}>
                Cancelar
              </Button>
              <Button onClick={() => handleSend(confirmSend)}>
                <Send size={15} /> Enviar ahora
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Resultados */}
      <Dialog
        open={results !== null || resultsLoading}
        onClose={() => setResults(null)}
        aria-label="Resultados de la encuesta"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto"
      >
        <div className="space-y-4 p-6">
          {resultsLoading || !results ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : (
            <>
              <h2 className="text-[19px] font-black tracking-tight text-ca-ink">{results.title}</h2>
              <div className="rounded-xl bg-ca-bg-soft px-4 py-3">
                <p className="text-[13px] text-ca-ink">
                  <strong className="text-[22px] font-black">{results.responseCount}</strong>{" "}
                  {results.responseCount === 1 ? "respuesta recibida" : "respuestas recibidas"}
                </p>
              </div>
              {results.mode === "anonymous" && (
                <p className="text-[12px] leading-relaxed text-ca-ink-soft">
                  Es una encuesta anónima: el detalle por persona no se muestra aquí a propósito.
                  Revisa el desglose por pregunta en el panel de encuestas de Capital Inteligente.
                </p>
              )}
              <ul className="space-y-1.5">
                {results.questions.map((q) => (
                  <li key={q.key} className="text-[13px] text-ca-ink-soft">
                    · {q.title}
                  </li>
                ))}
              </ul>
              <div className="flex justify-end">
                <Button variant="ghost" onClick={() => setResults(null)}>
                  Cerrar
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>

      <ToastContainer />
    </div>
  );
}
