"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/utils/use-focus-trap";
import type { PlatformRole } from "./user-primitives";

type UserData = {
  id?: string;
  full_name: string;
  email: string;
  phone: string;
  role: PlatformRole;
};

type UserDrawerProps = {
  open: boolean;
  mode: "create" | "edit";
  user?: UserData | null;
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

const INPUT_CLASS =
  "w-full rounded-xl border border-ca-ink/[0.14] bg-white px-4 py-2.5 text-[13px] font-medium text-ca-ink outline-none transition-colors focus:border-ca-violet";

export function UserDrawer({ open, mode, user, onClose, onSave }: UserDrawerProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<PlatformRole>("user");
  const [sendInvite, setSendInvite] = useState(true);
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
          <button
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-ca-bg-soft"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <form autoComplete="off">
            <div className="flex flex-col gap-5">
              {/* Name */}
              <div>
                <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  Nombre completo
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: María González"
                  autoComplete="off"
                  name="ca-user-fullname"
                  className={INPUT_CLASS}
                />
              </div>

              {/* Email */}
              <div>
                <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                  autoComplete="off"
                  name="ca-user-email-address"
                  className={`${INPUT_CLASS} ${error ? "border-red-500 focus:border-red-500" : ""}`}
                />
                {error && (
                  <p className="mt-1.5 text-[11px] font-semibold text-red-600">
                    {error}
                  </p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+56 9 1234 5678"
                  autoComplete="tel"
                  name="ca-user-phone-number"
                  className={INPUT_CLASS}
                />
              </div>

              {/* Role */}
              <div>
                <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  Rol de sistema
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as PlatformRole)}
                  className={INPUT_CLASS}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Send invite email — create only */}
              {mode === "create" && (
                <label className="flex items-center gap-3 py-1">
                  <input
                    type="checkbox"
                    checked={sendInvite}
                    onChange={(e) => setSendInvite(e.target.checked)}
                    className="h-4 w-4 rounded border-ca-ink/[0.14] text-ca-violet accent-ca-violet"
                  />
                  <span className="text-[13px] font-semibold text-ca-ink">
                    Enviar email de invitación
                  </span>
                </label>
              )}
            </div>
          </form>
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
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !email.trim()}
            className="ca-btn-primary px-6 py-2.5 text-[13px] font-bold disabled:opacity-50"
          >
            {saving
              ? "Guardando..."
              : mode === "create"
                ? "Crear usuario"
                : "Guardar cambios"}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
