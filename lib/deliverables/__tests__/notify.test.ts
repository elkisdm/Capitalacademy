import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBuildDeliverableOpenEmail = vi.fn();
const mockSendEmailBatch = vi.fn();

vi.mock("@/lib/email/deliverable-open", () => ({
  buildDeliverableOpenEmail: (...args: unknown[]) => mockBuildDeliverableOpenEmail(...args),
}));

vi.mock("@/lib/email/send-batch", () => ({
  sendEmailBatch: (...args: unknown[]) => mockSendEmailBatch(...args),
}));

// --- Mock del cliente admin de Supabase -------------------------------------
//
// Mismo enfoque que app/api/cron/session-reminders/__tests__/route.test.ts:
// cada tabla se configura con colas de respuestas por tipo de operación
// (select plano / select-single / update-con-select-maybeSingle / update-final
// awaited / upsert). Cada llamada consume el siguiente ítem de su cola (FIFO)
// y queda registrada en `capturedCalls` para poder verificar payload/filtros.

interface CallRecord {
  payload?: unknown;
  filters: unknown[][];
}

let capturedCalls: Record<string, CallRecord[]> = {};

function recordCall(key: string, payload: unknown, filters: unknown[][]) {
  (capturedCalls[key] ??= []).push({ payload, filters });
}

function lastCall(key: string): CallRecord | undefined {
  const list = capturedCalls[key];
  return list ? list[list.length - 1] : undefined;
}

function callCount(key: string): number {
  return capturedCalls[key]?.length ?? 0;
}

function popQueue<T>(queue: T[] | undefined, fallback: T): T {
  if (!queue || queue.length === 0) return fallback;
  return queue.shift() as T;
}

interface TableConfig {
  selectResults?: Array<{ data?: unknown; error?: unknown }>;
  selectSingleResults?: Array<{ data?: unknown; error?: unknown }>;
  updateClaimResults?: Array<{ data?: unknown; error?: unknown }>;
  updateFinalResults?: Array<{ error?: unknown }>;
  upsertResults?: Array<{ error?: unknown }>;
}

function makeSelectChain(table: string, cfg: TableConfig) {
  const filters: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["eq", "lte", "lt", "is"]) {
    chain[m] = (...args: unknown[]) => {
      filters.push([m, ...args]);
      return chain;
    };
  }
  chain.single = () => {
    recordCall(`${table}.select-single`, undefined, filters);
    return Promise.resolve(popQueue(cfg.selectSingleResults, { data: null, error: null }));
  };
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    recordCall(`${table}.select`, undefined, filters);
    return Promise.resolve(popQueue(cfg.selectResults, { data: [], error: null })).then(
      resolve,
      reject,
    );
  };
  return chain;
}

function makeUpdateChain(table: string, payload: unknown, cfg: TableConfig) {
  const filters: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["eq", "is", "lte", "lt"]) {
    chain[m] = (...args: unknown[]) => {
      filters.push([m, ...args]);
      return chain;
    };
  }
  chain.select = () => ({
    maybeSingle: () => {
      recordCall(`${table}.update-claim`, payload, filters);
      return Promise.resolve(popQueue(cfg.updateClaimResults, { data: null, error: null }));
    },
  });
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    recordCall(`${table}.update-final`, payload, filters);
    return Promise.resolve(popQueue(cfg.updateFinalResults, { error: null })).then(
      resolve,
      reject,
    );
  };
  return chain;
}

function makeAdmin(tables: Record<string, TableConfig>) {
  return {
    from(table: string) {
      const cfg = tables[table] ?? {};
      return {
        select: () => makeSelectChain(table, cfg),
        update: (payload: unknown) => makeUpdateChain(table, payload, cfg),
        upsert: (payload: unknown, opts: unknown) => {
          recordCall(`${table}.upsert`, payload, [["opts", opts]]);
          return Promise.resolve(popQueue(cfg.upsertResults, { error: null }));
        },
      };
    },
  };
}

let adminTables: Record<string, TableConfig> = {};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => makeAdmin(adminTables),
}));

const { notifyDeliverableOpen } = await import("@/lib/deliverables/notify");

const RESERVED_ROW = {
  id: "del-1",
  title: "Ensayo final",
  due_at: "2026-08-01T23:59:00.000Z",
  program_id: "prog-1",
};

function reservedOnFirstTry(row: unknown = RESERVED_ROW): TableConfig {
  return { updateClaimResults: [{ data: row, error: null }] };
}

