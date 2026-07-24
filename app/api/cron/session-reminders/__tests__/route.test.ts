import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthorizeCron = vi.fn();
const mockBuildSessionReminderEmail = vi.fn();
const mockBuildCapacitacionReminderEmail = vi.fn();
const mockSendEmailBatch = vi.fn();
const mockSendAttendanceWarningEmail = vi.fn();
const mockGetStudentsAtAbsenceThreshold = vi.fn();

vi.mock("@/lib/api/cron-auth", () => ({
  authorizeCron: (...args: unknown[]) => mockAuthorizeCron(...args),
}));

vi.mock("@/lib/email/session-reminder", () => ({
  buildSessionReminderEmail: (...args: unknown[]) => mockBuildSessionReminderEmail(...args),
}));

vi.mock("@/lib/email/capacitacion-emails", () => ({
  buildCapacitacionReminderEmail: (...args: unknown[]) =>
    mockBuildCapacitacionReminderEmail(...args),
}));

vi.mock("@/lib/email/send-batch", () => ({
  sendEmailBatch: (...args: unknown[]) => mockSendEmailBatch(...args),
}));

vi.mock("@/lib/email/attendance-warning", () => ({
  sendAttendanceWarningEmail: (...args: unknown[]) => mockSendAttendanceWarningEmail(...args),
}));

vi.mock("@/lib/asistencia/queries", () => ({
  getStudentsAtAbsenceThreshold: (...args: unknown[]) =>
    mockGetStudentsAtAbsenceThreshold(...args),
}));

// --- Mock del cliente admin de Supabase -------------------------------------
//
// Cada tabla se configura con colas de respuestas por tipo de operación
// (select / insert / update-con-select-maybeSingle / update-final-awaited /
// upsert). Cada llamada consume el siguiente ítem de su cola (FIFO); si la
// cola está vacía se usa un valor por defecto benigno. Todas las llamadas
// quedan registradas en `capturedCalls` (payload + filtros encadenados) para
// poder verificar qué se intentó escribir/leer.

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
  insertResults?: Array<{ error?: unknown }>;
  updateClaimResults?: Array<{ data?: unknown; error?: unknown }>;
  updateFinalResults?: Array<{ error?: unknown }>;
  upsertResults?: Array<{ error?: unknown }>;
}

