"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

type ToastType = "success" | "error";

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
};

let nextId = 0;

function CheckIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

const STYLES: Record<ToastType, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
  success: {
    bg: "rgba(168,211,16,0.12)",
    border: "1px solid rgba(168,211,16,0.35)",
    color: "#3f5a05",
    icon: <CheckIcon />,
  },
  error: {
    bg: "rgba(225,29,72,0.10)",
    border: "1px solid rgba(225,29,72,0.30)",
    color: "#9f1b3e",
    icon: <AlertIcon />,
  },
};

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => {
        const s = STYLES[t.type];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2.5 rounded-full px-5 py-2.5 text-[13px] font-bold shadow-lg transition-all duration-300"
            style={{
              background: s.bg,
              border: s.border,
              color: s.color,
              opacity: t.exiting ? 0 : 1,
              transform: t.exiting ? "translateY(-8px)" : "translateY(0)",
            }}
          >
            {s.icon}
            {t.message}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type, exiting: false }]);

    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
      );
    }, 3700);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const Container = useCallback(
    () => <ToastContainer toasts={toasts} />,
    [toasts],
  );

  return { toast, ToastContainer: Container };
}
