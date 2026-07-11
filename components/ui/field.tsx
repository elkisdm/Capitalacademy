import {
  forwardRef,
  useMemo,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils/cn";
import { Select as SelectEngine, optionsFromChildren } from "@/components/ui/select";

const fieldBase =
  "w-full rounded-xl border border-ca-ink/[0.14] bg-ca-surface px-3.5 py-2.5 text-sm text-ca-ink placeholder:text-ca-ink-soft/60 transition-colors focus:border-ca-violet focus:outline-none focus:ring-2 focus:ring-ca-violet/20 disabled:cursor-not-allowed disabled:opacity-50";

const fieldErrorClass = "border-destructive focus:border-destructive focus:ring-destructive/20";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, error && fieldErrorClass, className)} {...props} />
  ),
);
Input.displayName = "Input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(fieldBase, "resize-y", error && fieldErrorClass, className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

/**
 * Adaptador drop-in sobre el motor `Select` de components/ui/select.tsx: los
 * 23 call-sites existentes lo usan como un `<select>` nativo (children
 * `<option>`, `value`/`defaultValue`, `onChange={(e) => e.target.value}`,
 * `required` para bloquear el submit). Este componente traduce esa API al
 * motor de menú propio sin tocar ningún call-site.
 *
 * - Los `<option>` hijos se parsean a `SelectOption[]` una sola vez (misma
 *   utilidad `optionsFromChildren` que usa el motor internamente).
 * - El `onChange` que reciben los call-sites es sintético: se les entrega un
 *   objeto con la forma `{ target: { value, name } }` casteado al tipo de
 *   `ChangeEvent<HTMLSelectElement>` — no existe un `<select>` real detrás.
 * - El motor ya renderiza su propio `<input type="hidden" name=...>` interno
 *   (así `new FormData(form)` sigue serializando el valor). `required` no
 *   puede vivir en ese input porque los inputs `type="hidden"` quedan
 *   excluidos de la constraint validation nativa (spec HTML) — por eso este
 *   adaptador agrega un segundo input, sin `name` (para no duplicar el valor
 *   en el FormData), solo para que el navegador bloquee el submit si no hay
 *   selección.
 * - Ese segundo input debe ser focuseable: la validación nativa del navegador
 *   (`An invalid form control is not focusable`) falla en silencio y NO
 *   bloquea el submit si el control inválido no se puede enfocar. Por eso el
 *   proxy usa tamaño real (`inset-0`/`h-full`/`w-full`) superpuesto al
 *   trigger visible en vez de un input de 0×0, y NO lleva `aria-hidden` ni
 *   `tabIndex={-1}` (ambos lo sacarían de la constraint validation / foco
 *   programático). `pointer-events-none` evita que intercepte clicks del
 *   trigger real; `opacity-0` lo mantiene invisible.
 */
export function Select({
  className,
  error,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  name,
  id,
  ...rest
}: SelectProps) {
  const options = useMemo(() => optionsFromChildren(children), [children]);

  const [internalValue, setInternalValue] = useState(
    (value as string | undefined) ?? (defaultValue as string | undefined) ?? "",
  );
  const currentValue = value !== undefined ? (value as string) : internalValue;

  function handleChange(next: string) {
    if (value === undefined) setInternalValue(next);
    onChange?.({ target: { value: next, name } } as unknown as ChangeEvent<HTMLSelectElement>);
  }

  return (
    <div className="relative">
      <SelectEngine
        id={id}
        name={name}
        value={currentValue}
        onChange={handleChange}
        options={options}
        disabled={disabled}
        error={error}
        aria-label={rest["aria-label"]}
        className={className}
      />
      {required && (
        <input
          required
          value={currentValue}
          onChange={() => {}}
          className="absolute inset-0 h-full w-full opacity-0 pointer-events-none"
        />
      )}
    </div>
  );
}
