"use client";

import { useId } from "react";
import { Input } from "@/components/ui/field";
import { maskMonto } from "@/lib/utils/money";

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Sufijo visible dentro del campo, ej. "UF". Por defecto, pesos. */
  sufijo?: string;
  placeholder?: string;
  hint?: string;
  /**
   * Oculta la etiqueta visualmente (queda para lectores de pantalla). Para
   * filas numeradas donde el grupo ya tiene su etiqueta única.
   */
  labelOculta?: boolean;
};

/**
 * Input de monto con máscara de miles en vivo.
 *
 * Sigue `docs/ui-conventions.md` §2: `inputMode="numeric"` sin `type="number"`
 * (nada de spinners), máscara aplicada en el `onChange` y valor limpio —el
 * número— es lo que se persiste hacia arriba, nunca el string formateado.
 */
export function CampoMonto({
  label,
  value,
  onChange,
  sufijo,
  placeholder,
  hint,
  labelOculta = false,
}: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  const display = value === 0 ? "" : maskMonto(String(value)).display;

  return (
    <div>
      <label
        htmlFor={id}
        className={
          labelOculta
            ? "sr-only"
            : "mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-ca-ink-soft"
        }
      >
        {label}
      </label>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-ca-ink-soft/70 md:text-sm"
        >
          {sufijo ? "" : "$"}
        </span>
        <Input
          id={id}
          value={display}
          onChange={(e) => onChange(maskMonto(e.target.value).value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder ?? "0"}
          aria-describedby={hint ? hintId : undefined}
          className={sufijo ? "pr-12" : "pl-7"}
        />
        {sufijo && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-base font-semibold text-ca-ink-soft/70 md:text-sm"
          >
            {sufijo}
          </span>
        )}
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-ca-ink-soft">
          {hint}
        </p>
      )}
    </div>
  );
}
