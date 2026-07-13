"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Select } from "@/components/ui/field";

const TZ = "America/Santiago";
const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

// Ancho fijo del popover (misma técnica que NotificationBell: al conocer el
// ancho de antemano no hace falta medir el DOM para posicionarlo).
const POPOVER_WIDTH = 300;
const VIEWPORT_MARGIN = 16;

// Alto estimado del popover (no se mide el DOM por la misma razón que el
// ancho): calendario + cabecera ~340px; con selector de hora se suma la fila
// de hora/minuto (~56px). Se usa para decidir si el popover debe abrirse
// hacia arriba del trigger cuando no cabe hacia abajo.
const POPOVER_HEIGHT = 340;
const POPOVER_HEIGHT_WITH_TIME = 396;

export type DatePickerProps = {
  value: string; // "YYYY-MM-DDTHH:mm" (withTime) | "YYYY-MM-DD" | ""
  onChange: (value: string) => void; // emite el mismo formato naive
  withTime?: boolean;
  min?: string; // "YYYY-MM-DD"
  max?: string; // "YYYY-MM-DD"
  label?: string;
  error?: boolean | string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

type Parsed = { year: number; month: number; day: number; hour: number; minute: number };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Parsea el string naive `YYYY-MM-DD[THH:mm]` por split de strings. NUNCA
 * `new Date(value)`: eso aplicaría el offset de zona horaria del runtime y
 * corrompería el instante que el string representa.
 */
function parseValue(value: string): Parsed | null {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return null;
  let hour = 0;
  let minute = 0;
  if (timePart) {
    const [hh, mm] = timePart.split(":").map(Number);
    hour = Number.isFinite(hh) ? hh : 0;
    minute = Number.isFinite(mm) ? mm : 0;
  }
  return { year: y, month: m, day: d, hour, minute };
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Recompone el string naive con zero-pad manual. NUNCA `.toISOString()`: eso
 * volcaría el valor a UTC y corrompería el instante.
 */
function emitValue(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  withTime: boolean,
): string {
  const date = dayKey(year, month, day);
  return withTime ? `${date}T${pad(hour)}:${pad(minute)}` : date;
}

/**
 * Fecha construida SOLO para mostrarse en pantalla — nunca se usa para
 * parsear ni emitir el valor. Se arma con Date.UTC() y se formatea con
 * timeZone:"UTC" para reproducir exactamente los mismos dígitos año-mes-día-
 * hora-minuto del string naive, sin que ninguna conversión de zona los
 * desplace (mismo truco que `monthLabel()` en
 * components/classroom/month-calendar.tsx).
 */
function formatDisplay(p: Parsed, withTime: boolean): string {
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
  }).format(date);
}

/** "Julio de 2026" — capitalizado en JS (nunca `capitalize` de CSS). */
function monthLabel(year: number, month: number): string {
  const s = new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month, 15)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Día calendario (YYYY-MM-DD) de "ahora" en la zona de Santiago. */
