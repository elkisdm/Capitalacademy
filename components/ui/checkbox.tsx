"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  indeterminate?: boolean;
  disabled?: boolean;
  label?: ReactNode;
  id?: string;
  "aria-label"?: string;
  className?: string;
};

export function Checkbox({
  checked,
  onChange,
  indeterminate,
  disabled,
  label,
  id,
  className,
  ...rest
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // El estado "indeterminate" no tiene atributo HTML — solo se puede
  // setear imperativamente sobre el nodo del input nativo.
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = Boolean(indeterminate) && !checked;
  }, [indeterminate, checked]);

  const ariaChecked = indeterminate && !checked ? "mixed" : checked;

  return (
    <label
      htmlFor={id}
      aria-disabled={disabled}
      className={cn(
        "inline-flex select-none items-center gap-2",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        aria-label={rest["aria-label"]}
        aria-checked={ariaChecked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border transition-colors",
          checked || indeterminate
            ? "border-ca-violet bg-ca-violet"
            : "border-ca-ink/[0.14] bg-ca-surface",
        )}
      >
        {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
        {!checked && indeterminate && <span className="h-[2px] w-2.5 rounded-full bg-white" />}
      </span>
      {label && <span className="text-sm text-ca-ink">{label}</span>}
    </label>
  );
}
