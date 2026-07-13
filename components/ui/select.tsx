"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type SelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export type SelectProps = {
  value?: string;
  defaultValue?: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  children?: ReactNode;
  name?: string;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  error?: boolean | string;
  id?: string;
  "aria-label"?: string;
  className?: string;
};

const VIEWPORT_MARGIN = 16;
// Tope superior del alto del popover (= max-h-72 del listado). El alto real
// aplicado es min(POPOVER_MAX_HEIGHT, espacio disponible), nunca un valor
// inflado — así el listado (que ya hace scroll interno) prefiere abrirse
// abajo con scroll antes que voltear y tapar contenido de arriba.
const POPOVER_MAX_HEIGHT = 288;
// Alto mínimo "usable" abajo del trigger para no voltear el popover hacia
// arriba aunque no quepan los 288px completos (mismo criterio de flip que
// date-picker.tsx, pero acotando el alto al espacio real en vez de asumir
// siempre POPOVER_MAX_HEIGHT).
const MIN_USABLE_HEIGHT = 180;
const TYPEAHEAD_RESET_MS = 350;

// Misma base visual que triggerBase en date-picker.tsx: el borde/fondo/padding
// viven en el contenedor (aquí, containerRef), no en el botón interno.
const triggerBase =
  "w-full rounded-xl border border-ca-ink/[0.14] bg-ca-surface px-3.5 py-2.5 text-base md:text-sm text-ca-ink transition-colors focus-within:border-ca-violet focus-within:ring-2 focus-within:ring-ca-violet/20";

const triggerErrorClass = "border-destructive focus-within:border-destructive focus-within:ring-destructive/20";

/**
 * Extrae `SelectOption[]` de hijos `<option>` (mismo shape que el `<select>` nativo).
 * Reconoce `<option>` directos y `<optgroup>` (aplanando sus `<option>` hijos).
 * No reconoce fragmentos (`<>...</>`) ni cualquier otro wrapper alrededor de las
 * opciones — como este componente es un drop-in de `<select>`, alguien intentará
 * envolver opciones condicionalmente en un fragmento; si eso pasa, las opciones
 * no aparecerán.
 */
export function optionsFromChildren(children: ReactNode): SelectOption[] {
  const result: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "optgroup") {
      const groupProps = child.props as { children?: ReactNode };
      result.push(...optionsFromChildren(groupProps.children));
      return;
    }
    if (child.type !== "option") return;
    const props = child.props as { value?: string; children?: ReactNode; disabled?: boolean };
    result.push({
      value: String(props.value ?? ""),
      label: props.children,
      disabled: props.disabled,
    });
  });
  return result;
}

function labelToText(label: ReactNode): string {
  return typeof label === "string" || typeof label === "number" ? String(label) : "";
}

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}

