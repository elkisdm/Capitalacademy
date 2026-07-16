"use client";

// COPIADO del esqueleto de components/admin/csv-import-modal.tsx a propósito
// (Paso 8 del brief evaluaciones/notas 1-7): NO refactorizar a un importador
// genérico compartido — mismo patrón de parseo, distinta forma de fila.

import { useState, useRef, useCallback, useMemo } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Papa from "papaparse";
// XLSX se importa dinámicamente en parseFile: XLSX.readFile está roto en ESM
// en este repo — solo XLSX.read(buffer, {type:"array"}) funciona.

type RosterEntry = { email: string | null; grade: number | null };

type GradesImportModalProps = {
  open: boolean;
  onClose: () => void;
  evaluationId: string;
  cohortId: string;
  /** Roster ya cargado por EvaluationGrades: permite clasificar not_found/overwrite sin otra llamada. */
  roster: RosterEntry[];
  onImported: () => void;
};

type ParsedRow = {
  email: string;
  grade: number | null;
  scorePct: number | null;
  comentario: string;
  estado: "valid" | "overwrite" | "not_found" | "invalid";
  errorMsg?: string;
  selected: boolean;
};

type ImportResult = {
  created: number;
  notFound: number;
  errors: number;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STEPS = [{ label: "Subir archivo" }, { label: "Vista previa" }, { label: "Resultados" }];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div
              className="shape-circle grid h-6 w-6 place-items-center text-[10px] font-bold"
              style={{
                background: i < current ? "var(--color-ca-lime)" : i === current ? "var(--color-ca-violet)" : "rgba(20,22,58,0.08)",
                color: i < current ? "var(--color-ca-ink)" : i === current ? "#fff" : "var(--color-ca-ink-soft)",
              }}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span className="hidden text-[11px] font-bold sm:block" style={{ color: i <= current ? "var(--color-ca-ink)" : "var(--color-ca-ink-soft)" }}>
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="h-px w-6" style={{ background: i < current ? "var(--color-ca-lime)" : "rgba(20,22,58,0.12)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

function StatusDot({ estado }: { estado: ParsedRow["estado"] }) {
  const styles = {
    valid: { bg: "rgba(63,90,5,0.15)", color: "#3f5a05", label: "Válido" },
    overwrite: { bg: "rgba(217,119,6,0.12)", color: "#92400e", label: "Sobrescribe" },
    not_found: { bg: "rgba(217,119,6,0.12)", color: "#92400e", label: "No encontrado" },
    invalid: { bg: "rgba(225,29,72,0.10)", color: "#9f1b3e", label: "Inválido" },
  };
  const s = styles[estado];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: s.bg, color: s.color }}>
      <span className="shape-circle h-1.5 w-1.5" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function GradesImportModal({ open, onClose, evaluationId, cohortId, roster, onImported }: GradesImportModalProps) {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep(0);
    setFileName("");
    setRows([]);
    setResult(null);
    setDragOver(false);
    setImporting(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const processRawData = useCallback(
    (data: Record<string, string>[]) => {
      const rosterByEmail = new Map(roster.filter((r) => r.email).map((r) => [r.email!.toLowerCase(), r]));
      const parsed: ParsedRow[] = [];

      for (const raw of data) {
        const email = (raw.email ?? raw.Email ?? raw.correo ?? raw.Correo ?? "").trim().toLowerCase();
        const notaRaw = (raw.nota ?? raw.Nota ?? raw.nota_final ?? "").toString().trim();
        const porcentajeRaw = (raw.porcentaje ?? raw.Porcentaje ?? raw["%"] ?? "").toString().trim();
        const comentario = (raw.comentario ?? raw.Comentario ?? raw.feedback ?? "").toString().trim();

        let grade: number | null = null;
        let scorePct: number | null = null;
        let estado: ParsedRow["estado"] = "valid";
        let errorMsg: string | undefined;

        if (!email || !EMAIL_REGEX.test(email)) {
          estado = "invalid";
          errorMsg = "Email inválido o vacío";
        } else if (notaRaw) {
          // Coma decimal chilena: "6,3" → "6.3" (R11 del brief).
          const n = Number(notaRaw.replace(",", "."));
          if (Number.isNaN(n) || n < 1 || n > 7) {
            estado = "invalid";
            errorMsg = "Nota fuera de rango (1.0-7.0)";
          } else {
            grade = n;
          }
        } else if (porcentajeRaw) {
          const n = Number(porcentajeRaw.replace(",", "."));
          if (Number.isNaN(n) || n < 0 || n > 100) {
            estado = "invalid";
            errorMsg = "Porcentaje fuera de rango (0-100)";
          } else {
            scorePct = n;
          }
        } else {
          estado = "invalid";
          errorMsg = "Falta la columna nota o porcentaje";
        }

        if (estado === "valid") {
          const entry = rosterByEmail.get(email);
          if (!entry) {
            estado = "not_found";
            errorMsg = "El email no está matriculado en esta cohorte";
          } else if (entry.grade != null) {
            estado = "overwrite";
            errorMsg = "Ya tiene una nota cargada";
          }
        }

        parsed.push({
          email,
          grade,
          scorePct,
          comentario,
          estado,
          errorMsg,
          selected: estado === "valid",
        });
      }

      setRows(parsed);
      setStep(1);
    },
    [roster],
  );

  const parseFile = useCallback(
    (file: File) => {
      setFileName(file.name);
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "xlsx" || ext === "xls") {
        Promise.all([file.arrayBuffer(), import("xlsx")]).then(([buffer, XLSX]) => {
          const workbook = XLSX.read(buffer, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
          processRawData(jsonData);
        });
      } else {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => processRawData(results.data as Record<string, string>[]),
        });
      }
    },
    [processRawData],
  );

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && /\.(csv|xlsx|xls)$/i.test(file.name)) parseFile(file);
    },
    [parseFile],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) parseFile(file);
    },
    [parseFile],
  );

  const { validCount, issueCount, selectedCount } = useMemo(() => {
    let valid = 0;
    let issue = 0;
    let selected = 0;
    for (const r of rows) {
      if (r.estado === "valid") valid++;
      else issue++;
      if (r.selected) selected++;
    }
    return { validCount: valid, issueCount: issue, selectedCount: selected };
  }, [rows]);

  const toggleRow = (index: number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index && (r.estado === "valid" || r.estado === "overwrite") ? { ...r, selected: !r.selected } : r)),
    );
  };

  const handleImport = async () => {
    const selected = rows.filter((r) => r.selected);
    if (selected.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/admin/evaluations/${evaluationId}/grades/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohortId,
          rows: selected.map((r) => ({
            email: r.email,
            grade: r.grade ?? undefined,
            scorePct: r.scorePct ?? undefined,
            comentario: r.comentario || undefined,
          })),
        }),
      });
      const data = await res.json().catch(() => ({ created: 0, results: [] }));
      const notFound = (data.results ?? []).filter((d: { status: string }) => d.status === "not_found").length;
      const errors = (data.results ?? []).filter((d: { status: string }) => d.status === "error").length;
      setResult({ created: data.created ?? 0, notFound, errors });
      setStep(2);
      onImported();
    } catch {
      setResult({ created: 0, notFound: 0, errors: selected.length });
      setStep(2);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} aria-label="Importar notas" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "rgba(20,22,58,0.08)" }}>
        <div>
          <h2 className="text-[18px] font-black tracking-tight text-ca-ink">Importar notas desde Excel</h2>
          <div className="mt-1">
            <StepIndicator current={step} />
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={handleClose} aria-label="Cerrar" className="h-9 w-9 p-0 text-ca-ink-soft hover:text-ca-ink">
          ×
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {step === 0 && (
          <div className="flex flex-col items-center">
            <div
              className="flex w-full cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-8 py-12 text-center transition-colors"
              style={{
                borderColor: dragOver ? "var(--color-ca-violet)" : "rgba(20,22,58,0.14)",
                background: dragOver ? "rgba(94,23,235,0.04)" : "var(--color-ca-bg)",
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <p className="text-[15px] font-bold text-ca-ink">Arrastra tu archivo CSV o Excel aquí</p>
              <p className="mt-1 text-[13px] font-medium text-ca-ink-soft">
                Columnas: <code>email</code>, <code>nota</code> (o <code>porcentaje</code>), <code>comentario</code>
              </p>
              <Button
                type="button"
                variant="primary"
                className="mt-5"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Seleccionar archivo
              </Button>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileSelect} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl px-4 py-3" style={{ background: "var(--color-ca-bg)" }}>
              <span className="text-[13px] font-semibold text-ca-ink">{fileName}</span>
              <span className="text-[12px] font-bold text-ca-ink-soft">{rows.length} filas</span>
              <span className="text-[12px] font-bold" style={{ color: "#3f5a05" }}>
                {validCount} válidas
              </span>
              {issueCount > 0 && (
                <span className="text-[12px] font-bold" style={{ color: "#92400e" }}>
                  {issueCount} con problemas
                </span>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "rgba(20,22,58,0.08)" }}>
              <table className="w-full text-left">
                <thead>
                  <tr style={{ background: "var(--color-ca-bg)" }}>
                    <th className="px-3 py-2.5"></th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Email</th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Nota</th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-t transition-colors hover:bg-ca-bg-soft/50" style={{ borderColor: "rgba(20,22,58,0.06)", opacity: row.estado === "invalid" || row.estado === "not_found" ? 0.6 : 1 }}>
                      <td className="px-3 py-2.5">
                        <Checkbox
                          checked={row.selected}
                          disabled={row.estado === "invalid" || row.estado === "not_found"}
                          onChange={() => toggleRow(i)}
                          aria-label={`Seleccionar ${row.email || `fila ${i + 1}`}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-[13px] font-medium text-ca-ink-soft">{row.email || "—"}</td>
                      <td className="px-3 py-2.5 text-[13px] font-semibold text-ca-ink">
                        {row.grade != null ? row.grade.toFixed(1) : row.scorePct != null ? `${row.scorePct}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusDot estado={row.estado} />
                        {row.errorMsg && <p className="mt-0.5 text-[11px] text-ca-ink-soft">{row.errorMsg}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-[12px] font-semibold text-ca-ink-soft">{selectedCount} de {rows.length} filas seleccionadas para importar</div>
          </div>
        )}

        {step === 2 && result && (
          <div className="flex flex-col items-center text-center">
            <h3 className="text-[20px] font-black tracking-tight text-ca-ink">Importación completada</h3>
            <div className="mt-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl px-4 py-4" style={{ background: "rgba(63,90,5,0.08)" }}>
                <div className="font-mono text-[28px] font-black" style={{ color: "#3f5a05" }}>{result.created}</div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#3f5a05" }}>Notas cargadas</div>
              </div>
              <div className="rounded-xl px-4 py-4" style={{ background: "rgba(217,119,6,0.08)" }}>
                <div className="font-mono text-[28px] font-black" style={{ color: "#92400e" }}>{result.notFound}</div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#92400e" }}>No encontrados</div>
              </div>
              <div className="rounded-xl px-4 py-4" style={{ background: "rgba(225,29,72,0.08)" }}>
                <div className="font-mono text-[28px] font-black" style={{ color: "#9f1b3e" }}>{result.errors}</div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#9f1b3e" }}>Errores</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t px-6 py-4" style={{ borderColor: "rgba(20,22,58,0.08)" }}>
        <div>
          {step === 1 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setStep(0); setRows([]); setFileName(""); }}>
              Volver
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {step < 2 && (
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          )}
          {step === 1 && (
            <Button type="button" variant="primary" onClick={handleImport} disabled={selectedCount === 0 || importing}>
              {importing ? "Importando…" : `Importar ${selectedCount} notas`}
            </Button>
          )}
          {step === 2 && (
            <Button type="button" variant="outline" onClick={handleClose}>
              Cerrar
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
