"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import Papa from "papaparse";
// XLSX is imported dynamically in parseFile only when handling .xlsx/.xls files

type CohortOption = {
  id: string;
  name: string;
};

type CsvImportModalProps = {
  open: boolean;
  onClose: () => void;
  cohorts: CohortOption[];
  existingEmails?: string[];
};

type ParsedRow = {
  nombre: string;
  email: string;
  telefono: string;
  cohorte: string;
  rol: string;
  estado: "valid" | "duplicate" | "invalid";
  errorMsg?: string;
  selected: boolean;
};

type ImportResult = {
  created: number;
  skipped: number;
  invalid: number;
  details: Array<{ email: string; status: "created" | "skipped" | "invalid"; reason?: string }>;
};

function CloseIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STEPS = [
  { label: "Subir archivo" },
  { label: "Vista previa" },
  { label: "Resultados" },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div
              className="shape-circle grid h-6 w-6 place-items-center text-[10px] font-bold"
              style={{
                background: i < current
                  ? "var(--color-ca-lime)"
                  : i === current
                    ? "var(--color-ca-violet)"
                    : "rgba(20,22,58,0.08)",
                color: i < current
                  ? "var(--color-ca-ink)"
                  : i === current
                    ? "#fff"
                    : "var(--color-ca-ink-soft)",
              }}
            >
              {i < current ? (
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span
              className="hidden text-[11px] font-bold sm:block"
              style={{
                color: i <= current ? "var(--color-ca-ink)" : "var(--color-ca-ink-soft)",
              }}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className="h-px w-6"
              style={{
                background: i < current ? "var(--color-ca-lime)" : "rgba(20,22,58,0.12)",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function StatusDot({ estado }: { estado: ParsedRow["estado"] }) {
  const styles = {
    valid: { bg: "rgba(63,90,5,0.15)", color: "#3f5a05", label: "Válido" },
    duplicate: { bg: "rgba(217,119,6,0.12)", color: "#92400e", label: "Duplicado" },
    invalid: { bg: "rgba(225,29,72,0.10)", color: "#9f1b3e", label: "Inválido" },
  };
  const s = styles[estado];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: s.bg, color: s.color }}
    >
      <span className="shape-circle h-1.5 w-1.5" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function CsvImportModal({ open, onClose, cohorts, existingEmails = [] }: CsvImportModalProps) {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedCohortId, setSelectedCohortId] = useState(cohorts[0]?.id ?? "");
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

  const processRawData = useCallback((data: Record<string, string>[]) => {
    const existingSet = new Set(existingEmails.map((e) => e.toLowerCase()));
    const emailsSeen = new Set<string>();
    const parsed: ParsedRow[] = [];

    for (const raw of data) {
      const nombre = (raw.nombre ?? raw.Nombre ?? raw.name ?? raw.full_name ?? raw.nombre_completo ?? "").trim();
      const email = (raw.email ?? raw.Email ?? raw.correo ?? "").trim().toLowerCase();
      const telefono = (raw.telefono ?? raw.Telefono ?? raw.phone ?? raw.Teléfono ?? raw["teléfono"] ?? "").trim();
      const cohorte = (raw.cohorte ?? raw.Cohorte ?? raw.cohort ?? "").trim();
      const rol = (raw.rol ?? raw.Rol ?? raw.role ?? "student").trim();

      let estado: ParsedRow["estado"] = "valid";
      let errorMsg: string | undefined;

      if (!nombre || !email) {
        estado = "invalid";
        errorMsg = "Nombre y email son requeridos";
      } else if (!EMAIL_REGEX.test(email)) {
        estado = "invalid";
        errorMsg = "Email inválido";
      } else if (emailsSeen.has(email)) {
        estado = "duplicate";
        errorMsg = "Email duplicado en el archivo";
      } else if (existingSet.has(email)) {
        estado = "duplicate";
        errorMsg = "Email ya registrado en la plataforma";
      }

      emailsSeen.add(email);

      parsed.push({
        nombre,
        email,
        telefono,
        cohorte,
        rol,
        estado,
        errorMsg,
        selected: estado === "valid",
      });
    }

    setRows(parsed);
    setStep(1);
  }, [existingEmails]);

  const parseFile = useCallback((file: File) => {
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
        complete: (results) => {
          processRawData(results.data as Record<string, string>[]);
        },
      });
    }
  }, [processRawData]);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && /\.(csv|xlsx|xls)$/i.test(file.name)) {
        parseFile(file);
      }
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

  const { validCount, duplicateCount, invalidCount, selectedCount, allValidSelected } = useMemo(() => {
    let valid = 0, duplicate = 0, invalid = 0, selected = 0;
    let allValidSel = true;
    for (const r of rows) {
      if (r.estado === "valid") { valid++; if (!r.selected) allValidSel = false; }
      else if (r.estado === "duplicate") duplicate++;
      else if (r.estado === "invalid") invalid++;
      if (r.selected) selected++;
    }
    return { validCount: valid, duplicateCount: duplicate, invalidCount: invalid, selectedCount: selected, allValidSelected: allValidSel };
  }, [rows]);

  const someValidSelected = selectedCount > 0 && !allValidSelected;

  const toggleSelectAll = () => {
    const newVal = !allValidSelected;
    setRows((prev) =>
      prev.map((r) => (r.estado === "valid" ? { ...r, selected: newVal } : r)),
    );
  };

  const toggleRow = (index: number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index && r.estado === "valid" ? { ...r, selected: !r.selected } : r)),
    );
  };

  const handleImport = async () => {
    const selected = rows.filter((r) => r.selected);
    if (selected.length === 0 || !selectedCohortId) return;

    setImporting(true);

    try {
      const res = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: selected.map((r) => ({
            email: r.email,
            full_name: r.nombre,
            phone: r.telefono || undefined,
          })),
          cohort_id: selectedCohortId,
          send_invitations: false,
        }),
      });

      const data = await res.json();

      const errorMap = new Map<string, string>();
      for (const err of data.errors ?? []) {
        const raw: string = err.reason ?? "";
        let friendly = raw;
        if (raw.includes("already been registered") || raw.includes("duplicate"))
          friendly = "Email ya registrado";
        else if (raw.includes("unique or exclusion constraint"))
          friendly = "Ya asignado a esta cohorte";
        else if (raw.includes("Perfil:"))
          friendly = "Error al crear perfil";
        else if (raw.includes("Enrollment:"))
          friendly = "Error al matricular";
        else if (raw.includes("Rol:"))
          friendly = "Error al asignar rol";
        errorMap.set(err.email, friendly);
      }

      const details: ImportResult["details"] = [];
      for (const row of selected) {
        const reason = errorMap.get(row.email);
        if (reason) {
          details.push({ email: row.email, status: "invalid", reason });
        } else {
          details.push({ email: row.email, status: "created" });
        }
      }

      const skipped = rows.filter((r) => !r.selected).length;

      setResult({
        created: data.created ?? 0,
        skipped,
        invalid: errorMap.size,
        details,
      });
      setStep(2);
    } catch {
      setResult({
        created: 0,
        skipped: 0,
        invalid: selected.length,
        details: selected.map((r) => ({
          email: r.email,
          status: "invalid",
          reason: "Error de conexión",
        })),
      });
      setStep(2);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    window.open("/api/admin/users/template", "_blank");
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-label="Importar usuarios"
      className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden p-0"
    >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "rgba(20,22,58,0.08)" }}>
            <div>
              <h2 className="text-[18px] font-black tracking-tight text-ca-ink">
                Importar usuarios
              </h2>
              <div className="mt-1">
                <StepIndicator current={step} />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              aria-label="Cerrar"
              className="h-9 w-9 p-0 text-ca-ink-soft hover:text-ca-ink"
            >
              <CloseIcon />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* Step 0 — Upload */}
            {step === 0 && (
              <div className="flex flex-col items-center">
                {/* Cohort selector */}
                <div className="mb-6 w-full max-w-sm">
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
                    Cohorte destino
                  </label>
                  <Select
                    value={selectedCohortId}
                    onChange={(e) => setSelectedCohortId(e.target.value)}
                    aria-label="Cohorte destino"
                  >
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>

                {/* Drop zone */}
                <div
                  className="flex w-full cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-8 py-12 text-center transition-colors"
                  style={{
                    borderColor: dragOver
                      ? "var(--color-ca-violet)"
                      : "rgba(20,22,58,0.14)",
                    background: dragOver
                      ? "rgba(94,23,235,0.04)"
                      : "var(--color-ca-bg)",
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div
                    className="mb-4 grid h-16 w-16 place-items-center rounded-2xl"
                    style={{ background: "rgba(94,23,235,0.10)", color: "var(--color-ca-violet)" }}
                  >
                    <UploadIcon />
                  </div>
                  <p className="text-[15px] font-bold text-ca-ink">
                    Arrastra tu archivo CSV o Excel aquí
                  </p>
                  <p className="mt-1 flex items-center justify-center gap-2 text-[13px] font-medium text-ca-ink-soft">
                    <span className="rounded bg-ca-bg-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-ca-ink-soft">CSV</span>
                    <span className="rounded bg-ca-bg-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-ca-ink-soft">XLSX</span>
                    <span className="text-ca-ink-soft">o haz clic para seleccionar</span>
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
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>

                {/* Template link */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}
                  className="mt-4 gap-2 text-ca-violet hover:bg-transparent hover:text-ca-violet-deep"
                >
                  <DownloadIcon />
                  Descargar plantilla
                </Button>
              </div>
            )}

            {/* Step 1 — Preview */}
            {step === 1 && (
              <div>
                {/* Summary bar */}
                <div
                  className="mb-4 flex flex-wrap items-center gap-4 rounded-xl px-4 py-3"
                  style={{ background: "var(--color-ca-bg)" }}
                >
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-ca-ink">
                    <FileIcon />
                    {fileName}
                  </div>
                  <div className="h-4 w-px" style={{ background: "rgba(20,22,58,0.12)" }} />
                  <span className="text-[12px] font-bold text-ca-ink-soft">
                    {rows.length} filas
                  </span>
                  <span className="text-[12px] font-bold" style={{ color: "#3f5a05" }}>
                    {validCount} válidos
                  </span>
                  {duplicateCount > 0 && (
                    <span className="text-[12px] font-bold" style={{ color: "#92400e" }}>
                      {duplicateCount} duplicados
                    </span>
                  )}
                  {invalidCount > 0 && (
                    <span className="text-[12px] font-bold" style={{ color: "#9f1b3e" }}>
                      {invalidCount} inválidos
                    </span>
                  )}
                </div>

                {/* Warning for issues */}
                {(duplicateCount > 0 || invalidCount > 0) && (
                  <div
                    className="mb-4 flex items-start gap-3 rounded-xl px-4 py-3"
                    style={{ background: "rgba(217,119,6,0.08)" }}
                  >
                    <span className="mt-0.5" style={{ color: "#92400e" }}>
                      <AlertTriangleIcon />
                    </span>
                    <p className="text-[12px] font-semibold" style={{ color: "#92400e" }}>
                      {duplicateCount > 0 && `${duplicateCount} email(s) duplicado(s) serán omitidos. `}
                      {invalidCount > 0 && `${invalidCount} fila(s) con datos inválidos no se importarán.`}
                    </p>
                  </div>
                )}

                {/* Table */}
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "rgba(20,22,58,0.08)" }}>
                  <table className="w-full text-left">
                    <thead>
                      <tr style={{ background: "var(--color-ca-bg)" }}>
                        <th className="px-3 py-2.5">
                          <Checkbox
                            checked={allValidSelected}
                            indeterminate={someValidSelected}
                            onChange={toggleSelectAll}
                            aria-label="Seleccionar todas las filas válidas"
                          />
                        </th>
                        <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Nombre</th>
                        <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Email</th>
                        <th className="hidden px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft sm:table-cell">Teléfono</th>
                        <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr
                          key={i}
                          className="border-t transition-colors hover:bg-ca-bg-soft/50"
                          style={{
                            borderColor: "rgba(20,22,58,0.06)",
                            opacity: row.estado !== "valid" ? 0.6 : 1,
                          }}
                        >
                          <td className="px-3 py-2.5">
                            <Checkbox
                              checked={row.selected}
                              disabled={row.estado !== "valid"}
                              onChange={() => toggleRow(i)}
                              aria-label={`Seleccionar ${row.email || row.nombre || `fila ${i + 1}`}`}
                            />
                          </td>
                          <td className="px-3 py-2.5 text-[13px] font-semibold text-ca-ink">
                            {row.nombre || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-[13px] font-medium text-ca-ink-soft">
                            {row.email || "—"}
                          </td>
                          <td className="hidden px-3 py-2.5 text-[13px] font-medium text-ca-ink-soft sm:table-cell">
                            {row.telefono || "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusDot estado={row.estado} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 text-[12px] font-semibold text-ca-ink-soft">
                  {selectedCount} de {rows.length} filas seleccionadas para importar
                </div>
              </div>
            )}

            {/* Step 2 — Results */}
            {step === 2 && result && (
              <div className="flex flex-col items-center text-center">
                <div
                  className="mb-4 grid h-20 w-20 place-items-center rounded-full"
                  style={{ background: "rgba(63,90,5,0.12)", color: "#3f5a05" }}
                >
                  <CheckCircleIcon />
                </div>
                <h3 className="text-[20px] font-black tracking-tight text-ca-ink">
                  Importación completada
                </h3>
                <p className="mt-1 text-[13px] font-medium text-ca-ink-soft">
                  El proceso finalizó con los siguientes resultados
                </p>

                {/* Stat cards */}
                <div className="mt-6 grid w-full grid-cols-3 gap-3">
                  <div className="rounded-xl px-4 py-4" style={{ background: "rgba(63,90,5,0.08)" }}>
                    <div className="font-mono text-[28px] font-black" style={{ color: "#3f5a05" }}>
                      {result.created}
                    </div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#3f5a05" }}>
                      Creados
                    </div>
                  </div>
                  <div className="rounded-xl px-4 py-4" style={{ background: "rgba(217,119,6,0.08)" }}>
                    <div className="font-mono text-[28px] font-black" style={{ color: "#92400e" }}>
                      {result.skipped}
                    </div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#92400e" }}>
                      Omitidos
                    </div>
                  </div>
                  <div className="rounded-xl px-4 py-4" style={{ background: "rgba(225,29,72,0.08)" }}>
                    <div className="font-mono text-[28px] font-black" style={{ color: "#9f1b3e" }}>
                      {result.invalid}
                    </div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#9f1b3e" }}>
                      Inválidos
                    </div>
                  </div>
                </div>

                {/* Detail list */}
                {result.details.length > 0 && (
                  <div className="mt-5 w-full max-h-[200px] overflow-y-auto rounded-xl border px-4 py-3 text-left" style={{ borderColor: "rgba(20,22,58,0.08)" }}>
                    {result.details.map((d, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 py-1.5"
                        style={{ borderTop: i > 0 ? "1px solid rgba(20,22,58,0.06)" : undefined }}
                      >
                        <span
                          className="shape-circle h-2 w-2 shrink-0"
                          style={{
                            background: d.status === "created"
                              ? "#3f5a05"
                              : d.status === "skipped"
                                ? "#92400e"
                                : "#9f1b3e",
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ca-ink">
                          {d.email}
                        </span>
                        {d.reason && (
                          <span className="text-[11px] font-semibold text-ca-ink-soft">
                            {d.reason}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between border-t px-6 py-4"
            style={{ borderColor: "rgba(20,22,58,0.08)" }}
          >
            <div>
              {step === 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setStep(0); setRows([]); setFileName(""); }}
                  className="gap-2 text-ca-ink-soft hover:bg-transparent hover:text-ca-ink"
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
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
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleImport}
                  disabled={selectedCount === 0 || importing}
                >
                  {importing ? "Importando…" : `Importar ${selectedCount} usuarios`}
                </Button>
              )}
              {step === 2 && (
                <>
                  <Button type="button" variant="outline" onClick={handleClose}>
                    Cerrar
                  </Button>
                  <Button type="button" variant="primary" disabled title="Próximamente">
                    Reenviar invitaciones
                  </Button>
                </>
              )}
            </div>
          </div>
    </Dialog>
  );
}