function makeSelectChain(table: string, cfg: TableConfig) {
  const filters: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["eq", "neq", "gte", "lt", "in", "order"]) {
    chain[m] = (...args: unknown[]) => {
      filters.push([m, ...args]);
      return chain;
    };
  }
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
  for (const m of ["eq", "lt"]) {
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
        insert: (payload: unknown) => {
          recordCall(`${table}.insert`, payload, []);
          return Promise.resolve(popQueue(cfg.insertResults, { error: null }));
        },
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

const { GET, POST } = await import("@/app/api/cron/session-reminders/route");

// CAP_CI_PROGRAM_ID hardcodeado en el módulo bajo prueba (no exportado).
const CAP_CI_PROGRAM_ID = "a0000000-0000-0000-0000-000000000004";

function makeRequest() {
  return new Request("http://localhost/api/cron/session-reminders", {
    method: "GET",
    headers: { Authorization: "Bearer test-secret" },
  });
}

// Las ventanas corren en orden 72h → 24h → 1h. Por defecto solo la 24h trae
// `sessions`; las otras dos quedan vacías, así el flujo por-sesión solo corre
// una vez por test y `json.windows[1]` es siempre la ventana bajo prueba.
function withSessionsWindow24h(sessions: unknown[]): TableConfig {
  return {
    selectResults: [
      { data: [], error: null },
      { data: sessions, error: null },
      { data: [], error: null },
    ],
  };
}

// Igual que el anterior pero cargando la ventana 72h (la primera), para
// ejercitar la antelación de 3 días (migración 0081).
function withSessionsWindow72h(sessions: unknown[]): TableConfig {
  return {
    selectResults: [
      { data: sessions, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ],
  };
}

const BASE_SESSION = {
  id: "sess-1",
  cohort_id: "cohort-1",
  title: "Clase de prueba",
  starts_at: "2026-08-01T10:00:00.000Z",
  ends_at: "2026-08-01T11:00:00.000Z",
  modality: "live_online",
  meeting_url: "https://meet.example.com/x",
  status: "scheduled",
  teacher_id: null as string | null,
  audience: "all",
};

function defaultEnrollments() {
  return {
    selectResults: [
      {
        data: [
          { student_id: "stu-1", profiles: { email: "stu1@test.cl", full_name: "Stu One" } },
        ],
        error: null,
      },
    ],
  };
}

function defaultCohorts(programId = "prog-generic") {
  return { selectResults: [{ data: [{ id: "cohort-1", program_id: programId }], error: null }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedCalls = {};
  adminTables = {};

  mockAuthorizeCron.mockReturnValue(true);
  mockBuildSessionReminderEmail.mockReturnValue({ subject: "s", html: "h", text: "t" });
  mockBuildCapacitacionReminderEmail.mockReturnValue({ subject: "sc", html: "hc", text: "tc" });
  mockSendEmailBatch.mockResolvedValue({ sent: [], failed: [] });
  mockSendAttendanceWarningEmail.mockResolvedValue({ success: true });
  mockGetStudentsAtAbsenceThreshold.mockResolvedValue([]);
});

describe("GET /api/cron/session-reminders — autorización y forma general", () => {
  it("devuelve 401 y no toca la base cuando el request no está autorizado", async () => {
    mockAuthorizeCron.mockReturnValue(false);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(callCount("class_sessions.select")).toBe(0);
    expect(mockGetStudentsAtAbsenceThreshold).not.toHaveBeenCalled();
  });

  it("expone POST como el mismo handler que GET", () => {
    expect(POST).toBe(GET);
  });

  it("camino feliz sin sesiones ni alertas: ok:true y ambas ventanas en cero", async () => {
    adminTables = { class_sessions: withSessionsWindow24h([]) };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.windows).toEqual([
      { kind: "72h", sessions: 0, emails: 0 },
      { kind: "24h", sessions: 0, emails: 0 },
      { kind: "1h", sessions: 0, emails: 0 },
    ]);
    expect(json.absences).toEqual({ evaluated: 0, sent: 0 });
    expect(json.errors).toEqual([]);
  });
});

describe("processWindow — consulta de sesiones y filtro de idempotencia", () => {
  it("registra el error de consulta y deja la ventana en cero sin abortar el cron", async () => {
    adminTables = {
      class_sessions: {
        selectResults: [
          { data: [], error: null },
          { data: null, error: { message: "timeout" } },
          { data: [], error: null },
        ],
      },
    };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.windows[1]).toEqual({ kind: "24h", sessions: 0, emails: 0 });
    expect(json.errors).toContain("query sessions (24h): timeout");
    expect(json.ok).toBe(false);
  });

  it("excluye sesiones con recordatorio ya 'sent', 'skipped' o 'pending' fresco", async () => {
    const freshIso = new Date(Date.now() - 60_000).toISOString(); // 1 min: dentro de RETRY_STALE_MS
    adminTables = {
      class_sessions: withSessionsWindow24h([
        { ...BASE_SESSION, id: "sent-1" },
        { ...BASE_SESSION, id: "skip-1" },
        { ...BASE_SESSION, id: "fresh-1" },
      ]),
      session_reminders: {
        selectResults: [
          {
            data: [
              { session_id: "sent-1", status: "sent", sent_at: freshIso },
              { session_id: "skip-1", status: "skipped", sent_at: freshIso },
              { session_id: "fresh-1", status: "pending", sent_at: freshIso },
            ],
            error: null,
          },
        ],
      },
    };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.windows[1]).toEqual({ kind: "24h", sessions: 0, emails: 0 });
    expect(callCount("session_reminders.insert")).toBe(0);
  });

  it("reintenta sesiones con recordatorio 'failed' o 'pending' viejo (no las excluye)", async () => {
    const staleIso = new Date(Date.now() - 20 * 60_000).toISOString(); // 20 min: pasó RETRY_STALE_MS (10 min)
    adminTables = {
      class_sessions: withSessionsWindow24h([
        { ...BASE_SESSION, id: "failed-1" },
        { ...BASE_SESSION, id: "stale-1" },
      ]),
      session_reminders: {
        selectResults: [
          {
            data: [
              { session_id: "failed-1", status: "failed", sent_at: staleIso },
              { session_id: "stale-1", status: "pending", sent_at: staleIso },
            ],
            error: null,
          },
        ],
        insertResults: [{ error: null }, { error: null }],
      },
      cohorts: defaultCohorts(),
      enrollments: {
        selectResults: [
          {
            data: [
              { student_id: "stu-1", profiles: { email: "a@test.cl", full_name: "A" } },
            ],
            error: null,
          },
          {
            data: [
              { student_id: "stu-2", profiles: { email: "b@test.cl", full_name: "B" } },
            ],
            error: null,
          },
        ],
      },
    };
    mockSendEmailBatch
      .mockResolvedValueOnce({ sent: ["a@test.cl"], failed: [] })
      .mockResolvedValueOnce({ sent: ["b@test.cl"], failed: [] });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.windows[1]).toEqual({ kind: "24h", sessions: 2, emails: 2 });
  });
});

