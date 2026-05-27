"use client";

import { useState, useEffect } from "react";
import type { CohortRole } from "./user-primitives";

type CohortOption = {
  id: string;
  name: string;
  program_name: string;
  status: string;
};

type ModuleOption = {
  id: string;
  title: string;
  position: number;
};

type ExistingAssignment = {
  cohort_id: string;
  role: CohortRole;
};

type AssignCohortModalProps = {
  open: boolean;
  user: { id: string; full_name: string; existing_assignments?: ExistingAssignment[] } | null;
  cohorts: CohortOption[];
  onClose: () => void;
  onAssign: (data: { userId: string; cohortId: string; role: CohortRole; moduleId?: string }) => void | Promise<void>;
};

function CloseIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

const ROLE_CARDS: { value: CohortRole; label: string; description: string }[] = [
  { value: "student", label: "Alumno", description: "Acceso al contenido y evaluaciones del programa" },
  { value: "teacher", label: "Profesor", description: "Imparte clases y gestiona módulos asignados" },
  { value: "assistant", label: "Ayudante", description: "Apoya al profesor y modera foros de discusión" },
];

const ROLE_STYLES: Record<CohortRole, { bg: string; border: string; dot: string }> = {
  student: { bg: "rgba(168,211,16,0.10)", border: "var(--color-ca-lime-deep)", dot: "var(--color-ca-lime)" },
  teacher: { bg: "rgba(94,23,235,0.08)", border: "var(--color-ca-violet)", dot: "var(--color-ca-violet)" },
  assistant: { bg: "rgba(20,22,58,0.06)", border: "var(--color-ca-navy, #14163a)", dot: "var(--color-ca-navy, #14163a)" },
};

const INPUT_CLASS =
  "w-full rounded-xl border border-ca-ink/[0.14] bg-white px-4 py-2.5 text-[13px] font-medium text-ca-ink outline-none transition-colors focus:border-ca-violet";

