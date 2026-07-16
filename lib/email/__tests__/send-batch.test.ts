import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockBatchSend = vi.fn();

vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ batch: { send: (...args: unknown[]) => mockBatchSend(...args) } }),
  FROM_EMAIL: "Capital Academy <no-reply@example.com>",
}));

const { chunk, idempotencyKeyFor, sendEmailBatch, BATCH_CHUNK_SIZE } = await import(
  "@/lib/email/send-batch"
);

function makeMessages(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    to: `alumno${i}@example.com`,
    subject: "Recordatorio",
    html: "<p>hola</p>",
    text: "hola",
  }));
}

describe("chunk", () => {
  it("parte 239 en [100, 100, 39]", () => {
    const items = Array.from({ length: 239 }, (_, i) => i);
    const groups = chunk(items, BATCH_CHUNK_SIZE);
    expect(groups.map((g) => g.length)).toEqual([100, 100, 39]);
  });

  it("devuelve [] para una lista vacía", () => {
    expect(chunk([], BATCH_CHUNK_SIZE)).toEqual([]);
  });

  it("devuelve un solo lote de 100 cuando hay exactamente 100", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const groups = chunk(items, BATCH_CHUNK_SIZE);
    expect(groups.length).toBe(1);
    expect(groups[0].length).toBe(100);
  });
});

describe("idempotencyKeyFor", () => {
  it("misma composición produce la misma clave", () => {
    const messages = makeMessages(3);
    const key1 = idempotencyKeyFor("sr:s1:24h", messages);
    const key2 = idempotencyKeyFor("sr:s1:24h", [...messages]);
    expect(key1).toBe(key2);
  });

  it("composición distinta produce una clave distinta", () => {
    const a = makeMessages(3);
    const b = makeMessages(2);
    expect(idempotencyKeyFor("sr:s1:24h", a)).not.toBe(idempotencyKeyFor("sr:s1:24h", b));
  });
});

describe("sendEmailBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("239 mensajes hacen exactamente 3 llamadas a batch.send", async () => {
    mockBatchSend.mockResolvedValue({ data: { data: [], errors: [] }, error: null });

    const messages = makeMessages(239);
    const promise = sendEmailBatch(messages, "sr:s1:24h");
    await vi.runAllTimersAsync();
    const outcome = await promise;

    expect(mockBatchSend).toHaveBeenCalledTimes(3);
    expect(outcome.sent.length).toBe(239);
    expect(outcome.failed.length).toBe(0);
  });

  it("respuesta permissive con errors reparte sent/failed por índice", async () => {
    mockBatchSend.mockResolvedValue({
      data: { data: [], errors: [{ index: 2, message: "invalid" }] },
      error: null,
    });

    const messages = makeMessages(5);
    const promise = sendEmailBatch(messages, "sr:s1:24h");
    await vi.runAllTimersAsync();
    const outcome = await promise;

    expect(outcome.failed).toEqual([{ to: "alumno2@example.com", error: "invalid" }]);
    expect(outcome.sent).toEqual([
      "alumno0@example.com",
      "alumno1@example.com",
      "alumno3@example.com",
      "alumno4@example.com",
    ]);
  });

  it("429 en los primeros intentos y éxito al 3º: sent completo (backoff funciona)", async () => {
    mockBatchSend
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Too many requests. You can only make 10 requests per second." },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Too many requests. You can only make 10 requests per second." },
      })
      .mockResolvedValueOnce({ data: { data: [], errors: [] }, error: null });

    const messages = makeMessages(2);
    const promise = sendEmailBatch(messages, "sr:s1:24h");
    await vi.runAllTimersAsync();
    const outcome = await promise;

    expect(mockBatchSend).toHaveBeenCalledTimes(3);
    expect(outcome.sent.length).toBe(2);
    expect(outcome.failed.length).toBe(0);
  });

  it("429 persistente: el lote entero cae en failed y ninguno en sent", async () => {
    mockBatchSend.mockResolvedValue({
      data: null,
      error: { message: "Too many requests. You can only make 10 requests per second." },
    });

    const messages = makeMessages(2);
    const promise = sendEmailBatch(messages, "sr:s1:24h");
    await vi.runAllTimersAsync();
    const outcome = await promise;

    expect(outcome.sent.length).toBe(0);
    expect(outcome.failed.length).toBe(2);
    expect(outcome.failed[0].error).toContain("10 requests per second");
  });
});
