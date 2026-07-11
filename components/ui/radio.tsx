"use client";

import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useId,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";

type RadioGroupContextValue = {
  value: string;
  onChange: (value: string) => void;
  name: string;
  groupHasSelection: boolean;
};

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export type RadioGroupProps = {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

export function RadioGroup({ value, onChange, name, children, className, ...rest }: RadioGroupProps) {
  const generatedName = useId();
  const groupHasSelection = Children.toArray(children).some(
    (child) => isValidElement(child) && (child.props as { value?: string }).value === value,
  );
  return (
    <RadioGroupContext.Provider value={{ value, onChange, name: name ?? generatedName, groupHasSelection }}>
      <div role="radiogroup" aria-label={rest["aria-label"]} className={className}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

export type RadioProps = {
  value: string;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
};

export function Radio({ value, disabled, children, className }: RadioProps) {
  const ctx = useContext(RadioGroupContext);
  if (!ctx) throw new Error("Radio debe usarse dentro de RadioGroup");

  const isSelected = ctx.value === value;

  function select() {
    if (disabled) return;
    ctx!.onChange(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      select();
      return;
    }
    const siblings = Array.from(
      (e.currentTarget.closest('[role="radiogroup"]') ?? undefined)?.querySelectorAll<HTMLElement>(
        '[role="radio"]:not([aria-disabled="true"])',
      ) ?? [],
    );
    if (siblings.length === 0) return;
    const currentIdx = siblings.indexOf(e.currentTarget);
    if (currentIdx === -1) return;

    let nextIdx: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIdx = (currentIdx + 1) % siblings.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIdx = (currentIdx - 1 + siblings.length) % siblings.length;
    }
    if (nextIdx === null) return;
    e.preventDefault();
    const nextEl = siblings[nextIdx];
    nextEl.focus();
    nextEl.click();
  }

  return (
    <div
      role="radio"
      aria-checked={isSelected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : isSelected || !ctx.groupHasSelection ? 0 : -1}
      onClick={select}
      onKeyDown={onKeyDown}
      className={cn(disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer", className)}
    >
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors",
            isSelected ? "border-ca-violet" : "border-ca-ink/[0.14]",
          )}
        >
          {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-ca-violet" />}
        </span>
        {children}
      </span>
    </div>
  );
}
