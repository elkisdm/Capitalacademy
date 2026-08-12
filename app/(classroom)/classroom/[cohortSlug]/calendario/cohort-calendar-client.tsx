"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BrandShapes, Avatar } from "@/components/classroom/primitives";
import { MonthCalendar } from "@/components/classroom/month-calendar";
import type { ScheduleSession, SessionTiming } from "@/lib/classroom/types";
import { TZ_SANTIAGO, dayKeyOf } from "@/lib/calendar/month-grid";

const TZ = TZ_SANTIAGO;

// `now` se inyecta para evitar mismatch de hidratación: en SSR / primer render
// (antes de montar) es `null` y todas las sesiones se tratan como "upcoming",
// un valor determinista e idéntico en servidor y cliente. Tras montar, un
// useEffect setea `now` y se recalcula el timing real.
function timingOf(s: ScheduleSession, now: number | null): SessionTiming {
  if (now === null) return "upcoming";
  const start = new Date(s.starts_at).getTime();
  const end = new Date(s.ends_at).getTime();
  if (now < start) return "upcoming";
  if (now > end) return "past";
  return "live";
}

function fmtMonthKey(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function fmtWeekday(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", { timeZone: TZ, weekday: "short" }).format(
    new Date(iso),
  );
}

function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", { timeZone: TZ, day: "2-digit" }).format(
    new Date(iso),
  );
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function fmtFullDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const TIMING_PILL: Record<SessionTiming, { label: string; cls: string }> = {
  live: { label: "En curso", cls: "bg-ca-lime text-ca-ink" },
  upcoming: { label: "Próxima", cls: "bg-ca-violet text-white" },
  past: { label: "Finalizada", cls: "bg-ca-bg-soft text-ca-ink-soft" },
};

