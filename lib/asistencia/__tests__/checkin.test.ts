import { describe, it, expect, vi } from "vitest";
import {
  evaluateCheckin,
  type CheckinDeps,
  type CheckinSession,
} from "@/lib/asistencia/checkin";

// Sesión de referencia: 10:00–12:00 del 2026-07-07 (-04). La ventana válida es
// [09:40, 12:30] en ese día.
const SESSION: CheckinSession = {
  id: "sess-1",
  cohort_id: "cohort-1",
  starts_at: "2026-07-07T10:00:00-04:00",
  ends_at: "2026-07-07T12:00:00-04:00",
  title: "Clase de prueba",
};
const INSIDE = new Date("2026-07-07T10:30:00-04:00"); // dentro de la clase
const BEFORE = new Date("2026-07-07T09:00:00-04:00"); // 1h antes → fuera
const AFTER = new Date("2026-07-07T13:00:00-04:00"); // 1h después → fuera

function makeDeps(over: Partial<CheckinDeps> = {}): CheckinDeps {
  return {
    loadSession: vi.fn(async () => SESSION),
    isEnrolledActive: vi.fn(async () => true),
    recordAttendance: vi.fn(async () => true),
    ...over,
  };
}

describe("evaluateCheckin", () => {
  it("registra la asistencia cuando todo es válido (ok)", async () => {
    const deps = makeDeps();
    const res = await evaluateCheckin(deps, {
      sessionId: "sess-1",
      userId: "u1",
      now: INSIDE,
    });
    expect(res.status).toBe("ok");
    expect(deps.recordAttendance).toHaveBeenCalledWith({
      sessionId: "sess-1",
      userId: "u1",
      cohortId: "cohort-1",
    });
  });

  it("devuelve 'already' cuando la fila ya existía (idempotencia)", async () => {
    const deps = makeDeps({ recordAttendance: vi.fn(async () => false) });
    const res = await evaluateCheckin(deps, {
      sessionId: "sess-1",
      userId: "u1",
      now: INSIDE,
    });
    expect(res.status).toBe("already");
  });

  it("rechaza a quien no está matriculado y NO registra", async () => {
    const record = vi.fn(async () => true);
    const deps = makeDeps({
      isEnrolledActive: vi.fn(async () => false),
      recordAttendance: record,
    });
    const res = await evaluateCheckin(deps, {
      sessionId: "sess-1",
      userId: "u1",
      now: INSIDE,
    });
    expect(res.status).toBe("not_enrolled");
    expect(record).not.toHaveBeenCalled();
  });

  it("rechaza fuera de la ventana temporal (antes) y NO registra", async () => {
    const record = vi.fn(async () => true);
    const deps = makeDeps({ recordAttendance: record });
    const res = await evaluateCheckin(deps, {
      sessionId: "sess-1",
      userId: "u1",
      now: BEFORE,
    });
    expect(res.status).toBe("outside_window");
    expect(record).not.toHaveBeenCalled();
  });

  it("rechaza fuera de la ventana temporal (después)", async () => {
    const res = await evaluateCheckin(makeDeps(), {
      sessionId: "sess-1",
      userId: "u1",
      now: AFTER,
    });
    expect(res.status).toBe("outside_window");
  });

  it("devuelve error si la sesión no existe", async () => {
    const deps = makeDeps({ loadSession: vi.fn(async () => null) });
    const res = await evaluateCheckin(deps, {
      sessionId: "nope",
      userId: "u1",
      now: INSIDE,
    });
    expect(res.status).toBe("error");
  });

  it("orden de validación: no revela la ventana a un no-matriculado", async () => {
    // Un no-matriculado fuera de ventana debe ver 'not_enrolled', no 'outside_window'.
    const deps = makeDeps({ isEnrolledActive: vi.fn(async () => false) });
    const res = await evaluateCheckin(deps, {
      sessionId: "sess-1",
      userId: "u1",
      now: AFTER,
    });
    expect(res.status).toBe("not_enrolled");
  });
});
