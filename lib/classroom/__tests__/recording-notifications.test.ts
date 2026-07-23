import { describe, it, expect, vi, beforeEach } from "vitest";

// Único borde externo real de este módulo que vale la pena mockear aparte del
// cliente de Supabase (inyectado por parámetro): el envío de correos. Ya está
// cubierto en profundidad (retries, chunking) en lib/email/__tests__/send-batch.test.ts;
// acá solo nos interesa QUÉ arma y QUÉ hace con el resultado.
const mockSendEmailBatch = vi.fn();
vi.mock("@/lib/email/send-batch", () => ({
  sendEmailBatch: (...args: unknown[]) => mockSendEmailBatch(...args),
}));

import {
  dispatchCapacitacionFollowup,
  dispatchRecordingAvailableNotification,
  RETRY_STALE_MS,
} from "@/lib/classroom/recording-notifications";

const CAP_CI_PROGRAM_ID = "a0000000-0000-0000-0000-000000000004";
const OTHER_PROGRAM_ID = "b0000000-0000-0000-0000-000000000001";
const LESSON_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "22222222-2222-2222-2222-222222222222";
const COHORT_ID = "33333333-3333-3333-3333-333333333333";
const STUDENT_A = "44444444-4444-4444-4444-444444444444";
const STUDENT_B = "55555555-5555-5555-5555-555555555555";

type QueueEntry = { data?: unknown; error?: unknown; throw?: Error };

/**
 * Doble mínimo del admin client: cada `.from(tabla)` desencola la próxima
 * respuesta configurada para esa tabla, sin importar qué cadena de métodos
 * (`select/insert/update/upsert/eq/is/lt/order/maybeSingle`) se use para
 * llegar a ella. Como el módulo bajo prueba hace sus queries en un orden fijo
 * y determinístico por rama, encolar en el orden correcto alcanza para
 * simular cualquier escenario, incluyendo un cliente que lanza (network).
 */
function fakeAdmin(responses: Record<string, QueueEntry[]>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const from = (table: string) => {
    const queue = responses[table];
    if (!queue || queue.length === 0) {
      throw new Error(`fakeAdmin: sin respuestas encoladas para la tabla "${table}"`);
    }
    const response = queue.shift()!;
    const builder: Record<string, unknown> = {};
    const chainable = ["select", "insert", "update", "upsert", "eq", "is", "lt", "order"];
    for (const method of chainable) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      };
    }
    const resolve = () => {
      if (response.throw) return Promise.reject(response.throw);
      return Promise.resolve({ data: response.data ?? null, error: response.error ?? null });
    };
    builder.maybeSingle = () => resolve();
    builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected);
    return builder;
  };
  return { admin: { from } as unknown as Parameters<typeof dispatchCapacitacionFollowup>[0], calls };
}

function sessionRow(overrides: {
  cohortId?: string | null;
  programId?: string;
  slug?: string | null;
  title?: string | null;
  cohortName?: string;
  programName?: string | null;
} = {}) {
  return {
    id: SESSION_ID,
    cohort_id: overrides.cohortId === null ? null : COHORT_ID,
    title: overrides.title === undefined ? "Clase de ventas" : overrides.title,
    cohorts:
      overrides.cohortId === null
        ? null
        : {
            program_id: overrides.programId ?? CAP_CI_PROGRAM_ID,
            slug: overrides.slug === undefined ? "cap-ci-g1" : overrides.slug,
            name: overrides.cohortName ?? "Cohorte G1",
            programs:
              overrides.programName === null
                ? null
                : { name: overrides.programName ?? "Ciclo de Capacitación" },
          },
  };
}