function ResourceIcon({ type }: { type: string }) {
  if (type === "link") {
    return (
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
  }
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function ResourceLinks({ resources }: { resources: ScheduleSession["resources"] }) {
  if (resources.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ca-ink-soft">
        Material de la clase
      </span>
      <div className="flex flex-wrap gap-1.5">
        {resources.map((r) => (
          <a
            key={r.id}
            href={r.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={r.url ? undefined : true}
            className={`inline-flex items-center gap-1.5 rounded-lg bg-ca-bg-soft px-2.5 py-1 text-[11px] font-bold text-ca-ink transition-colors hover:bg-ca-violet/10 hover:text-ca-violet${r.url ? "" : " pointer-events-none opacity-60"}`}
          >
            <ResourceIcon type={r.type} />
            <span className="max-w-[180px] truncate">{r.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function SessionRow({
  s,
  now,
  cohortSlug,
}: {
  s: ScheduleSession;
  now: number | null;
  cohortSlug: string;
}) {
  const timing = timingOf(s, now);
  const isOnline = s.modality === "live_online";
  const isCancelled = s.status === "cancelled";
  const pill = TIMING_PILL[timing];
  // Una sesión cancelada no se "entra", aunque sea online futura con enlace vivo.
  const showJoin = isOnline && timing !== "past" && !!s.meeting_url && !isCancelled;

  return (
    <div
      className={`ca-card relative flex items-stretch gap-4 overflow-hidden p-4 md:p-5 ${
        timing === "past" || isCancelled ? "opacity-65" : ""
      }`}
    >
      {timing === "live" && (
        <span className="absolute left-0 top-0 h-full w-1 bg-ca-lime" />
      )}

      <div className="grid w-14 shrink-0 place-items-center self-center rounded-2xl bg-ca-bg-soft py-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
          {fmtWeekday(s.starts_at).replace(".", "")}
        </div>
        <div className="text-[22px] font-black leading-none text-ca-ink">
          {fmtDay(s.starts_at)}
        </div>
      </div>

      {/* Portada de la clase (0096). Se oculta bajo sm: en móvil la fila ya va
          apretada entre el día y el botón de entrar. Sin portada no se dibuja
          el recuadro: nada de marcos vacíos. */}
      {s.cover_image_url && (
        <div className="relative hidden h-16 w-28 shrink-0 self-center overflow-hidden rounded-xl bg-ca-bg-soft sm:block">
          <Image
            src={s.cover_image_url}
            alt=""
            fill
            sizes="112px"
            className="object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
              isOnline ? "bg-ca-violet/10 text-ca-violet" : "bg-ca-ink/[0.06] text-ca-ink"
            }`}
          >
            {isOnline ? "Online" : "Presencial"}
          </span>
          <span className="font-mono text-[11px] font-bold text-ca-ink-soft">
            {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}
          </span>
          {isCancelled ? (
            <span className="rounded-full bg-ca-amber/15 px-2 py-0.5 text-[10px] font-bold text-[#8b6914]">
              Cancelada
            </span>
          ) : (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pill.cls}`}>
              {pill.label}
            </span>
          )}
        </div>

        <h3
          title={s.title ?? "Sesión"}
          className={`truncate text-[16px] font-extrabold leading-tight tracking-tight text-ca-ink ${
            isCancelled ? "line-through" : ""
          }`}
        >
          {s.title ?? "Sesión"}
        </h3>

        {s.teacher && (
          <Link
            href={`/classroom/${cohortSlug}/docente/${s.teacher.slug ?? s.teacher.id}`}
            className="group flex w-fit items-center gap-2"
          >
            <Avatar
              initials={initialsOf(s.teacher.full_name)}
              avatarUrl={s.teacher.photo_url}
              size={22}
            />
            <span className="truncate text-[12px] font-semibold text-ca-ink-soft transition-colors group-hover:text-ca-violet">
              {s.teacher.full_name}
            </span>
          </Link>
        )}

        <ResourceLinks resources={s.resources} />

        {s.evaluation && !isCancelled && (
          <Link
            href={`/classroom/quiz/${s.evaluation.id}`}
            className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-ca-violet/10 px-3 py-1.5 text-[11px] font-bold text-ca-violet transition-colors hover:bg-ca-violet hover:text-white"
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Responder quiz
          </Link>
        )}
      </div>

      {showJoin && (
        <a
          href={s.meeting_url!}
          target="_blank"
          rel="noopener noreferrer"
          className="ca-btn-primary inline-flex items-center gap-2 self-center rounded-full px-4 py-2 text-[12px] font-bold uppercase tracking-[0.08em] text-white"
        >
          Entrar
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
      )}
    </div>
  );
}

type ViewMode = "list" | "month";

export function CohortCalendarClient({
  sessions,
  cohortName,
  cohortSlug,
}: {
  sessions: ScheduleSession[];
  cohortName: string;
  /** Se usa para enlazar el nombre del docente a su perfil (ADR-0028). */
  cohortSlug: string;
}) {
  const [view, setView] = useState<ViewMode>("month");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const dayDetailRef = useRef<HTMLElement>(null);

  // Se setea solo tras montar para que el timing real no cause mismatch SSR/cliente.
  // Patrón de montaje (leer la hora del cliente post-hidratación); el setState en
  // effect es intencional aquí.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
  }, []);

  // Trae a la vista el panel de detalle cuando el usuario selecciona un día.
  // No corre en el render inicial porque selectedDay arranca en null.
  useEffect(() => {
    if (selectedDay) {
      dayDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedDay]);

  const nextSession = useMemo(
    () => sessions.find((s) => timingOf(s, now) !== "past"),
    [sessions, now],
  );

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: ScheduleSession[] }[] = [];
    for (const s of sessions) {
      const key = fmtMonthKey(s.starts_at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(s);
      else out.push({ key, label: key, items: [s] });
    }
    return out;
  }, [sessions]);

  const selectedSessions = useMemo(
    () =>
      selectedDay
        ? sessions.filter((s) => dayKeyOf(s.starts_at) === selectedDay)
        : [],
    [sessions, selectedDay],
  );

  return (
    <div className="ca-fade-up mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 md:gap-8 md:px-8 md:py-8">
      {/* Header */}
      <section
        className="relative overflow-hidden text-white"
        style={{
          background:
            "linear-gradient(135deg, var(--color-ca-navy-ink) 0%, var(--color-ca-navy-deep) 70%, var(--color-ca-violet-deep) 100%)",
          borderRadius: 28,
        }}
      >
        <BrandShapes variant="hero" />
        <div className="relative px-5 py-6 md:px-10 md:py-9">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] backdrop-blur">
            <span className="shape-circle ca-pulse h-1.5 w-1.5 bg-ca-lime" />
            {cohortName}
          </div>
          <h1 className="text-[28px] font-black leading-tight tracking-[-0.03em] md:text-[40px]">
            Calendario de clases
          </h1>
          {nextSession ? (
            <p className="mt-3 text-[14px] font-semibold text-white/75">
              Próxima clase:{" "}
              <span className="text-white">{nextSession.title ?? "Sesión"}</span> ·{" "}
              {new Intl.DateTimeFormat("es-CL", {
                timeZone: TZ,
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(new Date(nextSession.starts_at))}{" "}
              · {fmtTime(nextSession.starts_at)} hrs
            </p>
          ) : (
            <p className="mt-3 text-[14px] font-semibold text-white/75">
              El diplomado ya finalizó. ¡Gracias por participar!
            </p>
          )}
        </div>
      </section>

      {/* Toggle Lista / Mes */}
      <div className="flex items-center gap-1 self-start rounded-2xl bg-ca-bg-soft p-1">
        <button
          onClick={() => setView("list")}
          className={`rounded-xl px-4 py-2 text-[13px] font-bold transition-colors ${
            view === "list" ? "bg-white text-ca-ink shadow-sm" : "text-ca-ink-soft hover:text-ca-ink"
          }`}
        >
          Lista
        </button>
        <button
          onClick={() => setView("month")}
          className={`rounded-xl px-4 py-2 text-[13px] font-bold transition-colors ${
            view === "month" ? "bg-white text-ca-ink shadow-sm" : "text-ca-ink-soft hover:text-ca-ink"
          }`}
        >
          Mes
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="ca-card grid place-items-center gap-2 p-12 text-center">
          <div className="text-[15px] font-bold text-ca-ink">
            Aún no hay clases publicadas
          </div>
          <p className="text-[13px] text-ca-ink-soft">
            Pronto verás aquí el calendario completo de tu generación.
          </p>
        </div>
      ) : view === "list" ? (
        groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-3">
            <h2 className="font-sans text-[11px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
              {g.label}
            </h2>
            <div className="flex flex-col gap-3">
              {g.items.map((s) => (
                <SessionRow key={s.id} s={s} now={now} cohortSlug={cohortSlug} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="flex flex-col gap-5">
          <MonthCalendar
            sessions={sessions}
            selectedDay={selectedDay}
            onDayClick={(key) => setSelectedDay(key)}
            onSessionClick={(s) => setSelectedDay(dayKeyOf(s.starts_at))}
          />

          {selectedDay && (
            <section ref={dayDetailRef} className="flex flex-col gap-3">
              <h2 className="font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                {fmtFullDay(selectedDay)}
              </h2>
              {selectedSessions.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {selectedSessions.map((s) => (
                    <SessionRow key={s.id} s={s} now={now} cohortSlug={cohortSlug} />
                  ))}
                </div>
              ) : (
                <div className="ca-card p-6 text-center text-[13px] text-ca-ink-soft">
                  No hay clases este día.
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