export function Select({
  value,
  defaultValue,
  onChange,
  options,
  children,
  name,
  placeholder = "Selecciona una opción",
  searchable,
  disabled,
  error,
  id,
  className,
  ...rest
}: SelectProps) {
  const ariaLabel = rest["aria-label"];
  const allOptions = useMemo(() => options ?? optionsFromChildren(children), [options, children]);

  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const currentValue = value !== undefined ? value : internalValue;

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null,
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const typeaheadRef = useRef({ buffer: "", timeout: null as ReturnType<typeof setTimeout> | null });

  const generatedId = useId();
  const baseId = id ?? generatedId;
  const listboxId = `${baseId}-listbox`;
  const optionId = (idx: number) => `${baseId}-option-${idx}`;

  const isSearchable = Boolean(searchable) || allOptions.length > 8;

  const filteredOptions = useMemo(() => {
    if (!isSearchable || !query.trim()) return allOptions;
    const q = query.trim().toLowerCase();
    return allOptions.filter((o) => labelToText(o.label).toLowerCase().includes(q));
  }, [allOptions, isSearchable, query]);

  const selectedOption = allOptions.find((o) => o.value === currentValue) ?? null;

  const updatePosition = useCallback(() => {
    const trigger = containerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = rect.width;
    const maxLeft = Math.max(window.innerWidth - width - VIEWPORT_MARGIN, VIEWPORT_MARGIN);
    const left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), maxLeft);

    // Espacio real disponible abajo/arriba del trigger. Abre hacia abajo
    // siempre que haya espacio razonable ahí (o más que arriba); solo voltea
    // hacia arriba cuando abajo es claramente insuficiente Y arriba hay más
    // espacio.
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;

    let top: number;
    let maxHeight: number;
    if (spaceBelow >= MIN_USABLE_HEIGHT || spaceBelow >= spaceAbove) {
      top = rect.bottom + 4;
      maxHeight = Math.min(POPOVER_MAX_HEIGHT, spaceBelow);
    } else {
      maxHeight = Math.min(POPOVER_MAX_HEIGHT, spaceAbove);
      top = rect.top - maxHeight - 4;
    }
    top = Math.max(top, VIEWPORT_MARGIN);
    setCoords({ top, left, width, maxHeight });
  }, []);

  const openList = useCallback(() => {
    if (disabled) return;
    updatePosition();
    setQuery("");
    const selectedIdx = allOptions.findIndex((o) => o.value === currentValue);
    setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
    setOpen(true);
  }, [disabled, updatePosition, allOptions, currentValue]);

  const toggleOpen = useCallback(() => {
    if (disabled) return;
    if (open) setOpen(false);
    else openList();
  }, [disabled, open, openList]);

  const commitValue = useCallback(
    (next: string) => {
      if (value === undefined) setInternalValue(next);
      onChange(next);
      setOpen(false);
    },
    [value, onChange],
  );

  useEffect(() => setMounted(true), []);

  // Cerrar con click fuera (trigger + popover portaleado) o Escape;
  // recalcular posición en scroll/resize.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReflow() {
      updatePosition();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, updatePosition]);

  // Foco al abrir: input de búsqueda (si searchable) o el popover (para que
  // ↑/↓ funcionen de inmediato). Al cerrar, devuelve el foco al trigger.
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      if (isSearchable) searchInputRef.current?.focus();
      else popoverRef.current?.focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerButtonRef.current?.focus();
    }
  }, [open, isSearchable]);

  // Mantiene la opción activa visible dentro del listado con scroll.
  useEffect(() => {
    if (!open) return;
    popoverRef.current?.querySelector(`#${CSS.escape(optionId(activeIndex))}`)?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

  const moveActive = useCallback(
    (delta: number) => {
      setActiveIndex((prev) => {
        const len = filteredOptions.length;
        if (len === 0) return prev;
        let next = prev;
        for (let i = 0; i < len; i++) {
          next = (next + delta + len) % len;
          if (!filteredOptions[next]?.disabled) return next;
        }
        return prev;
      });
    },
    [filteredOptions],
  );

  const selectActive = useCallback(() => {
    const opt = filteredOptions[activeIndex];
    if (!opt || opt.disabled) return;
    commitValue(opt.value);
  }, [filteredOptions, activeIndex, commitValue]);

  const handleTypeahead = useCallback(
    (key: string) => {
      const buf = typeaheadRef.current;
      if (buf.timeout) clearTimeout(buf.timeout);
      buf.buffer += key.toLowerCase();
      buf.timeout = setTimeout(() => {
        buf.buffer = "";
      }, TYPEAHEAD_RESET_MS);
      const idx = allOptions.findIndex(
        (o) => !o.disabled && labelToText(o.label).toLowerCase().startsWith(buf.buffer),
      );
      if (idx >= 0) {
        const filteredIdx = filteredOptions.findIndex((o) => o.value === allOptions[idx].value);
        if (filteredIdx >= 0) setActiveIndex(filteredIdx);
      }
    },
    [allOptions, filteredOptions],
  );

  const onPopoverKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        break;
      case "Home": {
        e.preventDefault();
        const firstEnabled = filteredOptions.findIndex((o) => !o.disabled);
        if (firstEnabled >= 0) setActiveIndex(firstEnabled);
        break;
      }
      case "End": {
        e.preventDefault();
        const lastEnabled = findLastIndex(filteredOptions, (o) => !o.disabled);
        if (lastEnabled >= 0) setActiveIndex(lastEnabled);
        break;
      }
      case "Enter":
        e.preventDefault();
        selectActive();
        break;
      case " ":
        if (!isSearchable) {
          e.preventDefault();
          selectActive();
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      default:
        if (!isSearchable && e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey) {
          handleTypeahead(e.key);
        }
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
      case "Enter":
      case " ":
        e.preventDefault();
        openList();
        break;
      default:
        break;
    }
  };

  const hasError = Boolean(error);

  const popover = (
    <div
      ref={popoverRef}
      data-select-popover=""
      tabIndex={-1}
      onKeyDown={onPopoverKeyDown}
      aria-activedescendant={!isSearchable ? optionId(activeIndex) : undefined}
      style={{
        position: "fixed",
        top: coords?.top ?? -9999,
        left: coords?.left ?? -9999,
        width: coords?.width,
        maxWidth: "calc(100vw - 2rem)",
      }}
      className="ca-card ca-scale-in z-50 overflow-hidden p-0 shadow-xl outline-none"
    >
      {isSearchable && (
        <div className="border-b border-ca-ink/[0.06] p-1.5">
          <input
            ref={searchInputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={optionId(activeIndex)}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Buscar..."
            aria-label="Buscar opción"
            className="w-full rounded-lg border border-transparent bg-ca-bg-soft px-2.5 py-1.5 text-base md:text-sm text-ca-ink outline-none focus:border-ca-violet"
          />
        </div>
      )}
      <ul
        id={listboxId}
        role="listbox"
        style={{ maxHeight: coords?.maxHeight ?? POPOVER_MAX_HEIGHT }}
        className="overflow-y-auto p-1.5"
      >
        {filteredOptions.length === 0 && (
          <li className="px-2.5 py-2 text-sm text-ca-ink-soft">Sin resultados</li>
        )}
        {filteredOptions.map((opt, idx) => {
          const isSelected = opt.value === currentValue;
          const isActive = idx === activeIndex;
          return (
            <li
              key={opt.value}
              id={optionId(idx)}
              role="option"
              aria-selected={isSelected}
              aria-disabled={opt.disabled}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => !opt.disabled && commitValue(opt.value)}
              className={cn(
                "cursor-pointer rounded-lg px-2.5 py-2.5 md:py-2 text-sm font-medium transition-colors",
                isSelected && "bg-ca-violet/10 text-ca-violet",
                !isSelected && isActive && "bg-ca-ink/[0.04] text-ca-ink",
                !isSelected && !isActive && "text-ca-ink",
                opt.disabled && "cursor-not-allowed opacity-40",
              )}
            >
              {opt.label}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          triggerBase,
          hasError && triggerErrorClass,
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <button
          ref={triggerButtonRef}
          type="button"
          id={id}
          disabled={disabled}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-invalid={hasError}
          aria-label={ariaLabel}
          onClick={toggleOpen}
          onKeyDown={onTriggerKeyDown}
          className="flex w-full items-center justify-between gap-2 outline-none disabled:cursor-not-allowed"
        >
          <span className={cn("min-w-0 flex-1 truncate text-left", !selectedOption && "text-ca-ink-soft/60")}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ca-ink-soft" />
        </button>
      </div>
      {name && <input type="hidden" name={name} value={currentValue} />}
      {typeof error === "string" && error && (
        <p className="mt-1 text-[12px] font-semibold text-destructive">{error}</p>
      )}
      {mounted && open && createPortal(popover, document.body)}
    </>
  );
}
