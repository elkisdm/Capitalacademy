"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/admin/toast";
import { Button } from "@/components/ui/button";
import { Select, Textarea, Input } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatGrade, isPassing } from "@/lib/grades/scale";
import type { GradeRow, EvaluationCriterion, CriterionMark } from "./types";
import { LoaderIcon } from "./icons";
import { GradesImportModal } from "./grades-import-modal";

type CohortOption = { id: string; name: string };

function markFor(row: GradeRow, criterion: EvaluationCriterion): boolean {
  return row.criteriaMarks.find((m) => m.criterion_id === criterion.id)?.checked ?? false;
}

function marksFromCriteria(criteria: EvaluationCriterion[], row: GradeRow): CriterionMark[] {
  return criteria.map((c) => ({
    criterion_id: c.id,
    label: c.label,
    checked: markFor(row, c),
  }));
}

/**
 * Panel de calificación de UNA evaluación para UNA cohorte: roster con
 * nota 1-7, comentario, checklist y estado (borrador/publicada), + gestión
 * del checklist. Usado como pestaña "Notas" en `EvaluationPanel` (ops/admin)
 * y embebido directo en el panel del docente (`fixedCohortId`).
 */
export function EvaluationGrades({
  evaluationId,
  cohorts,
  fixedCohortId,
}: {
  evaluationId: string;
  cohorts: CohortOption[];
  fixedCohortId?: string;
}) {
  const [cohortId, setCohortId] = useState(fixedCohortId ?? cohorts[0]?.id ?? "");
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<GradeRow[]>([]);
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [newCriterionLabel, setNewCriterionLabel] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const { toast, ToastContainer } = useToast();

  const load = useCallback(async () => {
    if (!cohortId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/evaluations/${evaluationId}/grades?cohortId=${cohortId}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRoster(data.roster ?? []);
        setCriteria(data.criteria ?? []);
      } else {
        toast(data.error ?? "Error al cargar las notas", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [evaluationId, cohortId, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const updateRow = (enrollmentId: string, patch: Partial<GradeRow>) => {
    setRoster((prev) => prev.map((r) => (r.enrollmentId === enrollmentId ? { ...r, ...patch } : r)));
  };

  const toggleCriterion = (row: GradeRow, criterion: EvaluationCriterion) => {
    const marks = marksFromCriteria(criteria, row).map((m) =>
      m.criterion_id === criterion.id ? { ...m, checked: !m.checked } : m,
    );
    updateRow(row.enrollmentId, { criteriaMarks: marks });
  };

  const saveGrade = async (row: GradeRow, publish: boolean) => {
    if (row.grade == null) {
      toast("Ingresa una nota antes de guardar", "error");
      return;
    }
    setSavingId(row.enrollmentId);
    try {
      const res = await fetch(`/api/admin/evaluations/${evaluationId}/grades`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentId: row.enrollmentId,
          grade: row.grade,
          feedback: row.feedback,
          criteriaMarks: marksFromCriteria(criteria, row),
          publish,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const g = data.grade;
        updateRow(row.enrollmentId, {
          grade: g.grade,
          feedback: g.feedback,
          criteriaMarks: g.criteria_marks ?? [],
          publishedAt: g.published_at,
          gradedAt: g.graded_at,
          source: g.source,
        });
        toast(publish ? "Nota publicada" : "Borrador guardado", "success");
      } else {
        toast(data.error ?? "Error al guardar", "error");
      }
    } finally {
      setSavingId(null);
    }
  };

  const publishAll = async () => {
    if (!cohortId) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/admin/evaluations/${evaluationId}/grades?action=publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohortId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast(`${data.published} nota(s) publicada(s)`, "success");
        await load();
      } else {
        toast(data.error ?? "Error al publicar", "error");
      }
    } finally {
      setPublishing(false);
    }
  };

  const addCriterion = async () => {
    const label = newCriterionLabel.trim();
    if (!label) return;
    const res = await fetch(`/api/admin/evaluations/${evaluationId}/criteria`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setCriteria((prev) => [...prev, data.criterion]);
      setNewCriterionLabel("");
    } else {
      toast(data.error ?? "Error al agregar el criterio", "error");
    }
  };

  const deleteCriterion = async (id: string) => {
    const res = await fetch(`/api/admin/evaluations/${evaluationId}/criteria?criterionId=${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setCriteria((prev) => prev.filter((c) => c.id !== id));
    } else {
      toast("Error al eliminar el criterio", "error");
    }
  };

  const pendingPublishCount = useMemo(
    () => roster.filter((r) => r.grade != null && !r.publishedAt).length,
    [roster],
  );

  return (
    <div className="space-y-5">
      <ToastContainer />
      <GradesImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        evaluationId={evaluationId}
        cohortId={cohortId}
        roster={roster.map((r) => ({ email: r.email, grade: r.grade }))}
        onImported={load}
      />

      {!fixedCohortId && cohorts.length > 0 && (
        <div className="max-w-xs">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-ca-ink-soft">
            Cohorte
          </label>
          <Select value={cohortId} onChange={(e) => setCohortId(e.target.value)} aria-label="Cohorte">
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* Checklist parametrizable */}
      <div className="rounded-xl border border-ca-ink/[0.08] p-4">
        <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-ca-ink-soft">Checklist</h3>
        {criteria.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2">
            {criteria.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-1.5 rounded-full bg-ca-bg-soft px-3 py-1 text-[12px] font-semibold text-ca-ink"
              >
                {c.label}
                <button
                  type="button"
                  onClick={() => deleteCriterion(c.id)}
                  aria-label={`Eliminar criterio ${c.label}`}
                  className="text-ca-ink-soft hover:text-red-600"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            value={newCriterionLabel}
            onChange={(e) => setNewCriterionLabel(e.target.value)}
            placeholder="Nuevo criterio (ej. Manejo de objeciones)"
            onKeyDown={(e) => {
              if (e.key === "Enter") addCriterion();
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={addCriterion}>
            Agregar
          </Button>
        </div>
      </div>

      {/* Roster */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-semibold text-ca-ink-soft">{roster.length} alumnos</span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!cohortId}>
            Importar Excel
          </Button>
          <Button
            type="button"
            variant="lime"
            size="sm"
            onClick={publishAll}
            disabled={publishing || pendingPublishCount === 0}
          >
            {publishing ? <LoaderIcon /> : `Publicar todas (${pendingPublishCount})`}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-8">
          <LoaderIcon />
        </div>
      ) : roster.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ca-ink/[0.10] px-4 py-8 text-center text-[13px] text-ca-ink-soft">
          Esta cohorte no tiene alumnos matriculados.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "rgba(20,22,58,0.08)" }}>
          <table className="w-full text-left">
            <thead>
              <tr style={{ background: "var(--color-ca-bg)" }}>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">Alumno</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">Nota</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">Comentario</th>
                {criteria.length > 0 && (
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">Checklist</th>
                )}
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">Estado</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((row) => (
                <tr
                  key={row.enrollmentId}
                  className="border-t align-top"
                  style={{ borderColor: "rgba(20,22,58,0.06)" }}
                >
                  <td className="px-3 py-2.5 text-[13px] font-semibold text-ca-ink">
                    {row.studentName}
                    {row.source && (
                      <div className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wide text-ca-ink-soft">
                        {row.source === "quiz" ? "Auto (quiz)" : row.source === "import" ? "Importada" : "Manual"}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Input
                      type="number"
                      min={1}
                      max={7}
                      step={0.1}
                      value={row.grade ?? ""}
                      onChange={(e) =>
                        updateRow(row.enrollmentId, {
                          grade: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="w-20"
                      style={row.grade != null ? { color: isPassing(row.grade) ? "#3f5a05" : "#9f1b3e" } : undefined}
                    />
                    {row.grade != null && (
                      <span className="ml-1 font-mono text-[11px] text-ca-ink-soft">{formatGrade(row.grade)}</span>
                    )}
                  </td>
                  <td className="min-w-[200px] px-3 py-2.5">
                    <Textarea
                      value={row.feedback ?? ""}
                      onChange={(e) => updateRow(row.enrollmentId, { feedback: e.target.value })}
                      rows={1}
                    />
                  </td>
                  {criteria.length > 0 && (
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1">
                        {criteria.map((c) => (
                          <Checkbox
                            key={c.id}
                            checked={markFor(row, c)}
                            onChange={() => toggleCriterion(row, c)}
                            label={c.label}
                          />
                        ))}
                      </div>
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <Badge tone={row.publishedAt ? "lime" : row.grade != null ? "amber" : "neutral"} size="sm">
                      {row.publishedAt ? "Publicada" : row.grade != null ? "Borrador" : "Sin nota"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={savingId === row.enrollmentId}
                        onClick={() => saveGrade(row, false)}
                      >
                        Guardar borrador
                      </Button>
                      <Button
                        type="button"
                        variant="lime"
                        size="sm"
                        disabled={savingId === row.enrollmentId}
                        onClick={() => saveGrade(row, true)}
                      >
                        Guardar y publicar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
