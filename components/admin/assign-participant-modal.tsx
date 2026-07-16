"use client";

import { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import type { CohortRole } from "./user-primitives";
import type { AdminUserListItem } from "@/lib/admin/user-queries";

type ModuleOption = {
  id: string;
  title: string;
  position: number;
};

type AssignParticipantModalProps = {
  open: boolean;
  cohortId: string;
  cohortName: string;
  users: AdminUserListItem[];
  onClose: () => void;
  onAssign: (data: { userId: string; role: CohortRole; moduleId?: string }) => void | Promise<void>;
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

export function AssignParticipantModal({
  open,
  cohortId,
  cohortName,
  users,
  onClose,
  onAssign,
}: AssignParticipantModalProps) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<CohortRole>("student");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [localModules, setLocalModules] = useState<ModuleOption[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedUserId("");
      setSelectedRole("student");
      setSelectedModuleId("");
      setUserDropdownOpen(false);
      setUserSearch("");
      setSaving(false);
      setLocalModules([]);
    }
  }, [open]);

  useEffect(() => {
    if (selectedRole !== "teacher") {
      setLocalModules([]);
      setSelectedModuleId("");
      return;
    }
    setLoadingModules(true);
    fetch(`/api/admin/modules?cohortId=${encodeURIComponent(cohortId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setLocalModules(data);
        else setLocalModules([]);
      })
      .catch(() => setLocalModules([]))
      .finally(() => setLoadingModules(false));
  }, [selectedRole, cohortId]);

  // Cuando el combobox de usuario está abierto, Escape debe cerrar solo el
  // combobox (no todo el modal). Se intercepta en fase de captura para
  // adelantarse al listener de Escape del <Dialog>.
  useEffect(() => {
    if (!open || !userDropdownOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [open, userDropdownOpen]);

  const filteredUsers = users.filter(
    (u) =>
      (u.full_name ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()),
  );

  const selectedUser = users.find((u) => u.id === selectedUserId);

  const existingInThisCohort = selectedUser?.cohort_roles.find(
    (cr) => cr.cohort_id === cohortId,
  );
  const hasDifferentRole = existingInThisCohort && existingInThisCohort.role !== selectedRole;
  const hasSameRole = existingInThisCohort && existingInThisCohort.role === selectedRole;

  const handleAssign = async () => {
    if (!selectedUser || !selectedUserId || hasSameRole) return;
    setSaving(true);
    try {
      await onAssign({
        userId: selectedUserId,
        role: selectedRole,
        ...(selectedRole === "teacher" && selectedModuleId ? { moduleId: selectedModuleId } : {}),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-label="Agregar participante"
      className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden p-0"
    >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-ca-ink/[0.08] px-6 py-5">
          <div>
            <h2 className="text-[20px] font-black tracking-tight text-ca-ink">
              Agregar participante
            </h2>
            <p className="mt-0.5 text-[12px] font-semibold text-ca-ink-soft">
              {cohortName}
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={onClose} aria-label="Cerrar" className="h-10 w-10 p-0">
            <CloseIcon />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex flex-col gap-6">
            {/* User picker */}
            <div>
              <label className="mb-1.5 block font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                Usuario
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className={`${INPUT_CLASS} flex items-center justify-between text-left`}
                >
                  <span className={selectedUser ? "text-ca-ink" : "text-ca-ink-soft"}>
                    {selectedUser ? selectedUser.full_name ?? selectedUser.email : "Selecciona un usuario"}
                  </span>
                  <ChevronDown />
                </button>

                {userDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-ca-ink/[0.08] bg-white shadow-lg">
                    <div className="border-b border-ca-ink/[0.08] p-2">
                      <div className="flex items-center gap-2 rounded-lg bg-ca-bg-soft px-3 py-2">
                        <SearchIcon />
                        <input
                          autoFocus
                          type="text"
                          aria-label="Buscar usuario"
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          placeholder="Buscar por nombre o email…"
                          className="flex-1 bg-transparent text-[12px] font-medium text-ca-ink outline-none"
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto py-1">
                      {filteredUsers.length === 0 && (
                        <div className="px-4 py-3 text-center text-[12px] text-ca-ink-soft">
                          Sin resultados
                        </div>
                      )}
                      {filteredUsers.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => {
                            setSelectedUserId(u.id);
                            setUserDropdownOpen(false);
                            setUserSearch("");
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ca-bg-soft"
                          style={{
                            background: u.id === selectedUserId ? "rgba(94,23,235,0.06)" : undefined,
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-bold text-ca-ink">{u.full_name ?? u.email}</div>
                            <div className="text-[11px] text-ca-ink-soft">{u.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Role selector */}
            <div>
              <label className="mb-2 block font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                Rol en la cohorte
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

            {selectedRole === "teacher" && (
              <div>
                <label className="mb-1.5 block font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  Módulo asignado
                </label>
                {loadingModules ? (
                  <div className="flex items-center gap-2 rounded-xl border border-ca-ink/[0.14] bg-white px-4 py-2.5 text-[13px] text-ca-ink-soft">
                    Cargando módulos…
                  </div>
                ) : localModules.length > 0 ? (
                  <Select
                    value={selectedModuleId}
                    onChange={(e) => setSelectedModuleId(e.target.value)}
                  >
                    <option value="">Todos los módulos</option>
                    {localModules.map((m) => (
                      <option key={m.id} value={m.id}>
                        M{String(m.position).padStart(2, "0")} — {m.title}
                      </option>
                    ))}
                  </Select>
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
                  <strong>{existingInThisCohort.role === "student" ? "Alumno" : existingInThisCohort.role === "teacher" ? "Profesor" : "Ayudante"}</strong>{" "}
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
                  <strong>{existingInThisCohort.role === "student" ? "Alumno" : existingInThisCohort.role === "teacher" ? "Profesor" : "Ayudante"}</strong>{" "}
                  en esta cohorte.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-ca-ink/[0.08] px-6 py-4" style={{ background: "var(--color-ca-bg-soft)" }}>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleAssign}
            disabled={saving || !selectedUserId || !!hasSameRole}
          >
            {saving ? "Asignando…" : "Asignar"}
          </Button>
        </div>
    </Dialog>
  );
}