function reservedOnRetry(row: unknown = RESERVED_ROW): TableConfig {
  return {
    updateClaimResults: [
      { data: null, error: null }, // reserva nueva: no hay fila
      { data: row, error: null }, // reintento de reserva vieja: sí hay
    ],
  };
}

function defaultProgram(): TableConfig {
  return { selectSingleResults: [{ data: { name: "Diplomado" }, error: null }] };
}

function defaultEnrollments(rows: unknown[] = [
  { student_id: "stu-1", profiles: { email: "a@test.cl", full_name: "Alumno Uno" } },
]): TableConfig {
  return { selectResults: [{ data: rows, error: null }] };
}

function emptyLedger(): TableConfig {
  return { selectResults: [{ data: [], error: null }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedCalls = {};
  adminTables = {};
  mockBuildDeliverableOpenEmail.mockReturnValue({ subject: "s", html: "h", text: "t" });
  mockSendEmailBatch.mockResolvedValue({ sent: [], failed: [] });
});

describe("notifyDeliverableOpen — reserva del entregable", () => {
  it("skipped:true cuando la consulta de reserva falla", async () => {
    adminTables = { deliverables: { updateClaimResults: [{ data: null, error: { message: "timeout" } }] } };

    const res = await notifyDeliverableOpen("del-1");

    expect(res).toEqual({ skipped: true });
    expect(callCount("deliverables.update-claim")).toBe(1);
    expect(callCount("programs.select-single")).toBe(0);
  });

  it("skipped:true cuando no hay reserva nueva ni reserva vieja reclamable (sin error)", async () => {
    adminTables = {
      deliverables: {
        updateClaimResults: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      },
    };

    const res = await notifyDeliverableOpen("del-1");

    expect(res).toEqual({ skipped: true });
    expect(callCount("deliverables.update-claim")).toBe(2);
    expect(callCount("enrollments.select")).toBe(0);
  });

  it("skipped:true cuando la reserva nueva no encuentra fila y el reintento de la vieja falla", async () => {
    adminTables = {
      deliverables: {
        updateClaimResults: [
          { data: null, error: null },
          { data: null, error: { message: "boom retry" } },
        ],
      },
    };

    const res = await notifyDeliverableOpen("del-1");

    expect(res).toEqual({ skipped: true });
    expect(callCount("deliverables.update-claim")).toBe(2);
  });

  it("reclama la reserva vieja (stale) cuando la reserva nueva no encuentra fila, y continúa el flujo", async () => {
    adminTables = {
      deliverables: reservedOnRetry(),
      programs: defaultProgram(),
      enrollments: defaultEnrollments(),
      deliverable_open_recipients: emptyLedger(),
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["a@test.cl"], failed: [] });

    const res = await notifyDeliverableOpen("del-1");

    expect(res).toEqual({ skipped: false, sent: 1 });
    expect(callCount("deliverables.update-claim")).toBe(2);
  });
});

describe("notifyDeliverableOpen — matrícula y armado de destinatarios", () => {
  it("deduplica alumnos con más de una matrícula activa en el programa (mismo student_id)", async () => {
    adminTables = {
      deliverables: reservedOnFirstTry(),
      programs: defaultProgram(),
      enrollments: defaultEnrollments([
        { student_id: "stu-1", profiles: { email: "a@test.cl", full_name: "Alumno Uno" } },
        { student_id: "stu-1", profiles: { email: "a@test.cl", full_name: "Alumno Uno" } },
      ]),
      deliverable_open_recipients: emptyLedger(),
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["a@test.cl"], failed: [] });

    await notifyDeliverableOpen("del-1");

    expect(mockSendEmailBatch.mock.calls[0][0]).toHaveLength(1);
  });

  it("filtra matrículas sin perfil o con email vacío antes de enviar", async () => {
    adminTables = {
      deliverables: reservedOnFirstTry(),
      programs: defaultProgram(),
      enrollments: defaultEnrollments([
        { student_id: "sin-perfil", profiles: null },
        { student_id: "sin-email", profiles: { email: "", full_name: "Sin correo" } },
        { student_id: "ok", profiles: { email: "ok@test.cl", full_name: "OK" } },
      ]),
      deliverable_open_recipients: emptyLedger(),
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["ok@test.cl"], failed: [] });

    const res = await notifyDeliverableOpen("del-1");

    expect(mockSendEmailBatch.mock.calls[0][0]).toHaveLength(1);
    expect(res).toEqual({ skipped: false, sent: 1 });
  });

  it("usa el nombre del programa cuando la consulta de programs lo trae", async () => {
    adminTables = {
      deliverables: reservedOnFirstTry(),
      programs: defaultProgram(),
      enrollments: defaultEnrollments(),
      deliverable_open_recipients: emptyLedger(),
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["a@test.cl"], failed: [] });

    await notifyDeliverableOpen("del-1");

    expect(mockBuildDeliverableOpenEmail).toHaveBeenCalledWith(
      expect.objectContaining({ programName: "Diplomado", deliverableTitle: "Ensayo final" }),
    );
  });

  it("deja programName en undefined cuando la consulta de programs falla (degradación segura: usa el nombre por defecto del correo)", async () => {
    adminTables = {
      deliverables: reservedOnFirstTry(),
      programs: { selectSingleResults: [{ data: null, error: { message: "boom program" } }] },
      enrollments: defaultEnrollments(),
      deliverable_open_recipients: emptyLedger(),
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["a@test.cl"], failed: [] });

    await notifyDeliverableOpen("del-1");

    expect(mockBuildDeliverableOpenEmail).toHaveBeenCalledWith(
      expect.objectContaining({ programName: undefined }),
    );
  });
});