export function AssignCohortModal({ open, user, cohorts, onClose, onAssign }: AssignCohortModalProps) {
  const [selectedCohortId, setSelectedCohortId] = useState("");
  const [selectedRole, setSelectedRole] = useState<CohortRole>("student");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [cohortDropdownOpen, setCohortDropdownOpen] = useState(false);
  const [cohortSearch, setCohortSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [localModules, setLocalModules] = useState<ModuleOption[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedCohortId("");
      setSelectedRole("student");
      setSelectedModuleId("");
      setCohortDropdownOpen(false);
      setCohortSearch("");
      setSaving(false);
      setLocalModules([]);
    }
  }, [open]);

  useEffect(() => {
    if (selectedRole !== "teacher" || !selectedCohortId) {
      setLocalModules([]);
      setSelectedModuleId("");
      return;
    }
    setLoadingModules(true);
    fetch(`/api/admin/modules?cohortId=${encodeURIComponent(selectedCohortId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setLocalModules(data);
        else setLocalModules([]);
      })
      .catch(() => setLocalModules([]))
      .finally(() => setLoadingModules(false));
  }, [selectedRole, selectedCohortId]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (cohortDropdownOpen) {
          setCohortDropdownOpen(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, cohortDropdownOpen, onClose]);

  const filteredCohorts = cohorts.filter(
    (c) =>
      c.name.toLowerCase().includes(cohortSearch.toLowerCase()) ||
      c.program_name.toLowerCase().includes(cohortSearch.toLowerCase()),
  );

  const selectedCohort = cohorts.find((c) => c.id === selectedCohortId);

  const existingInSameCohort = user?.existing_assignments?.find(
    (a) => a.cohort_id === selectedCohortId,
  );
  const hasDifferentRole = existingInSameCohort && existingInSameCohort.role !== selectedRole;
  const hasSameRole = existingInSameCohort && existingInSameCohort.role === selectedRole;

  const handleAssign = async () => {
    if (!user || !selectedCohortId || hasSameRole) return;
    setSaving(true);
    try {
      await onAssign({
        userId: user.id,
        cohortId: selectedCohortId,
        role: selectedRole,
        ...(selectedRole === "teacher" && selectedModuleId ? { moduleId: selectedModuleId } : {}),
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="ca-fade-up fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: "rgba(15, 19, 64, 0.45)", backdropFilter: "blur(6px)" }}
    >
      <div className="ca-card relative flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-ca-ink/[0.08] px-6 py-5">
          <div>
            <h2 className="text-[20px] font-black tracking-tight text-ca-ink">
              Asignar a cohorte
            </h2>
            <p className="mt-0.5 text-[12px] font-semibold text-ca-ink-soft">
              {user?.full_name}
            </p>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-ca-bg-soft">
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex flex-col gap-6">
            {/* Cohort picker */}
            <div>
              <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                Cohorte
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCohortDropdownOpen(!cohortDropdownOpen)}
                  className={`${INPUT_CLASS} flex items-center justify-between text-left`}
                >
                  <span className={selectedCohort ? "text-ca-ink" : "text-ca-ink-soft"}>
                    {selectedCohort
                      ? selectedCohort.name.startsWith(selectedCohort.program_name)
                        ? selectedCohort.name
                        : `${selectedCohort.program_name} — ${selectedCohort.name}`
                      : "Selecciona una cohorte"}
                  </span>
                  <ChevronDown />
                </button>

                {cohortDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-ca-ink/[0.08] bg-white shadow-lg">
                    <div className="border-b border-ca-ink/[0.08] p-2">
                      <div className="flex items-center gap-2 rounded-lg bg-ca-bg-soft px-3 py-2">
                        <SearchIcon />
                        <input
                          autoFocus
                          type="text"
                          value={cohortSearch}
                          onChange={(e) => setCohortSearch(e.target.value)}
                          placeholder="Buscar cohorte..."
                          className="flex-1 bg-transparent text-[12px] font-medium text-ca-ink outline-none"
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto py-1">
                      {filteredCohorts.length === 0 && (
                        <div className="px-4 py-3 text-center text-[12px] text-ca-ink-soft">
                          Sin resultados
                        </div>
                      )}
                      {filteredCohorts.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedCohortId(c.id);
                            setCohortDropdownOpen(false);
                            setCohortSearch("");
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ca-bg-soft"
                          style={{
                            background: c.id === selectedCohortId ? "rgba(94,23,235,0.06)" : undefined,
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-bold text-ca-ink">{c.name}</div>
                            <div className="text-[11px] text-ca-ink-soft">{c.program_name}</div>
                          </div>
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]"
                            style={{
                              background: c.status === "active" ? "rgba(168,211,16,0.20)" : "rgba(20,22,58,0.06)",
                              color: c.status === "active" ? "#3f5a05" : "var(--color-ca-ink-soft)",
                            }}
                          >
                            {c.status === "active" ? "Activa" : c.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Role selector */}
            <div>
              <label className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                Rol en la cohorte
              </label>
              <div className="grid grid-cols-3 gap-3">
                {ROLE_CARDS.map((rc) => {
                  const isActive = selectedRole === rc.value;
                  const rs = ROLE_STYLES[rc.value];
                  return (
                    <button
                      key={rc.value}
                      onClick={() => setSelectedRole(rc.value)}
                      className="rounded-xl border-2 p-3.5 text-left transition-all"
                      style={{
                        borderColor: isActive ? rs.border : "rgba(20,22,58,0.08)",
                        background: isActive ? rs.bg : "transparent",
                      }}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="shape-circle h-2.5 w-2.5" style={{ background: rs.dot }} />
                        <span className="text-[13px] font-bold text-ca-ink">{rc.label}</span>
                      </div>
                      <p className="text-[11px] leading-snug text-ca-ink-soft">{rc.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedRole === "teacher" && !selectedCohortId && (
              <div className="flex items-center gap-2 rounded-xl border border-ca-ink/[0.08] px-4 py-2.5">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ca-ink-soft">
                  <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
                </svg>
                <span className="text-[12px] font-semibold text-ca-ink-soft">
                  Selecciona una cohorte para ver los módulos disponibles
                </span>
              </div>
            )}
            {selectedRole === "teacher" && selectedCohortId && (
              <div>
                <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  Módulo asignado
                </label>
                {loadingModules ? (
                  <div className="flex items-center gap-2 rounded-xl border border-ca-ink/[0.14] bg-white px-4 py-2.5 text-[13px] text-ca-ink-soft">
                    Cargando módulos...
                  </div>
                ) : localModules.length > 0 ? (
                  <select
                    value={selectedModuleId}
                    onChange={(e) => setSelectedModuleId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    <option value="">Todos los módulos</option>
                    {localModules.map((m) => (
                      <option key={m.id} value={m.id}>
                        M{String(m.position).padStart(2, "0")} — {m.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-xl border border-ca-ink/[0.14] bg-white px-4 py-2.5 text-[13px] text-ca-ink-soft">
                    Sin módulos configurados para este programa
                  </div>
                )}
              </div>
            )}

            {/* Info note: different role in same cohort */}
            {hasDifferentRole && (
              <div
                className="flex items-start gap-3 rounded-xl px-4 py-3"
                style={{ background: "rgba(94,23,235,0.08)" }}
              >
                <span className="mt-0.5 shrink-0 text-ca-violet"><InfoIcon /></span>
                <p className="text-[12px] font-semibold leading-snug text-ca-ink">
                  Este usuario ya tiene el rol de{" "}
                  <strong>{existingInSameCohort.role === "student" ? "Alumno" : existingInSameCohort.role === "teacher" ? "Profesor" : "Ayudante"}</strong>{" "}
                  en esta cohorte. Se actualizará al nuevo rol seleccionado.
                </p>
              </div>
            )}

            {/* Error: same role in same cohort */}
            {hasSameRole && (
              <div
                className="flex items-start gap-3 rounded-xl px-4 py-3"
                style={{ background: "rgba(225,29,72,0.08)" }}
              >
                <span className="mt-0.5 shrink-0 text-red-600"><InfoIcon /></span>
                <p className="text-[12px] font-semibold leading-snug text-red-700">
                  Este usuario ya tiene el rol de{" "}
                  <strong>{existingInSameCohort.role === "student" ? "Alumno" : existingInSameCohort.role === "teacher" ? "Profesor" : "Ayudante"}</strong>{" "}
                  en esta cohorte.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-ca-ink/[0.08] px-6 py-4" style={{ background: "var(--color-ca-bg-soft)" }}>
          <button
            onClick={onClose}
            className="rounded-full border border-ca-ink/[0.14] px-5 py-2.5 text-[13px] font-bold text-ca-ink transition-colors hover:bg-white"
          >
            Cancelar
          </button>
          <button
            onClick={handleAssign}
            disabled={saving || !selectedCohortId || !!hasSameRole}
            className="ca-btn-primary px-6 py-2.5 text-[13px] font-bold disabled:opacity-50"
          >
            {saving ? "Asignando..." : "Asignar"}
          </button>
        </div>
      </div>
    </div>
  );
}
