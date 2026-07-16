"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EvaluationStateBadge } from "@/components/admin/quiz/evaluation-state-badge";
import { formatChile } from "@/lib/time";
import { kindLabel, type EvaluationGroup, type EvaluationRow } from "@/lib/admin/evaluation-list";
import { NewEvaluationDialog } from "./new-evaluation-dialog";

/**
 * Cliente de la lista de evaluaciones. La creación aterriza directamente en
 * `/admin/evaluaciones/[id]` (router.push), así que este componente no
 * necesita estado propio de la lista: solo abre/cierra el modal.
 */
export function EvaluationsListClient({
  programId,
  groups,
}: {
  programId: string;
  groups: EvaluationGroup[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const existingRows = groups.flatMap((g) => g.rows);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button type="button" variant="lime" onClick={() => setDialogOpen(true)}>
          + Nueva evaluación
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ca-ink/[0.10] px-4 py-8 text-center text-[13px] text-ca-ink-soft">
          Este entorno aún no tiene evaluaciones.
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-ca-ink-soft">
                  {group.title}
                </h3>
                {group.weightTotal != null && (
                  <span
                    className={`text-[11.5px] font-bold ${
                      group.weightTotal === 100 ? "text-ca-ink-soft" : "text-[#8b6914]"
                    }`}
                  >
                    Suma de pesos: {group.weightTotal}%
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {group.rows.map((row) => (
                  <EvaluationListRow key={row.id} row={row} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <NewEvaluationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        programId={programId}
        existingRows={existingRows}
      />
    </div>
  );
}

function EvaluationListRow({ row }: { row: EvaluationRow }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-bold text-ca-ink">{row.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-ca-ink-soft">
          <span>{kindLabel(row.kind)}</span>
          {row.targetLabel && <span>· {row.targetLabel}</span>}
          {row.kind === "quiz" && (
            <span>
              · {row.questionCount} {row.questionCount === 1 ? "pregunta" : "preguntas"}
            </span>
          )}
          {row.weight_pct != null && <span>· peso {row.weight_pct}%</span>}
          {row.opens_at && (
            <span>
              · abre{" "}
              {formatChile(row.opens_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {row.closes_at && (
            <span>
              · cierra{" "}
              {formatChile(row.closes_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <EvaluationStateBadge evaluation={row} />
        <Link href={`/admin/evaluaciones/${row.id}`}>
          <Button type="button" variant="outline" size="sm">
            Configurar
          </Button>
        </Link>
      </div>
    </div>
  );
}
