"use client";

import { useCallback, useEffect, useState } from "react";

type AttendanceRow = {
  studentId: string;
  fullName: string | null;
  email: string | null;
  attended: boolean;
  method: "qr" | "manual" | null;
  markedAt: string | null;
};

type Report = {
  sessionId: string;
  title: string | null;
  present: number;
  total: number;
  rows: AttendanceRow[];
};

const timeFmt = new Intl.DateTimeFormat("es-CL", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Santiago",
});

/**
 * Reportería de asistencia de una sesión + marcado manual por staff.
 * Vive dentro del editor de sesión (junto al QR y al panel de grabación).
 */
export function SessionAttendancePanel({ sessionId }: { sessionId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const base = `/api/admin/sessions/${sessionId}/attendance`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(base, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setReport(await res.json());
    } catch {
      setError("No se pudo cargar la asistencia.");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    // Diferido a un microtask para no llamar setState síncronamente dentro del
    // effect (react-hooks/set-state-in-effect).
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  async function toggle(row: AttendanceRow) {
    setPending(row.studentId);
    setError(null);
    try {
      const res = await fetch(base, {
        method: row.attended ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: row.studentId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "No se pudo actualizar.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="ca-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ca-ink-soft">
            Asistencia
          </div>
          <h3 className="mt-0.5 text-[15px] font-extrabold text-ca-ink">
            {report ? `${report.present} de ${report.total} presentes` : "Asistencia de la clase"}
          </h3>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-ca-ink/[0.1] px-3 py-2 text-[12px] font-bold text-ca-ink transition-colors hover:border-ca-violet hover:text-ca-violet disabled:opacity-50"
        >
          {loading ? "Cargando…" : "Actualizar"}
        </button>
      </div>

      {error && (
        <div
          role="status"
          aria-live="polite"
          className="mx-5 mb-3 rounded-lg bg-ca-rose/10 px-3 py-2 text-[12px] font-semibold text-ca-rose"
        >
          {error}
        </div>
      )}

      {!loading && report && report.rows.length === 0 && (
        <p className="px-5 pb-5 text-[13px] text-ca-ink-soft">
          Esta clase todavía no tiene alumnos matriculados.
        </p>
      )}

      {report && report.rows.length > 0 && (
        <ul className="divide-y" style={{ borderColor: "var(--color-ca-outline)" }}>
          {report.rows.map((row) => (
            <li
              key={row.studentId}
              className="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-ca-ink">
                  {row.fullName ?? row.email ?? "Alumno"}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ca-ink-soft">
                  {row.attended ? (
                    <span>
                      Presente ·{" "}
                      {row.method === "manual" ? "marcado por staff" : "QR"}
                      {row.markedAt
                        ? ` · ${timeFmt.format(new Date(row.markedAt))}`
                        : ""}
                    </span>
                  ) : (
                    <span>Ausente</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => void toggle(row)}
                disabled={pending === row.studentId}
                className={
                  row.attended
                    ? "shrink-0 rounded-lg border border-ca-ink/[0.12] px-3 py-1.5 text-[12px] font-bold text-ca-ink-soft transition-colors hover:border-ca-rose hover:text-ca-rose disabled:opacity-50"
                    : "ca-btn-lime shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.04em] disabled:opacity-50"
                }
              >
                {pending === row.studentId
                  ? "…"
                  : row.attended
                    ? "Quitar"
                    : "Marcar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
