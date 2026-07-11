"use client";

import { useEffect, useState, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { useFocusTrap } from "@/lib/utils/use-focus-trap";

export interface DialogProps
  extends Pick<HTMLAttributes<HTMLDivElement>, "aria-label" | "aria-labelledby" | "aria-describedby"> {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Overlay + panel con foco atrapado (useFocusTrap), cierre con Escape o click
 * en el overlay, y animación de entrada/salida vía `ca-scale-in`/`ca-scale-out`.
 * La salida real (llamada a onClose) ocurre en onAnimationEnd, no antes.
 */
export function Dialog({ open, onClose, children, className, ...aria }: DialogProps) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const containerRef = useFocusTrap(open && !closing);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) setClosing(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={() => setClosing(true)}
        className={cn(
          "absolute inset-0 bg-ca-ink/40 transition-opacity duration-200",
          closing ? "opacity-0" : "opacity-100",
        )}
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        {...aria}
        className={cn(
          "ca-card relative max-h-[85dvh] w-full max-w-md overflow-y-auto p-6",
          closing ? "ca-scale-out" : "ca-scale-in",
          className,
        )}
        onAnimationEnd={() => {
          if (closing) onClose();
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
