"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

type ToastVariant = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
  exiting: boolean;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border-ca-lime-deep/35 bg-ca-lime-deep/[0.12] text-ca-lime-text",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-ca-violet/30 bg-ca-violet/10 text-ca-violet-deep",
};

/**
 * Provider global de toasts (success/error/info) con acción opcional.
 * No reemplaza `components/admin/toast.tsx` (hook por componente) — esa
 * migración de callers es un paso posterior.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "info", action?: ToastAction) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant, action, exiting: false }]);

      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      }, 3700);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {mounted &&
        toasts.length > 0 &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="pointer-events-none fixed top-6 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2"
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "pointer-events-auto flex items-center gap-3 rounded-full border px-5 py-2.5 text-[13px] font-bold shadow-lg transition-all duration-300",
                  VARIANT_STYLES[t.variant],
                  t.exiting ? "-translate-y-2 opacity-0" : "translate-y-0 opacity-100",
                )}
              >
                {t.message}
                {t.action && (
                  <button onClick={t.action.onClick} className="font-black underline underline-offset-2">
                    {t.action.label}
                  </button>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