describe("processWindow — reserva del recordatorio (insert) y su conflicto (23505)", () => {
  it("registra el error y salta la sesión cuando el insert falla por una razón que no es conflicto", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([BASE_SESSION]),
      session_reminders: { insertResults: [{ error: { message: "conexión perdida" } }] },
    };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.windows[1]).toEqual({ kind: "24h", sessions: 0, emails: 0 });
    expect(json.errors).toContain("reserve sess-1 (24h): conexión perdida");
    expect(callCount("enrollments.select")).toBe(0);
  });

  it("23505 con fila 'failed' reclamable: la reclama y continúa procesando la sesión", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([BASE_SESSION]),
      session_reminders: {
        insertResults: [{ error: { code: "23505", message: "duplicate key" } }],
        updateClaimResults: [{ data: { session_id: "sess-1" }, error: null }],
      },
      cohorts: defaultCohorts(),
      enrollments: defaultEnrollments(),
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["stu1@test.cl"], failed: [] });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.windows[1]).toEqual({ kind: "24h", sessions: 1, emails: 1 });
    expect(callCount("session_reminders.update-claim")).toBe(1);
  });

  it("23505 sin 'failed' pero con 'pending' viejo reclamable: lo reclama en el segundo intento", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([BASE_SESSION]),
      session_reminders: {
        insertResults: [{ error: { code: "23505", message: "duplicate key" } }],
        updateClaimResults: [
          { data: null, error: null }, // primer intento (status='failed') no matchea
          { data: { session_id: "sess-1" }, error: null }, // segundo intento (pending viejo) sí
        ],
      },
      cohorts: defaultCohorts(),
      enrollments: defaultEnrollments(),
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["stu1@test.cl"], failed: [] });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.windows[1]).toEqual({ kind: "24h", sessions: 1, emails: 1 });
    expect(callCount("session_reminders.update-claim")).toBe(2);
  });

  it("23505 sin fila reclamable (otra corrida ya la tiene): salta la sesión en silencio", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([BASE_SESSION]),
      session_reminders: {
        insertResults: [{ error: { code: "23505", message: "duplicate key" } }],
        updateClaimResults: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      },
    };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.windows[1]).toEqual({ kind: "24h", sessions: 0, emails: 0 });
    expect(json.errors).toEqual([]);
    expect(callCount("enrollments.select")).toBe(0);
  });
});

