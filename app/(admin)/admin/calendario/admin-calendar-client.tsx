"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MonthCalendar } from "@/components/classroom/month-calendar";

const TZ = "America/Santiago";

function dayKeyOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
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

export type AdminCalendarSession = {
  id: string;
  cohort_id: string;
  cohort_name: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  modality: string;
  status: string;
  teacher_name: string | null;
};

export function AdminCalendarClient({
  sessions,
  programName,
  multiCohort,
}: {
  sessions: AdminCalendarSession[];
  programName: string;
  multiCohort: boolean;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const router = useRouter();

  function goToSession(s: AdminCalendarSession) {
    router.push(`/admin/cohorts/${s.cohort_id}/sesiones?session=${s.id}`);
  }

  const selectedSessions = useMemo(
    () => (selectedDay ? sessions.filter((s) => dayKeyOf(s.starts_at) === selectedDay) : []),
    [sessions, selectedDay],
  );

  return (
    <div className="ca-fade-up mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <div>
        <h1 className="text-[34px] font-black tracking-[-0.025em] text-ca-ink">Calendario</h1>
        <p className="mt-1 text-ca-ink-soft">{programName}</p>
      </div>

      {sessions.length === 0 ? (
        <div className="ca-card grid place-items-center gap-2 p-12 text-center">
          <div className="text-[15px] font-bold text-ca-ink">Sin clases programadas</div>
          <p className="text-[13px] text-ca-ink-soft">
            Este entorno todavía no tiene sesiones en el calendario.
          </p>
        </div>
      ) : (
        <>
          <MonthCalendar
            sessions={sessions}
            selectedDay={selectedDay}
            onDayClick={(key) => setSelectedDay(key)}
            onSessionClick={goToSession}
          />

          {selectedDay && (
            <section className="flex flex-col gap-3">
              <h2 className="font-mono text-[11px] font-bold uppercase capitalize tracking-[0.18em] text-ca-ink-soft">
                {fmtFullDay(selectedDay)}
              </h2>
              {selectedSessions.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {selectedSessions.map((s) => {
                    const isOnline = s.modality === "live_online";
                    const isCancelled = s.status === "cancelled";
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => goToSession(s)}
                        className={`ca-card flex w-full flex-wrap items-center gap-2 p-4 text-left transition-colors hover:bg-ca-bg-soft ${
                          isCancelled ? "opacity-65" : ""
                        }`}
                      >
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                            isOnline ? "bg-ca-violet/10 text-ca-violet" : "bg-ca-ink/[0.06] text-ca-ink"
                          }`}
                        >
                          {isOnline ? "Online" : "Presencial"}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-ca-ink-soft">
                          {fmtTime(s.starts_at)}
                        </span>
                        <span
                          className={`text-[14px] font-extrabold text-ca-ink ${
                            isCancelled ? "line-through" : ""
                          }`}
                        >
                          {s.title ?? "Sesión"}
                        </span>
                        {s.teacher_name && (
                          <span className="text-[12px] font-semibold text-ca-ink-soft">
                            {s.teacher_name}
                          </span>
                        )}
                        {multiCohort && (
                          <span className="rounded-full bg-ca-bg-soft px-2 py-0.5 text-[10px] font-bold text-ca-ink-soft">
                            {s.cohort_name}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="ca-card p-6 text-center text-[13px] text-ca-ink-soft">
                  No hay clases este día.
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
