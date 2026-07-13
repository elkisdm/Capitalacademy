"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/admin/toast";
import type { Evaluation, EvaluationScope } from "./types";
import { formatDate } from "./types";
import { EvaluationPanel } from "./evaluation-panel";
import { LoaderIcon } from "./icons";

type EvalItem = Evaluation & { questionCount?: number };
type ModuleTarget = { id: string; title: string };
type LessonTarget = { id: string; title: string; moduleId: string; moduleTitle: string; isRecording: boolean };
type SessionTarget = { id: string; title: string | null; startsAt: string; moduleTitle: string | null; cohortName: string };

/**
 * Pestaña central de evaluaciones del programa. Lista todas las evaluaciones
 * por alcance (final / módulo / lección), permite crearlas eligiendo el target,
 * y gestiona cada una (preguntas, activar, compartir) vía EvaluationPanel
 * montado en un Dialog compartido.
 */
export function EvaluacionesTab({ programId }: { programId: string }) {
  const [loading, setLoading] = useState(true);
  const [evals, setEvals] = useState<EvalItem[]>([]);
  const [modules, setModules] = useState<ModuleTarget[]>([]);
  const [lessons, setLessons] = useState<LessonTarget[]>([]);
  const [sessions, setSessions] = useState<SessionTarget[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const { toast, ToastContainer } = useToast();

  const load = useCallback(async () => {
    if (!programId) return;
    setLoading(true);
    try {
      const [evRes, tgRes] = await Promise.all([
        fetch(`/api/admin/evaluations?programId=${programId}`),
        fetch(`/api/admin/evaluations/targets?programId=${programId}`),
      ]);
      if (evRes.ok) {
        const { evaluations } = await evRes.json();
        setEvals(evaluations ?? []);
      }
      if (tgRes.ok) {
        const { modules: m, lessons: l, sessions: s } = await tgRes.json();
        setModules(m ?? []);
        setLessons(l ?? []);
        setSessions(s ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const finalEval = useMemo(() => evals.find((e) => e.scope === "final") ?? null, [evals]);
  const evalByModule = useMemo(
    () => new Map(evals.filter((e) => e.scope === "module" && e.module_id).map((e) => [e.module_id!, e])),
    [evals],
  );
  const evalByLesson = useMemo(
    () => new Map(evals.filter((e) => e.scope === "lesson" && e.lesson_id).map((e) => [e.lesson_id!, e])),
    [evals],
  );
  const evalBySession = useMemo(
    () => new Map(evals.filter((e) => e.scope === "session" && e.session_id).map((e) => [e.session_id!, e])),
    [evals],
  );
  const multiCohort = useMemo(() => new Set(sessions.map((s) => s.cohortName)).size > 1, [sessions]);
  const contentLessons = useMemo(
    () => lessons.filter((l) => !l.isRecording || evalByLesson.has(l.id)),
    [lessons, evalByLesson],
  );
  const selectedEval = useMemo(() => evals.find((e) => e.id === selected) ?? null, [evals, selected]);

  const create = async (
    scope: EvaluationScope,
    title: string,
    key: string,
    target?: { moduleId?: string; lessonId?: string; sessionId?: string },
  ) => {
    setCreating(key);
    try {
      const res = await fetch("/api/admin/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId, scope, title, ...target }),
      });
      const data = await res.json();
      if (res.ok) {
        setEvals((prev) => [...prev, { ...data.evaluation, questionCount: 0 }]);
        setSelected(data.evaluation.id);
        toast("Evaluación creada", "success");
      } else {
        toast(data.error ?? "Error al crear la evaluación", "error");
      }
    } finally {
      setCreating(null);
    }
  };

  const handleChange = (ev: Evaluation) =>
    setEvals((prev) => prev.map((e) => (e.id === ev.id ? { ...e, ...ev } : e)));
  const handleDeleted = (id: string) => {
    setEvals((prev) => prev.filter((e) => e.id !== id));
    setSelected(null);
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-12">
        <LoaderIcon />
      </div>
    );
  }

  return (
    <>
      <ToastContainer />
      <div className="flex flex-col gap-7">
        {/* Final */}
        <section>
          <SectionTitle>Evaluación final</SectionTitle>
          <p className="mb-3 text-[12.5px] text-ca-ink-soft">
            Quiz certificante del programa. El alumno la rinde al completar el contenido.
          </p>
          <EvalRow
            title="Evaluación final del programa"
            evalItem={finalEval}
            rowKey="final"
            creating={creating}
            accent
            onToggle={setSelected}
            onCreate={() => create("final", "Evaluación final", "final")}
          />
        </section>

        {/* Por módulo */}
        <section>
          <SectionTitle>Por módulo</SectionTitle>
          {modules.length === 0 ? (
            <EmptyHint>Este programa aún no tiene módulos.</EmptyHint>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {modules.map((m) => (
                <EvalCard
                  key={m.id}
                  title={m.title}
                  evalItem={evalByModule.get(m.id) ?? null}
                  rowKey={`module:${m.id}`}
                  creating={creating}
                  onToggle={setSelected}
                  onCreate={() =>
                    create("module", `Evaluación: ${m.title}`, `module:${m.id}`, { moduleId: m.id })
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Por clase en vivo */}
        <section>
          <SectionTitle>Por clase en vivo</SectionTitle>
          {sessions.length === 0 ? (
            <EmptyHint>Este programa aún no tiene clases en vivo.</EmptyHint>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sessions.map((s) => {
                const displayTitle = s.title?.trim() || "Clase en vivo";
                const subtitle = [s.moduleTitle, formatDate(s.startsAt), multiCohort ? s.cohortName : null]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <EvalCard
                    key={s.id}
                    title={displayTitle}
                    subtitle={subtitle}
                    evalItem={evalBySession.get(s.id) ?? null}
                    rowKey={`session:${s.id}`}
                    creating={creating}
                    onToggle={setSelected}
                    onCreate={() =>
                      create("session", `Quiz de clase: ${displayTitle}`, `session:${s.id}`, { sessionId: s.id })
                    }
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Por lección */}
        <section>
          <SectionTitle>Por lección</SectionTitle>
          {contentLessons.length === 0 ? (
            <EmptyHint>Este programa aún no tiene lecciones.</EmptyHint>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {contentLessons.map((l) => (
                <EvalCard
                  key={l.id}
                  title={l.title}
                  subtitle={l.moduleTitle}
                  evalItem={evalByLesson.get(l.id) ?? null}
                  rowKey={`lesson:${l.id}`}
                  creating={creating}
                  onToggle={setSelected}
                  onCreate={() =>
                    create("lesson", `Evaluación: ${l.title}`, `lesson:${l.id}`, { lessonId: l.id })
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog
        open={selectedEval != null}
        onClose={() => setSelected(null)}
        aria-labelledby="eval-panel-title"
        className="max-w-2xl overflow-hidden p-0"
      >
        {selectedEval && (
          <>
            <div
              className="flex items-start justify-between border-b px-6 py-4"
              style={{ borderColor: "rgba(20,22,58,0.08)" }}
            >
              <h2 id="eval-panel-title" className="pr-3 text-[17px] font-black tracking-tight text-ca-ink">
                {selectedEval.title}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelected(null)}
                aria-label="Cerrar"
                className="!h-8 !w-8 shrink-0 rounded-full p-0 text-ca-ink-soft"
              >
                <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </Button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
              <EvaluationPanel
                evaluation={selectedEval}
                onEvaluationChange={handleChange}
                onDeleted={() => handleDeleted(selectedEval.id)}
              />
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}

/** Fila horizontal destacada, usada solo para la evaluación final (única por programa). */
function EvalRow({
  title,
  evalItem,
  rowKey,
  creating,
  accent,
  onToggle,
  onCreate,
}: {
  title: string;
  evalItem: EvalItem | null;
  rowKey: string;
  creating: string | null;
  accent?: boolean;
  onToggle: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <div
      className={
        accent
          ? "overflow-hidden rounded-xl border border-ca-violet/20 bg-ca-violet/[0.04]"
          : "overflow-hidden rounded-xl border border-ca-ink/[0.08]"
      }
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 truncate text-[13.5px] font-bold text-ca-ink">{title}</div>
        <div className="flex shrink-0 items-center gap-2">
          {evalItem ? (
            <>
              <Badge tone={evalItem.is_active ? "lime" : "neutral"}>
                {evalItem.is_active ? "Activa" : "Borrador"}
              </Badge>
              <span className="hidden text-[11.5px] text-ca-ink-soft sm:inline">
                {evalItem.questionCount ?? 0} preg.
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => onToggle(evalItem.id)}>
                Gestionar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="lime"
              size="sm"
              onClick={onCreate}
              disabled={creating === rowKey}
            >
              {creating === rowKey ? <LoaderIcon /> : "Crear quiz"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Card compacta vertical, usada en las grillas "Por módulo" y "Por lección". */
function EvalCard({
  title,
  subtitle,
  evalItem,
  rowKey,
  creating,
  onToggle,
  onCreate,
}: {
  title: string;
  subtitle?: string;
  evalItem: EvalItem | null;
  rowKey: string;
  creating: string | null;
  onToggle: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ca-ink/[0.08] bg-white p-4">
      <div className="min-w-0">
        <div className="line-clamp-2 text-[13.5px] font-bold text-ca-ink">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-[12px] text-ca-ink-soft">{subtitle}</div>}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {evalItem ? (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <Badge tone={evalItem.is_active ? "lime" : "neutral"} size="sm">
                {evalItem.is_active ? "Activa" : "Borrador"}
              </Badge>
              <span className="text-[11px] text-ca-ink-soft">{evalItem.questionCount ?? 0} preg.</span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onToggle(evalItem.id)}>
              Gestionar
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="lime"
            size="sm"
            onClick={onCreate}
            disabled={creating === rowKey}
            className="ml-auto"
          >
            {creating === rowKey ? <LoaderIcon /> : "Crear quiz"}
          </Button>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-ca-ink-soft">
      {children}
    </h3>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-ca-ink/[0.10] px-4 py-5 text-center text-[13px] text-ca-ink-soft">
      {children}
    </div>
  );
}
