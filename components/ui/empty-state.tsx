import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("ca-card flex flex-col items-center justify-center p-16 text-center", className)}>
      {Icon && <Icon className="h-10 w-10 text-ca-ink-soft/40" />}
      <p className="mt-3 text-[14px] font-bold text-ca-ink">{title}</p>
      {description && <p className="mt-1 text-[13px] text-ca-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