function enrollmentRows() {
  return [
    { student_id: STUDENT_A, profiles: { email: "a@example.com", full_name: "Alumna A" } },
    { student_id: STUDENT_B, profiles: { email: "b@example.com", full_name: "Alumno B" } },
    // Sin email: debe quedar filtrado de los destinatarios.
    { student_id: "66666666-6666-6666-6666-666666666666", profiles: { email: "", full_name: "Sin correo" } },
    { student_id: "77777777-7777-7777-7777-777777777777", profiles: null },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("dispatchCapacitacionFollowup", () => {
  it("no hace nada si la lección no es repetición de ninguna sesión", async () => {
    const { admin, calls } = fakeAdmin({
      class_sessions: [{ data: null }],
    });
    await dispatchCapacitacionFollowup(admin, LESSON_ID);
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
    expect(calls.every((c) => c.table === "class_sessions")).toBe(true);
  });

  it("no hace nada si la sesión no tiene cohorte", async () => {
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow({ cohortId: null }) }],
    });
    await dispatchCapacitacionFollowup(admin, LESSON_ID);
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
  });

  it("no hace nada si el programa de la cohorte NO es CAP-CI", async () => {
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow({ programId: OTHER_PROGRAM_ID }) }],
    });
    await dispatchCapacitacionFollowup(admin, LESSON_ID);
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
  });

  it("reserva falla con error distinto de 23505: loguea y no envía", async () => {
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow() }],
      capacitacion_followup_log: [{ error: { code: "500", message: "timeout" } }],
    });
    await dispatchCapacitacionFollowup(admin, LESSON_ID);
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("reserva choca (23505) y no hay reserva vieja reclamable: no reenvía", async () => {
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow() }],
      capacitacion_followup_log: [
        { error: { code: "23505" } },
        { data: null }, // retry: ninguna fila reclamable
      ],
    });
    await dispatchCapacitacionFollowup(admin, LESSON_ID);
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
  });

  it("reserva choca (23505) pero SÍ hay una reserva vieja sin completar: reclama y envía", async () => {
    mockSendEmailBatch.mockResolvedValue({ sent: ["a@example.com", "b@example.com"], failed: [] });
    const { admin, calls } = fakeAdmin({
      class_sessions: [{ data: sessionRow() }],
      capacitacion_followup_log: [
        { error: { code: "23505" } },
        { data: { session_id: SESSION_ID } }, // retry reclamada
        { data: null }, // update final (completed_at)
      ],
      enrollments: [{ data: enrollmentRows() }],
      recording_notify_recipients: [{ data: [] }, { error: undefined }],
    });
    await dispatchCapacitacionFollowup(admin, LESSON_ID);
    expect(mockSendEmailBatch).toHaveBeenCalledTimes(1);
    const finalUpdate = calls.filter(
      (c) => c.table === "capacitacion_followup_log" && c.method === "update",
    );
    expect(finalUpdate.length).toBe(2); // el retry (reservado como update) + el final
    const lastUpdatePayload = finalUpdate[finalUpdate.length - 1].args[0] as Record<string, unknown>;
    expect(lastUpdatePayload.completed_at).toBeDefined();
  });

  it("camino feliz: reserva nueva, sin entregas previas, envía a todos los inscritos con email", async () => {
    mockSendEmailBatch.mockResolvedValue({ sent: ["a@example.com", "b@example.com"], failed: [] });
    const { admin, calls } = fakeAdmin({
      class_sessions: [{ data: sessionRow() }],
      capacitacion_followup_log: [{ error: undefined }, { data: null }],
      enrollments: [{ data: enrollmentRows() }],
      recording_notify_recipients: [{ data: [] }, { error: undefined }],
    });
    await dispatchCapacitacionFollowup(admin, LESSON_ID);

    expect(mockSendEmailBatch).toHaveBeenCalledTimes(1);
    const [messages, prefix] = mockSendEmailBatch.mock.calls[0];
    expect(prefix).toBe(`rn:${SESSION_ID}:capacitacion_followup`);
    expect((messages as Array<{ to: string }>).map((m) => m.to).sort()).toEqual([
      "a@example.com",
      "b@example.com",
    ]);

    const upsertCall = calls.find(
      (c) => c.table === "recording_notify_recipients" && c.method === "upsert",
    );
    expect(upsertCall).toBeDefined();
    const rows = upsertCall!.args[0] as Array<{ student_id: string; status: string; kind: string }>;
    expect(rows.every((r) => r.status === "sent" && r.kind === "capacitacion_followup")).toBe(true);
    expect(rows.map((r) => r.student_id).sort()).toEqual([STUDENT_A, STUDENT_B].sort());

    const finalUpdateCall = calls.find(
      (c) => c.table === "capacitacion_followup_log" && c.method === "update",
    );
    const payload = finalUpdateCall!.args[0] as Record<string, unknown>;
    expect(payload.recipients_count).toBe(2);
    expect(payload.completed_at).toBeDefined();
  });

  it("no reenvía a quien ya está en el ledger como 'sent'", async () => {
    mockSendEmailBatch.mockResolvedValue({ sent: ["b@example.com"], failed: [] });
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow() }],
      capacitacion_followup_log: [{ error: undefined }, { data: null }],
      enrollments: [{ data: enrollmentRows() }],
      recording_notify_recipients: [{ data: [{ student_id: STUDENT_A }] }, { error: undefined }],
    });
    await dispatchCapacitacionFollowup(admin, LESSON_ID);

    const [messages] = mockSendEmailBatch.mock.calls[0];
    expect((messages as Array<{ to: string }>).map((m) => m.to)).toEqual(["b@example.com"]);
  });

  it("si ya le llegó a todos (missing vacío) igual llama a sendEmailBatch con lista vacía y no hace upsert", async () => {
    mockSendEmailBatch.mockResolvedValue({ sent: [], failed: [] });
    const { admin, calls } = fakeAdmin({
      class_sessions: [{ data: sessionRow() }],
      capacitacion_followup_log: [{ error: undefined }, { data: null }],
      enrollments: [{ data: enrollmentRows() }],
      recording_notify_recipients: [{ data: [{ student_id: STUDENT_A }, { student_id: STUDENT_B }] }],
    });
    await dispatchCapacitacionFollowup(admin, LESSON_ID);

    expect(mockSendEmailBatch).toHaveBeenCalledWith([], `rn:${SESSION_ID}:capacitacion_followup`);
    const upsertCall = calls.find(
      (c) => c.table === "recording_notify_recipients" && c.method === "upsert",
    );
    expect(upsertCall).toBeUndefined();
  });

  it("lectura del ledger falla: loguea y no envía correos", async () => {
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow() }],
      capacitacion_followup_log: [{ error: undefined }],
      enrollments: [{ data: enrollmentRows() }],
      recording_notify_recipients: [{ error: { message: "boom" } }],
    });
    await dispatchCapacitacionFollowup(admin, LESSON_ID);
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("con fallos parciales: escribe recipients_count pero NO marca completed_at", async () => {
    mockSendEmailBatch.mockResolvedValue({
      sent: ["a@example.com"],
      failed: [{ to: "b@example.com", error: "rejected" }],
    });
    const { admin, calls } = fakeAdmin({
      class_sessions: [{ data: sessionRow() }],
      capacitacion_followup_log: [{ error: undefined }, { data: null }],
      enrollments: [{ data: enrollmentRows() }],
      recording_notify_recipients: [{ data: [] }, { error: undefined }],
    });
    await dispatchCapacitacionFollowup(admin, LESSON_ID);

    const upsertCall = calls.find(
      (c) => c.table === "recording_notify_recipients" && c.method === "upsert",
    );
    const rows = upsertCall!.args[0] as Array<{ status: string; error: string | null }>;
    expect(rows.find((r) => r.status === "failed")?.error).toBe("rejected");

    const finalUpdateCall = calls.find(
      (c) => c.table === "capacitacion_followup_log" && c.method === "update",
    );
    const payload = finalUpdateCall!.args[0] as Record<string, unknown>;
    expect(payload.recipients_count).toBe(1);
    expect(payload.completed_at).toBeUndefined();
  });

  it("si el upsert del ledger falla, igual completa (loguea pero no aborta)", async () => {
    mockSendEmailBatch.mockResolvedValue({ sent: ["a@example.com"], failed: [] });
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow() }],
      capacitacion_followup_log: [{ error: undefined }, { data: null }],
      enrollments: [{ data: [enrollmentRows()[0]] }],
      recording_notify_recipients: [{ data: [] }, { error: { message: "upsert falló" } }],
    });
    await expect(dispatchCapacitacionFollowup(admin, LESSON_ID)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("ledger write"),
      SESSION_ID,
      { message: "upsert falló" },
    );
  });

  it("usa cohort_id como fallback de slug cuando la cohorte no tiene slug, y título por defecto", async () => {
    mockSendEmailBatch.mockResolvedValue({ sent: ["a@example.com"], failed: [] });
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow({ slug: null, title: null }) }],
      capacitacion_followup_log: [{ error: undefined }, { data: null }],
      enrollments: [{ data: [enrollmentRows()[0]] }],
      recording_notify_recipients: [{ data: [] }, { error: undefined }],
    });
    await dispatchCapacitacionFollowup(admin, LESSON_ID);
    const [messages] = mockSendEmailBatch.mock.calls[0];
    expect((messages as Array<{ html: string; text: string }>)[0].text).toContain("tu capacitación");
  });

  it("nunca lanza: si la query de sesión rechaza, se captura y se loguea", async () => {
    const { admin } = fakeAdmin({
      class_sessions: [{ throw: new Error("network down") }],
    });
    await expect(dispatchCapacitacionFollowup(admin, LESSON_ID)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("dispatchRecordingAvailableNotification", () => {
  it("no hace nada si la lección no es repetición de ninguna sesión", async () => {
    const { admin } = fakeAdmin({ class_sessions: [{ data: null }] });
    await dispatchRecordingAvailableNotification(admin, LESSON_ID);
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
  });

  it("no hace nada si la sesión no tiene cohorte", async () => {
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow({ cohortId: null }) }],
    });
    await dispatchRecordingAvailableNotification(admin, LESSON_ID);
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
  });

  it("no hace nada si el programa de la cohorte ES CAP-CI (usa su propio follow-up)", async () => {
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow({ programId: CAP_CI_PROGRAM_ID }) }],
    });
    await dispatchRecordingAvailableNotification(admin, LESSON_ID);
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
  });

  it("la reserva (update condicional) falla: loguea y no envía", async () => {
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow({ programId: OTHER_PROGRAM_ID }) }],
      lessons: [{ error: { message: "db down" } }],
    });
    await dispatchRecordingAvailableNotification(admin, LESSON_ID);
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("reserva nunca reclamada antes y sin fila vieja reclamable: no reenvía (ya notificada/en curso)", async () => {
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow({ programId: OTHER_PROGRAM_ID }) }],
      lessons: [{ data: [] }, { data: [] }],
    });
    await dispatchRecordingAvailableNotification(admin, LESSON_ID);
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
  });

  it("reserva nueva reclamada directamente (primer update): envía a los inscritos", async () => {
    mockSendEmailBatch.mockResolvedValue({ sent: ["a@example.com", "b@example.com"], failed: [] });
    const { admin, calls } = fakeAdmin({
      class_sessions: [{ data: sessionRow({ programId: OTHER_PROGRAM_ID }) }],
      lessons: [{ data: [{ id: LESSON_ID }] }, { data: null }],
      enrollments: [{ data: enrollmentRows() }],
      recording_notify_recipients: [{ data: [] }, { error: undefined }],
    });
    await dispatchRecordingAvailableNotification(admin, LESSON_ID);

    expect(mockSendEmailBatch).toHaveBeenCalledTimes(1);
    const finalUpdate = calls.filter((c) => c.table === "lessons" && c.method === "update");
    expect(finalUpdate.length).toBe(2); // reserva + marca de completado
    const payload = finalUpdate[1].args[0] as Record<string, unknown>;
    expect(payload.recording_notify_completed_at).toBeDefined();
  });

  it("reserva vacía en el primer intento pero reclamada vía retry (reserva vieja sin terminar): envía", async () => {
    mockSendEmailBatch.mockResolvedValue({ sent: ["a@example.com", "b@example.com"], failed: [] });
    const { admin, calls } = fakeAdmin({
      class_sessions: [{ data: sessionRow({ programId: OTHER_PROGRAM_ID }) }],
      lessons: [{ data: [] }, { data: [{ id: LESSON_ID }] }, { data: null }],
      enrollments: [{ data: enrollmentRows() }],
      recording_notify_recipients: [{ data: [] }, { error: undefined }],
    });
    await dispatchRecordingAvailableNotification(admin, LESSON_ID);
    expect(mockSendEmailBatch).toHaveBeenCalledTimes(1);
    const lessonsUpdates = calls.filter((c) => c.table === "lessons" && c.method === "update");
    expect(lessonsUpdates.length).toBe(3);
  });

  it("lectura del ledger falla: loguea y no envía correos", async () => {
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow({ programId: OTHER_PROGRAM_ID }) }],
      lessons: [{ data: [{ id: LESSON_ID }] }],
      enrollments: [{ data: enrollmentRows() }],
      recording_notify_recipients: [{ error: { message: "boom" } }],
    });
    await dispatchRecordingAvailableNotification(admin, LESSON_ID);
    expect(mockSendEmailBatch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("no reenvía a quien ya está en el ledger como 'sent'", async () => {
    mockSendEmailBatch.mockResolvedValue({ sent: ["b@example.com"], failed: [] });
    const { admin } = fakeAdmin({
      class_sessions: [{ data: sessionRow({ programId: OTHER_PROGRAM_ID }) }],
      lessons: [{ data: [{ id: LESSON_ID }] }, { data: null }],
      enrollments: [{ data: enrollmentRows() }],
      recording_notify_recipients: [{ data: [{ student_id: STUDENT_A }] }, { error: undefined }],
    });
    await dispatchRecordingAvailableNotification(admin, LESSON_ID);
    const [messages] = mockSendEmailBatch.mock.calls[0];
    expect((messages as Array<{ to: string }>).map((m) => m.to)).toEqual(["b@example.com"]);
  });

  it("con fallos parciales: NO marca recording_notify_completed_at y no reintenta la reserva más", async () => {
    mockSendEmailBatch.mockResolvedValue({
      sent: ["a@example.com"],
      failed: [{ to: "b@example.com", error: "rejected" }],
    });
    const { admin, calls } = fakeAdmin({
      class_sessions: [{ data: sessionRow({ programId: OTHER_PROGRAM_ID }) }],
      lessons: [{ data: [{ id: LESSON_ID }] }],
      enrollments: [{ data: enrollmentRows() }],
      recording_notify_recipients: [{ data: [] }, { error: undefined }],
    });
    await dispatchRecordingAvailableNotification(admin, LESSON_ID);

    const upsertCall = calls.find(
      (c) => c.table === "recording_notify_recipients" && c.method === "upsert",
    );
    const rows = upsertCall!.args[0] as Array<{ status: string; error: string | null }>;
    expect(rows.find((r) => r.status === "failed")?.error).toBe("rejected");

    const lessonsUpdates = calls.filter((c) => c.table === "lessons" && c.method === "update");
    // Solo la reserva inicial: con fallos parciales el módulo NO vuelve a
    // escribir en `lessons` (a diferencia del follow-up CAP-CI, que sí
    // registra `recipients_count` incluso en la rama de fallo parcial).
    expect(lessonsUpdates.length).toBe(1);
  });

  it("usa cohort_id como fallback de slug, título 'tu clase' y programName 'Capital Academy' cuando faltan", async () => {
    mockSendEmailBatch.mockResolvedValue({ sent: ["a@example.com"], failed: [] });
    const { admin } = fakeAdmin({
      class_sessions: [
        {
          data: sessionRow({
            programId: OTHER_PROGRAM_ID,
            slug: null,
            title: null,
            programName: null,
          }),
        },
      ],
      lessons: [{ data: [{ id: LESSON_ID }] }, { data: null }],
      enrollments: [{ data: [enrollmentRows()[0]] }],
      recording_notify_recipients: [{ data: [] }, { error: undefined }],
    });
    await dispatchRecordingAvailableNotification(admin, LESSON_ID);
    const [messages] = mockSendEmailBatch.mock.calls[0];
    const text = (messages as Array<{ text: string }>)[0].text;
    expect(text).toContain("tu clase");
    expect(text).toContain("Capital Academy");
  });

  it("usa el nombre real del programa cuando está presente", async () => {
    mockSendEmailBatch.mockResolvedValue({ sent: ["a@example.com"], failed: [] });
    const { admin } = fakeAdmin({
      class_sessions: [
        {
          data: sessionRow({ programId: OTHER_PROGRAM_ID, programName: "Diplomado de Ventas" }),
        },
      ],
      lessons: [{ data: [{ id: LESSON_ID }] }, { data: null }],
      enrollments: [{ data: [enrollmentRows()[0]] }],
      recording_notify_recipients: [{ data: [] }, { error: undefined }],
    });
    await dispatchRecordingAvailableNotification(admin, LESSON_ID);
    const [messages] = mockSendEmailBatch.mock.calls[0];
    expect((messages as Array<{ text: string }>)[0].text).toContain("Diplomado de Ventas");
  });

  it("si el upsert del ledger falla, igual completa (loguea pero no aborta)", async () => {
    mockSendEmailBatch.mockResolvedValue({ sent: ["a@example.com"], failed: [] });
    const { admin, calls } = fakeAdmin({
      class_sessions: [{ data: sessionRow({ programId: OTHER_PROGRAM_ID }) }],
      lessons: [{ data: [{ id: LESSON_ID }] }, { data: null }],
      enrollments: [{ data: [enrollmentRows()[0]] }],
      recording_notify_recipients: [{ data: [] }, { error: { message: "upsert falló" } }],
    });
    await expect(dispatchRecordingAvailableNotification(admin, LESSON_ID)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("ledger write"),
      LESSON_ID,
      { message: "upsert falló" },
    );
    const lessonsUpdates = calls.filter((c) => c.table === "lessons" && c.method === "update");
    expect(lessonsUpdates.length).toBe(2); // aunque el ledger falle, sigue marcando completado
  });

  it("nunca lanza: si la query de sesión rechaza, se captura y se loguea", async () => {
    const { admin } = fakeAdmin({ class_sessions: [{ throw: new Error("network down") }] });
    await expect(dispatchRecordingAvailableNotification(admin, LESSON_ID)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("RETRY_STALE_MS", () => {
  it("es 10 minutos en milisegundos", () => {
    expect(RETRY_STALE_MS).toBe(10 * 60 * 1000);
  });
});
