"use client";

import { useState, useEffect, useRef } from "react";
import type { PlatformRole } from "./user-primitives";

type UserPayload = {
  id?: string;
  full_name: string;
  email: string;
  phone: string;
  role: PlatformRole;
  password?: string;
  send_welcome_email?: boolean;
};

type UserDrawerProps = {
  open: boolean;
  mode: "create" | "edit";
  user?: UserPayload | null;
  onClose: () => void;
  onSave: (data: UserPayload) => void | Promise<void>;
  duplicateEmail?: string | null;
};

function generatePassword(length = 12): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => charset[b % charset.length]).join("");
}

function CloseIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" />
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

export function UserDrawer({ open, mode, user, onClose, onSave, duplicateEmail }: UserDrawerProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<PlatformRole>("user");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sendWelcome, setSendWelcome] = useState(true);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (mode === "edit" && user) {
        setName(user.full_name);
        setEmail(user.email);
        setPhone(user.phone ?? "");
        setRole(user.role);
        setPassword("");
      } else {
        setName("");
        setEmail("");
        setPhone("");
        setRole("user");
        setPassword("");
        setSendWelcome(true);
      }
      setShowPassword(false);
      setSaving(false);
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

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) return;
    setSaving(true);
    try {
      await onSave({
        id: user?.id,
        full_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role,
        ...(mode === "create" ? { password, send_welcome_email: sendWelcome } : {}),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{
          background: "rgba(15, 19, 64, 0.45)",
          backdropFilter: "blur(6px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out"
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
                className={`${INPUT_CLASS} ${duplicateEmail === email ? "border-red-500 focus:border-red-500" : ""}`}
              />
              {duplicateEmail === email && (
                <p className="mt-1.5 text-[11px] font-semibold text-red-600">
                  Ya existe un usuario con este email
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

            {/* Password — create only */}
            {mode === "create" && (
              <div>
                <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
                  Contraseña
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className={INPUT_CLASS}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ca-ink-soft transition-colors hover:text-ca-ink"
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPassword(generatePassword());
                      setShowPassword(true);
                    }}
                    className="shrink-0 rounded-xl border border-ca-ink/[0.14] px-4 py-2.5 text-[12px] font-bold text-ca-ink transition-colors hover:bg-ca-bg-soft"
                  >
                    Generar
                  </button>
                </div>
              </div>
            )}

            {/* Send welcome email — create only */}
            {mode === "create" && (
              <label className="flex items-center gap-3 py-1">
                <input
                  type="checkbox"
                  checked={sendWelcome}
                  onChange={(e) => setSendWelcome(e.target.checked)}
                  className="h-4 w-4 rounded border-ca-ink/[0.14] text-ca-violet accent-ca-violet"
                />
                <span className="text-[13px] font-semibold text-ca-ink">
                  Enviar email de bienvenida
                </span>
              </label>
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
    </>
  );
}