function todayKeyNow(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const triggerBase =
  "w-full rounded-xl border border-ca-ink/[0.14] bg-ca-surface px-3.5 py-2.5 text-base md:text-sm text-ca-ink transition-colors focus-within:border-ca-violet focus-within:ring-2 focus-within:ring-ca-violet/20";

const triggerErrorClass = "border-destructive focus-within:border-destructive focus-within:ring-destructive/20";

export function DatePicker({
  value,
  onChange,
  withTime = false,
  min,
  max,
  label,
  error,
  id,
  disabled,
  placeholder = "Selecciona una fecha",
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  const parsed = parseValue(value);

  // Mes visible del calendario: 0-based (igual que month-calendar.tsx).
  const [view, setView] = useState(() => {
    if (parsed) return { year: parsed.year, month: parsed.month - 1 };
    // Solo se usa para sembrar el estado inicial; el popover está cerrado en
    // el primer render, así que esta lectura de "ahora" nunca se pinta en el
    // HTML del servidor (no hay riesgo de mismatch de hidratación).
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Al abrir (o si value cambia mientras está abierto), sincroniza el mes
  // visible con el valor actual.
  useEffect(() => {
    if (!open) return;
    const p = parseValue(value);
    if (p) setView({ year: p.year, month: p.month - 1 });
  }, [open, value]);

  useEffect(() => setMounted(true), []);

  // Posición del popover: `fixed` calculado desde el rect del trigger y
  // portaleado a document.body. Se elige portal + fixed (en vez de solo
  // fixed sin portal) porque es más robusto: un simple `position:fixed`
  // dentro del árbol del modal puede terminar clippeado igual si algún
  // ancestro tiene `transform`/`filter` (crea un containing block nuevo para
  // fixed) además de `overflow-hidden`. Portalear a document.body elimina
  // ese riesgo por completo, sea cual sea el modal donde se use.
  const updatePosition = useCallback(() => {
    const trigger = containerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const maxLeft = Math.max(window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN, VIEWPORT_MARGIN);
    const left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), maxLeft);

    const popoverHeight = withTime ? POPOVER_HEIGHT_WITH_TIME : POPOVER_HEIGHT;
    let top = rect.bottom + 8;
    if (top + popoverHeight > window.innerHeight - VIEWPORT_MARGIN) {
      // No cabe hacia abajo: lo abre hacia arriba del trigger.
      top = rect.top - popoverHeight - 8;
    }
    // Si tampoco cabe hacia arriba (trigger muy cerca del borde superior),
    // clampea a un mínimo cercano al borde del viewport.
    top = Math.max(top, 8);
    setCoords({ top, left });
  }, [withTime]);

  const toggleOpen = useCallback(() => {
    if (disabled) return;
    setOpen((prev) => {
      const next = !prev;
      if (next) updatePosition();
      return next;
    });
  }, [disabled, updatePosition]);

  // Cerrar con click fuera (trigger + popover portaleado) o Escape;
  // recalcular posición en scroll/resize.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      // Los Select de hora/minuto portalean su lista a document.body: un clic
      // ahí no es "fuera" del picker, es parte de la interacción de hora.
      if (target instanceof Element && target.closest("[data-select-popover]")) return;
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

  // Foco al abrir: día seleccionado (si existe) o primer elemento enfocable
  // del popover. Al cerrar, devuelve el foco al trigger. No usa
  // `useFocusTrap` porque ese hook espera el contenedor montado dentro del
  // árbol normal; aquí el popover vive en un portal a `document.body`.
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const popoverEl = popoverRef.current;
      if (!popoverEl) return;
      const selected = popoverEl.querySelector<HTMLElement>('[aria-selected="true"]');
      const focusable = popoverEl.querySelector<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (selected ?? focusable ?? popoverEl).focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerButtonRef.current?.focus();
    }
  }, [open]);

  const todayKey = todayKeyNow();

  const weeks = (() => {
    const { year, month } = view;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=dom
    const lead = (firstDow + 6) % 7; // lunes primero

    const cells: { key: string; day: number; inMonth: boolean }[] = [];

    const prevDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    for (let i = lead - 1; i >= 0; i--) {
      const d = prevDays - i;
      cells.push({ key: dayKey(prevYear, prevMonth + 1, d), day: d, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ key: dayKey(year, month + 1, d), day: d, inMonth: true });
    }
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    let d = 1;
    while (cells.length % 7 !== 0) {
      cells.push({ key: dayKey(nextYear, nextMonth + 1, d), day: d, inMonth: false });
      d++;
    }

    const rows: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  })();

  const go = (delta: number) => {
    setView((v) => {
      const m = v.month + delta;
      const year = v.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  };

  const goToday = () => {
    const [y, m] = todayKey.split("-").map(Number);
    setView({ year: y, month: m - 1 });
  };

  const isDayDisabled = (cellKey: string) => {
    if (min && cellKey < min) return true;
    if (max && cellKey > max) return true;
    return false;
  };

  const selectDay = (cellKey: string) => {
    if (isDayDisabled(cellKey)) return;
    const [y, m, d] = cellKey.split("-").map(Number);
    const hour = withTime ? parsed?.hour ?? 9 : 0;
    const minute = withTime ? parsed?.minute ?? 0 : 0;
    onChange(emitValue(y, m, d, hour, minute, withTime));
    if (!withTime) setOpen(false);
  };

  const updateTime = (hour: number, minute: number) => {
    if (!parsed) return;
    onChange(emitValue(parsed.year, parsed.month, parsed.day, hour, minute, true));
  };

  const hasError = Boolean(error);

  // Hoisteado fuera del `.map` de celdas: mismo mes/año para las 42 celdas
  // del calendario, evita instanciar 42 Intl.DateTimeFormat idénticos por
  // render.
  const currentMonthLabel = monthLabel(view.year, view.month);

  // El Select de minutos solo ofrece múltiplos de 5. Si el valor trae un
  // minuto legado (ej. `:23`, dato guardado antes con el input nativo), lo
  // inyecta como opción extra para este render en vez de redondearlo — el
  // dato guardado no se toca.
  const minuteOptions =
    parsed && parsed.minute % 5 !== 0
      ? [...MINUTES, parsed.minute].sort((a, b) => a - b)
      : MINUTES;

  const popover = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-label={label ? `Selector de fecha: ${label}` : "Selector de fecha"}
      tabIndex={-1}
      style={{
        position: "fixed",
        top: coords?.top ?? -9999,
        left: coords?.left ?? -9999,
        width: POPOVER_WIDTH,
        maxWidth: "calc(100vw - 2rem)",
      }}
      className="ca-card ca-scale-in z-50 overflow-hidden p-0 shadow-xl outline-none"
    >
      <div className="flex items-center justify-between gap-2 border-b border-ca-ink/[0.06] px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Mes anterior"
            className="grid h-8 w-8 place-items-center rounded-xl text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Mes siguiente"
            className="grid h-8 w-8 place-items-center rounded-xl text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <h3 className="ml-1 text-[13px] font-black tracking-tight text-ca-ink">
            {currentMonthLabel}
          </h3>
        </div>
        <button
          type="button"
          onClick={goToday}
          className="rounded-xl border border-ca-ink/[0.1] px-2.5 py-1 text-[11px] font-bold text-ca-ink-soft transition-colors hover:border-ca-violet hover:text-ca-violet"
        >
          Hoy
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-ca-ink/[0.06] bg-ca-bg-soft/40">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1.5 text-center text-[9px] font-bold uppercase tracking-[0.12em] text-ca-ink-soft">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 p-1.5">
        {weeks.flat().map((cell) => {
          const isToday = cell.key === todayKey;
          const isSelected = parsed !== null && cell.key === dayKey(parsed.year, parsed.month, parsed.day);
          const disabledDay = isDayDisabled(cell.key);

          return (
            <button
              key={cell.key}
              type="button"
              disabled={disabledDay}
              aria-selected={isSelected}
              aria-label={`${cell.day} de ${currentMonthLabel}`}
              onClick={() => selectDay(cell.key)}
              className={cn(
                "m-0.5 grid h-9 md:h-8 place-items-center rounded-full text-[12px] font-bold transition-colors",
                !cell.inMonth && "text-ca-ink-soft/50",
                cell.inMonth && !isSelected && "text-ca-ink hover:bg-ca-bg-soft",
                isSelected && "bg-ca-violet text-white",
                isToday && !isSelected && "ring-1 ring-ca-violet",
                disabledDay && "cursor-not-allowed opacity-30 hover:bg-transparent",
              )}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {withTime && (
        <div className="flex items-center justify-center gap-2 border-t border-ca-ink/[0.06] px-3 py-2.5">
          <Select
            aria-label="Hora"
            value={parsed ? pad(parsed.hour) : "09"}
            disabled={!parsed}
            onChange={(e) => updateTime(Number(e.target.value), parsed?.minute ?? 0)}
            className="w-auto py-1.5 text-[13px]"
          >
            {HOURS.map((h) => (
              <option key={h} value={pad(h)}>
                {pad(h)}
              </option>
            ))}
          </Select>
          <span className="text-ca-ink-soft">:</span>
          <Select
            aria-label="Minuto"
            value={parsed ? pad(parsed.minute) : "00"}
            disabled={!parsed}
            onChange={(e) => updateTime(parsed?.hour ?? 9, Number(e.target.value))}
            className="w-auto py-1.5 text-[13px]"
          >
            {minuteOptions.map((m) => (
              <option key={m} value={pad(m)}>
                {pad(m)}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-bold text-ca-ink">
          {label}
        </label>
      )}
      <div
        ref={containerRef}
        className={cn(
          triggerBase,
          "flex items-center justify-between gap-2",
          hasError && triggerErrorClass,
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <button
          ref={triggerButtonRef}
          type="button"
          id={id}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={toggleOpen}
          className="min-w-0 flex-1 truncate text-left outline-none"
        >
          <span className={cn(!parsed && "text-ca-ink-soft/60")}>
            {parsed ? formatDisplay(parsed, withTime) : placeholder}
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-1">
          {parsed && !disabled && (
            <button
              type="button"
              aria-label="Limpiar fecha"
              onClick={() => onChange("")}
              className="rounded-full p-0.5 text-ca-ink-soft transition-colors hover:bg-ca-ink/[0.06] hover:text-ca-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <Calendar className="h-4 w-4 pointer-events-none text-ca-ink-soft" />
        </span>
      </div>
      {typeof error === "string" && error && (
        <p className="mt-1 text-[12px] font-semibold text-destructive">{error}</p>
      )}
      {mounted && open && createPortal(popover, document.body)}
    </div>
  );
}