describe("processWindow — matrícula, audiencia y armado del correo", () => {
  it("propaga el error de matrícula y salta la sesión sin enviar nada", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([BASE_SESSION]),
      cohorts: defaultCohorts(),
      enrollments: { selectResults: [{ data: null, error: { message: "rls denegado" } }] },
    };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.windows[1]).toEqual({ kind: "24h", sessions: 0, emails: 0 });
    expect(json.errors).toContain("enrollments sess-1 (24h): rls denegado");
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
  });

  it("agrega el filtro de segmento cuando la sesión es audience='capital_inteligente'", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([
        { ...BASE_SESSION, audience: "capital_inteligente" },
      ]),
      cohorts: defaultCohorts(),
      enrollments: defaultEnrollments(),
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["stu1@test.cl"], failed: [] });

    await GET(makeRequest());

    const call = lastCall("enrollments.select");
    expect(call?.filters).toContainEqual(["eq", "segment", "capital_inteligente"]);
  });

  it("filtra matrículas sin perfil o con email vacío antes de enviar", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([BASE_SESSION]),
      cohorts: defaultCohorts(),
      enrollments: {
        selectResults: [
          {
            data: [
              { student_id: "sin-perfil", profiles: null },
              { student_id: "sin-email", profiles: { email: "", full_name: "Sin correo" } },
              { student_id: "ok", profiles: { email: "ok@test.cl", full_name: "OK" } },
            ],
            error: null,
          },
        ],
      },
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["ok@test.cl"], failed: [] });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(mockSendEmailBatch.mock.calls[0][0]).toHaveLength(1);
    expect(json.windows[1]).toEqual({ kind: "24h", sessions: 1, emails: 1 });
  });

  it("ventana 72h: reserva la fila con kind '72h' y arma el correo con esa antelación", async () => {
    adminTables = {
      class_sessions: withSessionsWindow72h([BASE_SESSION]),
      cohorts: defaultCohorts(),
      enrollments: defaultEnrollments(),
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["stu1@test.cl"], failed: [] });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.windows[0]).toEqual({ kind: "72h", sessions: 1, emails: 1 });
    expect(lastCall("session_reminders.insert")?.payload).toMatchObject({
      session_id: "sess-1",
      kind: "72h",
      status: "pending",
    });
    expect(mockBuildSessionReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "72h" }),
    );
  });

  it("usa el título de respaldo, resuelve el nombre del docente y enruta a la voz de captación (CAP-CI)", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([
        { ...BASE_SESSION, title: null, teacher_id: "teacher-1" },
      ]),
      cohorts: defaultCohorts(CAP_CI_PROGRAM_ID),
      instructors: { selectResults: [{ data: [{ id: "teacher-1", full_name: "Profe Uno" }], error: null }] },
      enrollments: defaultEnrollments(),
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["stu1@test.cl"], failed: [] });

    await GET(makeRequest());

    expect(mockBuildCapacitacionReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ sessionTitle: "Tu próxima clase", kind: "24h" }),
    );
    expect(mockBuildSessionReminderEmail).not.toHaveBeenCalled();
  });

  it("deja el nombre del docente en null cuando el teacher_id no aparece en instructors, y usa la plantilla genérica", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([{ ...BASE_SESSION, teacher_id: "teacher-x" }]),
      cohorts: defaultCohorts("prog-generic"),
      instructors: { selectResults: [{ data: [], error: null }] },
      enrollments: defaultEnrollments(),
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["stu1@test.cl"], failed: [] });

    await GET(makeRequest());

    expect(mockBuildSessionReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ teacherName: null }),
    );
    expect(mockBuildCapacitacionReminderEmail).not.toHaveBeenCalled();
  });
});

