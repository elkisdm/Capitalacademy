"use client";

import { useState, useEffect } from "react";
import { Avatar } from "@/components/classroom/primitives";

type DeactivateModalProps = {
  open: boolean;
  user: {
    id: string;
    full_name: string;
    email: string;
    initials: string;
    active_cohorts_count: number;
  } | null;
  onClose: () => void;
  onConfirm: (userId: string) => void | Promise<void>;
};

function AlertIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function DeactivateModal({ open, user, onClose, onConfirm }: DeactivateModalProps) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) setConfirming(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleConfirm = async () => {
    if (!user) return;
    setConfirming(true);
    try {
      await onConfirm(user.id);
    } finally {
      setConfirming(false);
    }
  };

  if (!open || !user) return null;

  return (
    <div
      className="ca-fade-up fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: "rgba(15, 19, 64, 0.45)", backdropFilter: "blur(6px)" }}
    >
      <div className="ca-card relative w-full max-w-[460px] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6">
          <div
            className="grid h-12 w-12 place-items-center rounded-full text-red-600"
            style={{ background: "rgba(225,29,72,0.10)" }}
          >
            <AlertIcon />
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-ca-bg-soft">
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 pt-4">
          <h2 className="text-[20px] font-black tracking-tight text-ca-ink">
            Desactivar usuario
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ca-ink-soft">
            Esta acción cerrará todas las sesiones activas del usuario e impedirá su acceso a la plataforma.
          </p>

          {/* User card */}
          <div
            className="mt-5 flex items-center gap-4 rounded-xl px-4 py-3.5"
            style={{ background: "var(--color-ca-bg-soft)" }}
          >
            <Avatar initials={user.initials} size={44} accent="bg-red-500" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-ca-ink">{user.full_name}</div>
              <div className="font-mono text-[11px] text-ca-ink-soft">{user.email}</div>
            </div>
          </div>

          {/* Consequences */}
          <div className="mt-5 flex flex-col gap-2.5">
            <div className="flex items-start gap-3">
              <span
                className="shape-circle mt-1 h-2 w-2 shrink-0"
                style={{ background: "#e11d48" }}
              />
              <span className="text-[12px] font-semibold leading-snug text-ca-ink-soft">
                Se cerrarán todas las sesiones activas de forma inmediata
              </span>
            </div>
            {user.active_cohorts_count > 0 && (
              <div className="flex items-start gap-3">
                <span
                  className="shape-circle mt-1 h-2 w-2 shrink-0"
                  style={{ background: "#e11d48" }}
                />
                <span className="text-[12px] font-semibold leading-snug text-ca-ink-soft">
                  Se suspenderá su participación en{" "}
                  <strong className="text-ca-ink">
                    {user.active_cohorts_count} cohorte{user.active_cohorts_count > 1 ? "s" : ""} activa{user.active_cohorts_count > 1 ? "s" : ""}
                  </strong>
                </span>
              </div>
            )}
            <div className="flex items-start gap-3">
              <span
                className="shape-circle mt-1 h-2 w-2 shrink-0"
                style={{ background: "#e11d48" }}
              />
              <span className="text-[12px] font-semibold leading-snug text-ca-ink-soft">
                El usuario no podrá iniciar sesión hasta que sea reactivado
              </span>
            </div>
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
            onClick={handleConfirm}
            disabled={confirming}
            className="rounded-full px-6 py-2.5 text-[13px] font-bold text-white transition-all disabled:opacity-50"
            style={{
              background: "#e11d48",
              boxShadow: "0 4px 12px rgba(225,29,72,0.25)",
            }}
          >
            {confirming ? "Desactivando..." : "Desactivar"}
          </button>
        </div>
      </div>
    </div>
  );
}