describe("notifyDeliverableOpen — bitácora por destinatario e idempotencia", () => {
  it("skipped:true cuando la lectura de la bitácora falla, y no envía nada", async () => {
    adminTables = {
      deliverables: reservedOnFirstTry(),
      programs: defaultProgram(),
      enrollments: defaultEnrollments(),
      deliverable_open_recipients: {
        selectResults: [{ data: null, error: { message: "timeout ledger" } }],
      },
    };

    const res = await notifyDeliverableOpen("del-1");

    expect(res).toEqual({ skipped: true });
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
    expect(callCount("deliverables.update-final")).toBe(0);
  });

  it("excluye de 'missing' a quien ya está en la bitácora como 'sent' y cuenta su envío previo en el total", async () => {
    adminTables = {
      deliverables: reservedOnFirstTry(),
      programs: defaultProgram(),
      enrollments: defaultEnrollments([
        { student_id: "stu-1", profiles: { email: "a@test.cl", full_name: "A" } },
        { student_id: "stu-2", profiles: { email: "b@test.cl", full_name: "B" } },
      ]),
      deliverable_open_recipients: {
        selectResults: [{ data: [{ student_id: "stu-1" }], error: null }],
      },
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["b@test.cl"], failed: [] });

    const res = await notifyDeliverableOpen("del-1");

    // Solo se le manda al que faltaba (stu-2); stu-1 ya estaba en la bitácora.
    expect(mockSendEmailBatch.mock.calls[0][0]).toHaveLength(1);
    expect(mockSendEmailBatch.mock.calls[0][0][0].to).toBe("b@test.cl");
    expect(res).toEqual({ skipped: false, sent: 1 });
    const finalUpdate = lastCall("deliverables.update-final");
    // deliveredTotal = 1 (ya en bitácora) + 1 (recién enviado) = 2
    expect(finalUpdate?.payload).toMatchObject({
      open_notified_count: 2,
      open_notify_completed_at: expect.any(String),
    });
  });

  it("todos los destinatarios ya estaban en la bitácora: envía lote vacío y de todas formas marca completado", async () => {
    adminTables = {
      deliverables: reservedOnFirstTry(),
      programs: defaultProgram(),
      enrollments: defaultEnrollments([
        { student_id: "stu-1", profiles: { email: "a@test.cl", full_name: "A" } },
      ]),
      deliverable_open_recipients: {
        selectResults: [{ data: [{ student_id: "stu-1" }], error: null }],
      },
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: [], failed: [] });

    const res = await notifyDeliverableOpen("del-1");

    expect(mockSendEmailBatch).toHaveBeenCalledWith([], "do:del-1");
    expect(res).toEqual({ skipped: false, sent: 0 });
    expect(callCount("deliverable_open_recipients.upsert")).toBe(0);
    const finalUpdate = lastCall("deliverables.update-final");
    expect(finalUpdate?.payload).toMatchObject({ open_notified_count: 1 });
  });
});