describe("processWindow — bitácora por destinatario y envío", () => {
  it("propaga el error de lectura de la bitácora y no envía nada (la fila queda 'pending' para reintento)", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([BASE_SESSION]),
      cohorts: defaultCohorts(),
      enrollments: defaultEnrollments(),
      session_reminder_recipients: {
        selectResults: [{ data: null, error: { message: "timeout ledger" } }],
      },
    };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.windows[1]).toEqual({ kind: "24h", sessions: 0, emails: 0 });
    expect(json.errors).toContain("ledger read sess-1 (24h): timeout ledger");
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
    expect(callCount("session_reminders.update-final")).toBe(0);
  });

  it("excluye de 'missing' a quien ya está en la bitácora como 'sent' y aun así marca la fila 'sent'", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([BASE_SESSION]),
      cohorts: defaultCohorts(),
      enrollments: defaultEnrollments(),
      session_reminder_recipients: {
        selectResults: [{ data: [{ student_id: "stu-1" }], error: null }],
      },
    };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(mockSendEmailBatch).toHaveBeenCalledWith([], expect.any(String));
    expect(json.windows[1]).toEqual({ kind: "24h", sessions: 1, emails: 0 });
    const finalUpdate = lastCall("session_reminders.update-final");
    expect(finalUpdate?.payload).toMatchObject({ status: "sent", recipients_count: 1 });
  });

  it("marca la fila 'skipped' y no llama al upsert de bitácora cuando no hay matriculados con correo", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([BASE_SESSION]),
      cohorts: defaultCohorts(),
      enrollments: { selectResults: [{ data: [], error: null }] },
    };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.windows[1]).toEqual({ kind: "24h", sessions: 1, emails: 0 });
    expect(callCount("session_reminder_recipients.upsert")).toBe(0);
    const finalUpdate = lastCall("session_reminders.update-final");
    expect(finalUpdate?.payload).toMatchObject({
      status: "skipped",
      recipients_count: 0,
      error: null,
    });
  });

  it("marca la fila 'failed' con el detalle del primer error cuando el envío es parcial", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([BASE_SESSION]),
      cohorts: defaultCohorts(),
      enrollments: {
        selectResults: [
          {
            data: [
              { student_id: "stu-1", profiles: { email: "a@test.cl", full_name: "A" } },
              { student_id: "stu-2", profiles: { email: "b@test.cl", full_name: "B" } },
            ],
            error: null,
          },
        ],
      },
    };
    mockSendEmailBatch.mockResolvedValueOnce({
      sent: ["a@test.cl"],
      failed: [{ to: "b@test.cl", error: "429 rate limit" }],
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.windows[1]).toEqual({ kind: "24h", sessions: 1, emails: 1 });
    const finalUpdate = lastCall("session_reminders.update-final");
    expect(finalUpdate?.payload).toMatchObject({
      status: "failed",
      error: "1/2 fallaron: 429 rate limit",
    });
  });

  it("registra el error del upsert de bitácora pero igual finaliza el estado de la sesión", async () => {
    adminTables = {
      class_sessions: withSessionsWindow24h([BASE_SESSION]),
      cohorts: defaultCohorts(),
      enrollments: defaultEnrollments(),
      session_reminder_recipients: { upsertResults: [{ error: { message: "upsert boom" } }] },
    };
    mockSendEmailBatch.mockResolvedValueOnce({ sent: ["stu1@test.cl"], failed: [] });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.errors).toContain("ledger sess-1 (24h): upsert boom");
    const finalUpdate = lastCall("session_reminders.update-final");
    expect(finalUpdate?.payload).toMatchObject({ status: "sent" });
  });
});

describe("GET — agregación de errores entre ventanas y alertas", () => {
  it("agrega errores de ambas fuentes y marca ok:false si cualquiera falló", async () => {
    adminTables = {
      class_sessions: {
        selectResults: [
          { data: [], error: null },
          { data: null, error: { message: "boom 24h" } },
          { data: [], error: null },
        ],
      },
    };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.errors).toEqual(["query sessions (24h): boom 24h"]);
  });
});

