import { describe, it, expect, vi, beforeEach } from "vitest";

let autorizado = true;
vi.mock("@/lib/api/cron-auth", () => ({
  authorizeCron: vi.fn(() => autorizado),
}));

let destinatarios: unknown[] = [];
let queryError: Error | null = null;
vi.mock("@/lib/admin/leads-queries", () => ({
  getTasksForDigest: vi.fn(async () => {
    if (queryError) throw queryError;
    return destinatarios;
  }),
}));

let outcome: { sent: string[]; failed: unknown[] } = { sent: [], failed: [] };
const sendSpy = vi.fn();
vi.mock("@/lib/email/send-batch", () => ({
  sendEmailBatch: vi.fn(async (messages: unknown[], prefix: string) => {
    sendSpy(messages, prefix);
    return outcome;
  }),
}));

import { GET, POST } from "../route";

const req = () => new Request("http://x/api/cron/lead-tasks", { method: "POST" });

const persona = (email: string, urgency: "vencida" | "hoy" = "hoy") => ({
  email,
  full_name: "Camila",
  tasks: [
    {
      id: "t-1",
      title: "Llamar a Ana",
      due_at: "2026-08-26T13:00:00Z",
      lead_id: "l-1",
      lead_name: "Ana",
      urgency,
    },
  ],
});

beforeEach(() => {
  autorizado = true;
  destinatarios = [];
  queryError = null;
  outcome = { sent: [], failed: [] };
  sendSpy.mockClear();
  vi.useRealTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("cron de recordatorio de seguimiento", () => {
  it("exige el secreto del cron", async () => {
    autorizado = false;
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("no envía nada cuando no hay pendientes", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, recipients: 0, sent: 0 });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("manda un correo por persona", async () => {
    destinatarios = [persona("camila@x.cl"), persona("elkis@x.cl")];
    outcome = { sent: ["1", "2"], failed: [] };

    const res = await POST(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      recipients: 2,
      sent: 2,
      failed: 0,
    });

    const [messages] = sendSpy.mock.calls[0];
    expect((messages as { to: string }[]).map((m) => m.to)).toEqual([
      "camila@x.cl",
      "elkis@x.cl",
    ]);
  });

  it("cada mensaje lleva asunto, html y texto", async () => {
    destinatarios = [persona("camila@x.cl")];
    await POST(req());
    const [messages] = sendSpy.mock.calls[0];
    const msg = (messages as { subject: string; html: string; text: string }[])[0];
    expect(msg.subject).toContain("seguimiento pendiente");
    expect(msg.html).toContain("Llamar a Ana");
    expect(msg.text).toContain("Llamar a Ana");
  });

  it("la clave de idempotencia lleva el día de Chile", async () => {
    // `idempotencyKeyFor` hashea SOLO la lista de destinatarios. Con un prefijo
    // fijo y un equipo estable la clave sería idéntica todos los días y Resend
    // devolvería la respuesta cacheada del día anterior: el correo dejaría de
    // llegar para siempre mientras la ruta sigue reportando `sent`.
    destinatarios = [persona("camila@x.cl")];
    await POST(req());
    expect(sendSpy.mock.calls[0][1]).toMatch(/^lead-tasks-digest:\d{4}-\d{2}-\d{2}$/);
  });

  it("dos corridas del mismo día comparten clave y dos días distintos no", async () => {
    destinatarios = [persona("camila@x.cl")];
    vi.setSystemTime(new Date("2026-08-26T19:00:00Z"));
    await POST(req());
    await POST(req());
    vi.setSystemTime(new Date("2026-08-27T19:00:00Z"));
    await POST(req());

    const claves = sendSpy.mock.calls.map((c) => c[1]);
    expect(claves[0]).toBe(claves[1]);
    expect(claves[2]).not.toBe(claves[0]);
    vi.useRealTimers();
  });

  it("reporta los fallos sin romper la corrida", async () => {
    destinatarios = [persona("camila@x.cl")];
    outcome = { sent: [], failed: [{ to: "camila@x.cl", error: "rebote" }] };
    const res = await POST(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ sent: 0, failed: 1 });
  });

  it("responde 500 si la consulta falla", async () => {
    queryError = new Error("boom");
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("también responde por GET", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
  });
});
