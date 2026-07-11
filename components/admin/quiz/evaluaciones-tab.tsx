"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/admin/toast";
import type { Evaluation, EvaluationScope } from "./types";
import { EvaluationPanel } from "./evaluation-panel";
import { LoaderIcon } from "./icons";

type EvalItem = Evaluation & { questionCount?: number };
type ModuleTarget = { id: string; title: string };
type LessonTarget = { id: string; title: string; moduleId: string; moduleTitle: string };

/**
 * Pestaña central de evaluaciones del programa. Lista todas las evaluaciones
 * por alcance (final / módulo / lección), permite crearlas eligiendo el target,
 * y gestiona cada una inline (preguntas, activar, compartir) vía EvaluationPanel.
 */
export function EvaluacionesTab({ programId }: { programId: string }) {
  const [loading, setLoading] = useState(true);
  const [evals, setEvals] = useState<EvalItem[]>([]);
  const [modules, setModules] = useState<ModuleTarget[]>([]);
  const [lessons, setLessons] = useState<LessonTarget[]>([]);
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
        const { modules: m, lessons: l } = await tgRes.json();
        setModules(m ?? []);
        setLessons(l ?? []);
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

  const create = async (
    scope: EvaluationScope,
    title: string,
    key: string,
    target?: { moduleId?: string; lessonId?: string },
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
            selected={selected}
            creating={creating}
            onToggle={setSelected}
            onCreate={() => create("final", "Evaluación final", "final")}
            onChange={handleChange}
            onDeleted={handleDeleted}
          />
        </section>

        {/* Por módulo */}
        <section>
          <SectionTitle>Por módulo</SectionTitle>
          {modules.length === 0 ? (
            <EmptyHint>Este programa aún no tiene módulos.</EmptyHint>
          ) : (
            <div className="flex flex-col gap-2.5">
              {modules.map((m) => (
                <EvalRow
                  key={m.id}
                  title={m.title}
                  evalItem={evalByModule.get(m.id) ?? null}
                  rowKey={`module:${m.id}`}
                  selected={selected}
                  creating={creating}
                  onToggle={setSelected}
                  onCreate={() =>
                    create("module", `Evaluación: ${m.title}`, `module:${m.id}`, { moduleId: m.id })
                  }
                  onChange={handleChange}
                  onDeleted={handleDeleted}
                />
              ))}
            </div>
          )}
        </section>

        {/* Por lección */}
        <section>
          <SectionTitle>Por lección</SectionTitle>
          {lessons.length === 0 ? (
            <EmptyHint>Este programa aún no tiene lecciones.</EmptyHint>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lessons.map((l) => (
                <EvalRow
                  key={l.id}
                  title={l.title}
                  subtitle={l.moduleTitle}
                  evalItem={evalByLesson.get(l.id) ?? null}
                  rowKey={`lesson:${l.id}`}
                  selected={selected}
                  creating={creating}
                  onToggle={setSelected}
                  onCreate={() =>
                    create("lesson", `Evaluación: ${l.title}`, `lesson:${l.id}`, { lessonId: l.id })
                  }
                  onChange={handleChange}
                  onDeleted={handleDeleted}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function EvalRow({
  title,
  subtitle,
  evalItem,
  rowKey,
  selected,
  creating,
  onToggle,
  onCreate,
  onChange,
  onDeleted,
}: {
  title: string;
  subtitle?: string;
  evalItem: EvalItem | null;
  rowKey: string;
  selected: string | null;
  creating: string | null;
  onToggle: (id: string | null) => void;
  onCreate: () => void;
  onChange: (ev: Evaluation) => void;
  onDeleted: (id: string) => void;
}) {
  const expanded = evalItem != null && selected === evalItem.id;
  return (
    <div className="overflow-hidden rounded-xl border border-ca-ink/[0.08]">
      <div className="flex items-center justify-between gap-3 bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-bold text-ca-ink">{title}</div>
          {subtitle && <div className="truncate text-[12px] text-ca-ink-soft">{subtitle}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {evalItem ? (
            <>
              <span
                className="rounded-full px-2.5 py-1 text-[10.5px] font-bold"
                style={{
                  background: evalItem.is_active ? "rgba(168,211,16,0.22)" : "rgba(20,22,58,0.08)",
                  color: evalItem.is_active ? "#3f5a05" : "var(--color-ca-ink-soft)",
                }}
              >
                {evalItem.is_active ? "Activa" : "Borrador"}
              </span>
              <span className="hidden text-[11.5px] text-ca-ink-soft sm:inline">
                {evalItem.questionCount ?? 0} preg.
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onToggle(expanded ? null : evalItem.id)}
              >
                {expanded ? "Cerrar" : "Gestionar"}
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
      {expanded && evalItem && (
        <div className="border-t border-ca-ink/[0.08] bg-ca-bg-soft/40 px-4 py-4">
          <EvaluationPanel
            evaluation={evalItem}
            onEvaluationChange={onChange}
            onDeleted={() => onDeleted(evalItem.id)}
          />
        </div>
      )}
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
