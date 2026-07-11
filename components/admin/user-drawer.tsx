"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/utils/use-focus-trap";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import type { PlatformRole } from "./user-primitives";

type UserData = {
  id?: string;
  full_name: string;
  email: string;
  phone: string;
  role: PlatformRole;
};

type CohortOption = {
  id: string;
  name: string;
  program_name: string;
  status: string;
};

type UserDrawerProps = {
  open: boolean;
  mode: "create" | "edit";
  user?: UserData | null;
  cohorts?: CohortOption[];
  onClose: () => void;
  onSave: () => void;
};

function CloseIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

const ROLE_OPTIONS: { value: PlatformRole; label: string }[] = [
  { value: "user", label: "Usuario" },
  { value: "ops", label: "Operaciones" },
  { value: "admin", label: "Administrador" },
];

export function UserDrawer({ open, mode, user, cohorts, onClose, onSave }: UserDrawerProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<PlatformRole>("user");
  const [sendInvite, setSendInvite] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      if (mode === "edit" && user) {
        setName(user.full_name);
        setEmail(user.email);
        setPhone(user.phone ?? "");
        setRole(user.role);
      } else {
        setName("");
        setEmail("");
        setPhone("");
        setRole("user");
        setSendInvite(true);
        setSelectedCohortId("");
      }
      setSaving(false);
      setError(null);
      setTimeout(() => nameRef.current?.focus(), 200);
    }
  }, [open, mode, user]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const isCreate = mode === "create";
      const url = isCreate
        ? "/api/admin/users"
        : `/api/admin/users/${user?.id}`;
      const method = isCreate ? "POST" : "PATCH";
      const body = isCreate
        ? {
            email: email.trim(),
            full_name: name.trim(),
            phone: phone.trim(),
            system_role: role,
            send_invite: sendInvite,
            cohort_id: selectedCohortId || undefined,
          }
        : {
            full_name: name.trim(),
            phone: phone.trim(),
            system_role: role,
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Error desconocido" }));
        const raw = data.error ?? "Error al guardar";
        const translated = raw.includes("already been registered")
          ? "Ya existe un usuario con este email"
          : raw.includes("duplicate")
            ? "Ya existe un usuario con este email"
            : raw;
        setError(translated);
        return;
      }

      onSave();
      onClose();
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || !open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] transition-opacity duration-200"
        style={{
          background: "rgba(15, 19, 64, 0.45)",
          backdropFilter: "blur(6px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-[480px] flex-col bg-white shadow-2xl transition-transform duration-200 ease-out"
        style={{
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ca-ink/[0.08] px-6 py-5">
          <div>
            <h2 className="text-[20px] font-black tracking-tight text-ca-ink">
              {mode === "create" ? "Nuevo usuario" : "Editar usuario"}
            </h2>
            <p className="mt-0.5 text-[12px] font-semibold text-ca-ink-soft">
              {mode === "create"
                ? "Completa los datos para crear la cuenta"
                : "Actualiza la información del usuario"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            aria-label="Cerrar"
            className="h-10 w-10 p-0"
          >
            <CloseIcon />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <form autoComplete="off">
            <div className="flex flex-col gap-5">
              {/* Name */}
              <div>
                <label className="mb-1.5 block font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  Nombre completo
                </label>
                <Input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: María González"
                  autoComplete="off"
                  name="ca-user-fullname"
                />
              </div>

              {/* Email */}
              <div>
                <label className="mb-1.5 block font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  Email
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                  autoComplete="off"
                  name="ca-user-email-address"
                  error={!!error}
                />
                {error && (
                  <p className="mt-1.5 text-[11px] font-semibold text-red-600">
                    {error}
                  </p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="mb-1.5 block font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  Teléfono
                </label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+56 9 1234 5678"
                  autoComplete="tel"
                  name="ca-user-phone-number"
                />
              </div>

              {/* Role */}
              <div>
                <label className="mb-1.5 block font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  Rol de sistema
                </label>
                <Select
                  value={role}
                  onChange={(e) => setRole(e.target.value as PlatformRole)}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </div>

              {/* Cohort selector — create only */}
              {mode === "create" && cohorts && cohorts.length > 0 && (
                <div>
                  <label className="mb-1.5 block font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                    Asignar a cohorte
                  </label>
                  <Select
                    value={selectedCohortId}
                    onChange={(e) => setSelectedCohortId(e.target.value)}
                  >
                    <option value="">Sin asignar (solo crear cuenta)</option>
                    {cohorts
                      .filter((c) => c.status === "active")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.program_name} — {c.name}
                        </option>
                      ))}
                  </Select>
                  <p className="mt-1 text-[11px] text-ca-ink-soft">
                    El usuario será asignado como alumno a esta cohorte
                  </p>
                </div>
              )}

              {/* Send invite email — create only */}
              {mode === "create" && (
                <div className="py-1">
                  <Checkbox
                    checked={sendInvite}
                    onChange={setSendInvite}
                    label={
                      <span className="text-[13px] font-semibold text-ca-ink">
                        Enviar email de invitación
                      </span>
                    }
                  />
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-ca-ink/[0.08] px-6 py-4" style={{ background: "var(--color-ca-bg-soft)" }}>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="lime"
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !email.trim()}
          >
            {saving
              ? "Guardando…"
              : mode === "create"
                ? "Crear usuario"
                : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}
