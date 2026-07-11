"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

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

function initialsOf(row: AttendanceRow): string {
  const source = row.fullName ?? row.email ?? "";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Reportería de asistencia de una sesión + marcado manual por staff.
 * Vive dentro del editor de sesión (junto al QR y al panel de grabación).
 */
export function SessionAttendancePanel({ sessionId }: { sessionId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

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

  const visibleRows = useMemo(() => {
    const rows = report?.rows ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.fullName, row.email].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [report, query]);

  async function markAll(attended: boolean) {
    const targets = visibleRows.filter((row) => row.attended !== attended);
    if (targets.length === 0) return;
    setBulk({ done: 0, total: targets.length });
    for (const row of targets) {
      await toggle(row);
      setBulk((b) => (b ? { ...b, done: b.done + 1 } : b));
    }
    setBulk(null);
  }

  const bulkBusy = bulk !== null;

  return (
    <div className="ca-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ca-ink-soft">
            Asistencia
          </div>
          <h3 className="mt-0.5 text-[15px] font-extrabold text-ca-ink">
            {report ? `${report.present} de ${report.total} presentes` : "Asistencia de la clase"}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {bulkBusy && (
            <span className="text-[11px] text-ca-ink-soft">
              {bulk.done}/{bulk.total}…
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void markAll(true)}
            disabled={loading || bulkBusy || visibleRows.length === 0}
          >
            Marcar todos
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void markAll(false)}
            disabled={loading || bulkBusy || visibleRows.length === 0}
          >
            Limpiar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading || bulkBusy}
          >
            {loading ? "Cargando…" : "Actualizar"}
          </Button>
        </div>
      </div>

      {report && report.rows.length > 0 && (
        <div className="px-5 pb-3">
          <Input
            type="search"
            aria-label="Buscar alumno por nombre o correo"
            placeholder="Buscar alumno…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 py-1.5 text-[13px]"
          />
          {query.trim() && (
            <p className="mt-1 text-[11px] text-ca-ink-soft">
              Mostrando {visibleRows.length} de {report.rows.length}
            </p>
          )}
        </div>
      )}

      {error && (
        <div
          role="status"
          aria-live="polite"
          className="mx-5 mb-3 rounded-lg bg-ca-rose/10 px-3 py-2 text-[12px] font-semibold text-ca-rose-text"
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
        <ul
          className="max-h-[420px] divide-y overflow-y-auto"
          style={{ borderColor: "var(--color-ca-outline)" }}
        >
          {visibleRows.map((row) => {
            const name = row.fullName ?? row.email ?? "Alumno";
            const isPending = pending === row.studentId;
            return (
              <li
                key={row.studentId}
                className="flex items-center gap-3 px-4 py-2"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ca-violet/10 text-[11px] font-bold text-ca-violet">
                  {initialsOf(row)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ca-ink">
                  {name}
                  {row.attended && (
                    <span className="ml-2 text-[11px] font-normal text-ca-ink-soft">
                      {row.method === "manual" ? "staff" : "QR"}
                      {row.markedAt
                        ? ` · ${timeFmt.format(new Date(row.markedAt))}`
                        : ""}
                    </span>
                  )}
                </span>
                <Button
                  variant={row.attended ? "outline" : "lime"}
                  size="sm"
                  onClick={() => void toggle(row)}
                  disabled={isPending || bulkBusy}
                  aria-label={
                    row.attended ? `Marcar ausente a ${name}` : `Marcar presente a ${name}`
                  }
                  className="shrink-0 px-3"
                >
                  {isPending ? "…" : row.attended ? "✓ Presente" : "Marcar"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