describe("notifyDeliverableOpen — envío, bitácora de salida y estado final", () => {
  it("camino feliz: envía a todos, escribe la bitácora con status 'sent' y marca open_notify_completed_at", async () => {
    adminTables = {
      deliverables: reservedOnFirstTry(),
      programs: defaultProgram(),
      enrollments: defaultEnrollments([
        { student_id: "stu-1", profiles: { email: "a@test.cl", full_name: "A" } },
      ]),
      deliverable_open_recipients: emptyLedger(),
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["a@test.cl"], failed: [] });

    const res = await notifyDeliverableOpen("del-1");

    expect(res).toEqual({ skipped: false, sent: 1 });
    const upsertCall = lastCall("deliverable_open_recipients.upsert");
    expect(upsertCall?.payload).toEqual([
      {
        deliverable_id: "del-1",
        student_id: "stu-1",
        kind: "deliverable_open",
        channel: "email",
        status: "sent",
        error: null,
      },
    ]);
    const finalUpdate = lastCall("deliverables.update-final");
    expect(finalUpdate?.payload).toMatchObject({
      open_notified_count: 1,
      open_notify_completed_at: expect.any(String),
    });
  });

  it("envío parcial: escribe la bitácora con 'sent' y 'failed', actualiza el contador pero NO marca open_notify_completed_at", async () => {
    adminTables = {
      deliverables: reservedOnFirstTry(),
      programs: defaultProgram(),
      enrollments: defaultEnrollments([
        { student_id: "stu-1", profiles: { email: "a@test.cl", full_name: "A" } },
        { student_id: "stu-2", profiles: { email: "b@test.cl", full_name: "B" } },
      ]),
      deliverable_open_recipients: emptyLedger(),
    };
    mockSendEmailBatch.mockResolvedValueOnce({
      sent: ["a@test.cl"],
      failed: [{ to: "b@test.cl", error: "429 rate limit" }],
    });

    const res = await notifyDeliverableOpen("del-1");

    expect(res).toEqual({ skipped: false, sent: 1 });
    const upsertCall = lastCall("deliverable_open_recipients.upsert");
    expect(upsertCall?.payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ student_id: "stu-1", status: "sent", error: null }),
        expect.objectContaining({ student_id: "stu-2", status: "failed", error: "429 rate limit" }),
      ]),
    );
    const finalUpdate = lastCall("deliverables.update-final");
    expect(finalUpdate?.payload).toEqual({ open_notified_count: 1 });
    expect(finalUpdate?.payload).not.toHaveProperty("open_notify_completed_at");
  });

  it("registra (con console.error) el fallo del upsert de bitácora pero igual marca el estado final del entregable", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    adminTables = {
      deliverables: reservedOnFirstTry(),
      programs: defaultProgram(),
      enrollments: defaultEnrollments(),
      deliverable_open_recipients: {
        selectResults: [{ data: [], error: null }],
        upsertResults: [{ error: { message: "upsert boom" } }],
      },
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["a@test.cl"], failed: [] });

    const res = await notifyDeliverableOpen("del-1");

    expect(res).toEqual({ skipped: false, sent: 1 });
    expect(errSpy).toHaveBeenCalledWith(
      "notifyDeliverableOpen ledger write error",
      expect.objectContaining({ message: "upsert boom" }),
    );
    const finalUpdate = lastCall("deliverables.update-final");
    expect(finalUpdate?.payload).toMatchObject({ open_notified_count: 1 });
    errSpy.mockRestore();
  });

  it("no llama al upsert de bitácora cuando no hay filas que escribir (sin destinatarios)", async () => {
    adminTables = {
      deliverables: reservedOnFirstTry(),
      programs: defaultProgram(),
      enrollments: defaultEnrollments([]),
      deliverable_open_recipients: emptyLedger(),
    };

    const res = await notifyDeliverableOpen("del-1");

    expect(res).toEqual({ skipped: false, sent: 0 });
    expect(mockSendEmailBatch).toHaveBeenCalledWith([], "do:del-1");
    expect(callCount("deliverable_open_recipients.upsert")).toBe(0);
    const finalUpdate = lastCall("deliverables.update-final");
    expect(finalUpdate?.payload).toMatchObject({
      open_notified_count: 0,
      open_notify_completed_at: expect.any(String),
    });
  });

  it("un error en la consulta de matrícula aborta sin marcar el entregable como notificado", async () => {
    adminTables = {
      deliverables: reservedOnFirstTry(),
      programs: defaultProgram(),
      enrollments: { selectResults: [{ data: null, error: { message: "timeout matrícula" } }] },
      deliverable_open_recipients: emptyLedger(),
    };

    const res = await notifyDeliverableOpen("del-1");

    expect(res).toEqual({ skipped: true });
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
    // No se marca "completado": la ventana queda reintentable.
    expect(callCount("deliverables.update-final")).toBe(0);
  });
});
