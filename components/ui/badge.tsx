import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full font-semibold", {
  variants: {
    tone: {
      neutral: "bg-ca-ink/5 text-ca-ink-soft",
      violet: "bg-ca-violet/10 text-ca-violet-deep",
      lime: "bg-ca-lime-deep/[0.14] text-ca-lime-text",
      amber: "bg-ca-amber/15 text-ca-amber-text",
      rose: "bg-ca-rose/10 text-ca-rose-text",
      destructive: "bg-destructive/10 text-destructive",
    },
    size: {
      sm: "text-[10px] px-2 py-0.5",
      md: "text-[11px] px-2.5 py-1",
    },
  },
  defaultVariants: {
    tone: "neutral",
    size: "md",
  },
});

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Muestra un punto de color heredando `currentColor`, como en StatusPill. */
  dot?: boolean;
}

export function Badge({ className, tone, size, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot && <span className="shape-circle h-1.5 w-1.5 bg-current" />}
      {children}
    </span>
  );
}
