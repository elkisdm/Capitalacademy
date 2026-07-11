"use client";

import { useMemo, useState } from "react";

const TZ = "America/Santiago";

// Forma mínima que la grilla necesita de cada sesión. El padre puede pasar un
// tipo más rico (ScheduleSession, ClassSession) y lo recibe de vuelta intacto
// en los callbacks gracias al genérico T.
export type CalendarEvent = {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  modality: string;
};

type MonthCalendarProps<T extends CalendarEvent> = {
  sessions: T[];
  timeZone?: string;
  /** Día (YYYY-MM-DD en TZ Santiago) a resaltar como seleccionado. */
  selectedDay?: string | null;
  /** Click en una celda de día (área libre): entrega el día y sus sesiones. */
  onDayClick?: (dayKey: string, daySessions: T[]) => void;
  /** Click en una sesión concreta dentro de un día. */
  onSessionClick?: (session: T) => void;
};

const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Día calendario (YYYY-MM-DD) de un instante, en la zona de Santiago. */
function dayKeyOf(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function timeLabel(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Etiqueta "Junio de 2026" sin que la TZ desplace el mes (se formatea en UTC). */
function monthLabel(year: number, month: number): string {
  const s = new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month, 15)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isOnline(modality: string): boolean {
  return modality === "live_online";
}

export function MonthCalendar<T extends CalendarEvent>({
  sessions,
  timeZone = TZ,
  selectedDay,
  onDayClick,
  onSessionClick,
}: MonthCalendarProps<T>) {
  // Hoy (en Santiago) y agrupación de sesiones por día calendario.
  const todayKey = useMemo(
    () => dayKeyOf(new Date().toISOString(), timeZone),
    [timeZone],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const s of sessions) {
      const key = dayKeyOf(s.starts_at, timeZone);
      const arr = map.get(key);
      if (arr) arr.push(s);
      else map.set(key, [s]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    return map;
  }, [sessions, timeZone]);

  // Mes inicial: el de la próxima sesión no terminada; si todas pasaron, el de
  // la última; si no hay sesiones, el mes actual.
  const initial = useMemo(() => {
    const now = new Date().getTime();
    const upcoming = sessions
      .filter((s) => new Date(s.ends_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
    const ref = upcoming ?? sessions[sessions.length - 1];
    const key = ref ? dayKeyOf(ref.starts_at, timeZone) : todayKey;
    const [y, m] = key.split("-").map(Number);
    return { year: y, month: m - 1 };
  }, [sessions, timeZone, todayKey]);

  const [view, setView] = useState(initial);

  const weeks = useMemo(() => {
    const { year, month } = view;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=dom
    const lead = (firstDow + 6) % 7; // lunes primero

    const cells: { key: string; day: number; inMonth: boolean }[] = [];

    // Relleno del mes anterior.
    const prevDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    for (let i = lead - 1; i >= 0; i--) {
      const d = prevDays - i;
      cells.push({
        key: `${prevYear}-${pad(prevMonth + 1)}-${pad(d)}`,
        day: d,
        inMonth: false,
      });
    }
    // Días del mes.
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ key: `${year}-${pad(month + 1)}-${pad(d)}`, day: d, inMonth: true });
    }
    // Relleno del mes siguiente hasta completar la última semana.
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    let d = 1;
    while (cells.length % 7 !== 0) {
      cells.push({
        key: `${nextYear}-${pad(nextMonth + 1)}-${pad(d)}`,
        day: d,
        inMonth: false,
      });
      d++;
    }

    const rows: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [view]);

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

  return (
    <div className="ca-card overflow-hidden">
      {/* Header de navegación */}
      <div className="flex items-center justify-between gap-2 border-b border-ca-ink/[0.06] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => go(-1)}
            aria-label="Mes anterior"
            className="grid h-9 w-9 place-items-center rounded-xl text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            onClick={() => go(1)}
            aria-label="Mes siguiente"
            className="grid h-9 w-9 place-items-center rounded-xl text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <h3 className="ml-1 text-[15px] font-black tracking-tight text-ca-ink md:text-[17px]">
            {monthLabel(view.year, view.month)}
          </h3>
        </div>
        <button
          onClick={goToday}
          className="rounded-xl border border-ca-ink/[0.1] px-3 py-1.5 text-[12px] font-bold text-ca-ink-soft transition-colors hover:border-ca-violet hover:text-ca-violet"
        >
          Hoy
        </button>
      </div>

      {/* Encabezado de días */}
      <div className="grid grid-cols-7 border-b border-ca-ink/[0.06] bg-ca-bg-soft/40">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="py-2 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-ca-ink-soft"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Celdas */}
      <div className="grid grid-cols-7">
        {weeks.flat().map((cell) => {
          const daySessions = cell.inMonth ? byDay.get(cell.key) ?? [] : [];
          const isToday = cell.key === todayKey;
          const isSelected = selectedDay === cell.key;
          const hasSessions = daySessions.length > 0;
          const dayAriaLabel =
            daySessions.length === 0
              ? `${cell.day}`
              : `${cell.day}, ${daySessions.length} ${
                  daySessions.length === 1 ? "clase" : "clases"
                }`;

          return (
            <div
              key={cell.key}
              role="gridcell"
              className={`group relative flex min-h-[60px] flex-col gap-1 border-b border-r border-ca-ink/[0.05] p-1.5 transition-colors md:min-h-[86px] ${
                !cell.inMonth
                  ? "bg-ca-bg-soft/30"
                  : hasSessions
                    ? "bg-ca-violet/[0.04]"
                    : "bg-white"
              } ${isSelected ? "ring-2 ring-inset ring-ca-violet" : ""}`}
            >
              {/* Botón de fondo: cubre toda la celda y dispara onDayClick. Queda
                  detrás (z-0) para que los chips reciban su propio click. */}
              <button
                type="button"
                onClick={() => onDayClick?.(cell.key, daySessions)}
                aria-label={dayAriaLabel}
                className={`absolute inset-0 z-0 rounded-none transition-colors ${
                  cell.inMonth ? "hover:bg-ca-bg-soft/50" : ""
                }`}
              />

              <span
                className={`pointer-events-none relative z-10 grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${
                  isToday
                    ? "bg-ca-violet text-white"
                    : cell.inMonth
                      ? "text-ca-ink"
                      : "text-ca-ink-soft/50"
                }`}
              >
                {cell.day}
              </span>

              {/* >=sm: chips con hora + título, por encima del botón de fondo. */}
              {hasSessions && (
                <div className="pointer-events-none relative z-10 hidden flex-1 flex-col gap-1 overflow-hidden sm:flex">
                  {daySessions.slice(0, 2).map((s) => {
                    const online = isOnline(s.modality);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onSessionClick?.(s)}
                        title={s.title ?? "Sesión"}
                        className={`pointer-events-auto flex items-start gap-1 rounded-md px-1.5 py-0.5 text-left text-[10px] font-bold leading-tight transition-opacity hover:opacity-80 ${
                          online
                            ? "bg-ca-violet/10 text-ca-violet"
                            : "bg-ca-ink/[0.06] text-ca-ink"
                        }`}
                      >
                        <span className="shrink-0 font-mono text-[9px] opacity-70">
                          {timeLabel(s.starts_at, timeZone)}
                        </span>
                        <span className="line-clamp-2 min-w-0 flex-1 break-words">
                          {s.title ?? "Sesión"}
                        </span>
                      </button>
                    );
                  })}
                  {daySessions.length > 2 && (
                    <span className="px-1 text-[10px] font-bold text-ca-ink-soft">
                      +{daySessions.length - 2} más
                    </span>
                  )}
                </div>
              )}

              {/* <sm: solo un punto indicador; el alumno toca el día para ver detalle. */}
              {hasSessions && (
                <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 h-1.5 w-1.5 rounded-full bg-ca-lime sm:hidden" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