describe("processAbsenceAlerts", () => {
  it("no hace nada cuando no hay alumnos en el umbral de inasistencias", async () => {
    mockGetStudentsAtAbsenceThreshold.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.absences).toEqual({ evaluated: 0, sent: 0 });
    expect(callCount("attendance_alerts.insert")).toBe(0);
  });

  it("excluye pares alumno+cohorte con alerta ya 'sent' o 'pending' fresca", async () => {
    const freshIso = new Date(Date.now() - 60_000).toISOString();
    mockGetStudentsAtAbsenceThreshold.mockResolvedValue([
      {
        studentId: "stu-sent",
        cohortId: "cohort-a",
        programId: "prog-1",
        cohortName: "Cohorte A",
        email: "sent@test.cl",
        fullName: "Sent",
        absences: 2,
      },
      {
        studentId: "stu-fresh",
        cohortId: "cohort-b",
        programId: "prog-1",
        cohortName: "Cohorte B",
        email: "fresh@test.cl",
        fullName: "Fresh",
        absences: 2,
      },
    ]);
    adminTables = {
      attendance_alerts: {
        selectResults: [
          {
            data: [
              { student_id: "stu-sent", cohort_id: "cohort-a", status: "sent", sent_at: freshIso },
              {
                student_id: "stu-fresh",
                cohort_id: "cohort-b",
                status: "pending",
                sent_at: freshIso,
              },
            ],
            error: null,
          },
        ],
      },
    };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.absences).toEqual({ evaluated: 0, sent: 0 });
    expect(callCount("attendance_alerts.insert")).toBe(0);
  });

  it("registra el error y salta al alumno cuando el insert falla por algo distinto de conflicto", async () => {
    mockGetStudentsAtAbsenceThreshold.mockResolvedValue([
      {
        studentId: "stu-1",
        cohortId: "cohort-1",
        programId: "prog-1",
        cohortName: "Cohorte 1",
        email: "a@test.cl",
        fullName: "A",
        absences: 2,
      },
    ]);
    adminTables = { attendance_alerts: { insertResults: [{ error: { message: "db caída" } }] } };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.absences).toEqual({ evaluated: 1, sent: 0 });
    expect(json.errors).toContain("reserve absence stu-1/cohort-1: db caída");
    expect(mockSendAttendanceWarningEmail).not.toHaveBeenCalled();
  });

  it("23505 con fila 'failed' reclamable: reclama y envía la alerta", async () => {
    mockGetStudentsAtAbsenceThreshold.mockResolvedValue([
      {
        studentId: "stu-1",
        cohortId: "cohort-1",
        programId: "prog-1",
        cohortName: "Cohorte 1",
        email: "a@test.cl",
        fullName: "A",
        absences: 2,
      },
    ]);
    adminTables = {
      attendance_alerts: {
        insertResults: [{ error: { code: "23505", message: "dup" } }],
        updateClaimResults: [{ data: { student_id: "stu-1" }, error: null }],
      },
    };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.absences).toEqual({ evaluated: 1, sent: 1 });
    const finalUpdate = lastCall("attendance_alerts.update-final");
    expect(finalUpdate?.payload).toMatchObject({ status: "sent", error: null });
  });

  it("23505 sin fila reclamable: salta al alumno en silencio (no cuenta como enviado ni como error)", async () => {
    mockGetStudentsAtAbsenceThreshold.mockResolvedValue([
      {
        studentId: "stu-1",
        cohortId: "cohort-1",
        programId: "prog-1",
        cohortName: "Cohorte 1",
        email: "a@test.cl",
        fullName: "A",
        absences: 2,
      },
    ]);
    adminTables = {
      attendance_alerts: {
        insertResults: [{ error: { code: "23505", message: "dup" } }],
        updateClaimResults: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      },
    };

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.absences).toEqual({ evaluated: 1, sent: 0 });
    expect(json.errors).toEqual([]);
    expect(mockSendAttendanceWarningEmail).not.toHaveBeenCalled();
  });

  it("marca 'failed' con el mensaje del proveedor cuando el envío falla con error explícito", async () => {
    mockGetStudentsAtAbsenceThreshold.mockResolvedValue([
      {
        studentId: "stu-1",
        cohortId: "cohort-1",
        programId: "prog-1",
        cohortName: "Cohorte 1",
        email: "a@test.cl",
        fullName: "A",
        absences: 2,
      },
    ]);
    mockSendAttendanceWarningEmail.mockResolvedValueOnce({
      success: false,
      error: "resend caído",
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.absences).toEqual({ evaluated: 1, sent: 0 });
    expect(json.errors).toContain("send absence stu-1/cohort-1: resend caído");
    const finalUpdate = lastCall("attendance_alerts.update-final");
    expect(finalUpdate?.payload).toMatchObject({ status: "failed", error: "resend caído" });
  });

  it("usa 'unknown' como mensaje de error cuando el proveedor falla sin detalle", async () => {
    mockGetStudentsAtAbsenceThreshold.mockResolvedValue([
      {
        studentId: "stu-1",
        cohortId: "cohort-1",
        programId: "prog-1",
        cohortName: "Cohorte 1",
        email: "a@test.cl",
        fullName: "A",
        absences: 2,
      },
    ]);
    mockSendAttendanceWarningEmail.mockResolvedValueOnce({ success: false });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.errors).toContain("send absence stu-1/cohort-1: unknown");
    const finalUpdate = lastCall("attendance_alerts.update-final");
    expect(finalUpdate?.payload).toMatchObject({ status: "failed", error: "unknown" });
  });
});
