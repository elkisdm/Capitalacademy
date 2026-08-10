import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type State = {
  session: Record<string, unknown> | null;
  teacher: { full_name: string } | null;
};
let state: State;

const insertSpy = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "session_change_notices") {
        return { insert: (values: unknown) => { insertSpy(values); return Promise.resolve({ error: null }); } };
      }
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order"]) {
        builder[m] = () => builder;
      }
      builder.maybeSingle = () =>
        Promise.resolve({
          data: table === "class_sessions" ? state.session : state.teacher,
          error: null,
        });
      return builder;
    },
  }),
}));

const recipientsSpy = vi.fn();
vi.mock("@/lib/classroom/session-recipients", () => ({
  getSessionRecipients: (...a: unknown[]) => recipientsSpy(...a),
}));

const sendSpy = vi.fn();
vi.mock("@/lib/email/send-batch", () => ({
  sendEmailBatch: (...a: unknown[]) => sendSpy(...a),
}));

const { GET, POST } = await import("@/app/api/admin/sessions/[sessionId]/aviso/route");

const ID = "cccccccc-1111-4111-8111-111111111111";
const ANTES_START = "2026-08-16T14:00:00.000Z";
const ANTES_END = "2026-08-16T16:00:00.000Z";
const AHORA_START = "2026-08-16T19:00:00.000Z";
const AHORA_END = "2026-08-16T21:00:00.000Z";

function ctx() {
  return { params: Promise.resolve({ sessionId: ID }) };
}

function post(body: unknown) {
  return new Request(`http://x/api/admin/sessions/${ID}/aviso`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID = {
  kind: "rescheduled" as const,
  previousStartsAt: ANTES_START,
  previousEndsAt: ANTES_END,
};

beforeEach(() => {
  authResult = { user: { id: "admin-1" } };
  state = {
    session: {
      id: ID,
      cohort_id: "co1",
      title: "Sesión 4",
      starts_at: AHORA_START,
      ends_at: AHORA_END,
      modality: "live_online",
      audience: "all",
      teacher_id: null,
    },
    teacher: null,
  };
  insertSpy.mockReset();
  recipientsSpy.mockReset();
  recipientsSpy.mockResolvedValue([
    { studentId: "s1", email: "a@x.cl", fullName: "Ana" },
    { studentId: "s2", email: "b@x.cl", fullName: "Beto" },
  ]);
  sendSpy.mockReset();
  sendSpy.mockResolvedValue({ sent: ["a@x.cl", "b@x.cl"], failed: [] });
});

describe("GET — a cuántos alcanza", () => {
  it("propaga el 403 de authorizeAdmin", async () => {
    authResult = { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
    expect((await GET(new Request("http://x"), ctx())).status).toBe(403);
  });

  it("devuelve el conteo de alumnos activos", async () => {
    const body = await (await GET(new Request("http://x"), ctx())).json();
    expect(body.count).toBe(2);
  });

  it("404 si la clase no existe", async () => {
    state.session = null;
    expect((await GET(new Request("http://x"), ctx())).status).toBe(404);
  });
});

describe("POST — avisar", () => {
  it("propaga el 403 de authorizeAdmin", async () => {
    authResult = { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
    expect((await POST(post(VALID), ctx())).status).toBe(403);
  });

  it("envía por lote y responde cuántos recibieron", async () => {
    const res = await POST(post(VALID), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ sent: 2, failed: 0, total: 2 });
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  // El horario anterior lo manda el cliente porque la fila YA tiene el nuevo:
  // para cuando esta ruta corre, el PATCH ya se aplicó.
  it("el correo contrasta el horario anterior con el de la fila", async () => {
    await POST(post(VALID), ctx());

    const [messages] = sendSpy.mock.calls[0];
    const primero = (messages as Array<{ to: string; text: string }>)[0];
    expect(primero.to).toBe("a@x.cl");
    expect(primero.text).toContain("10:00"); // anterior, en hora de Chile
    expect(primero.text).toContain("15:00"); // nuevo
  });

  it("la clave de idempotencia queda anclada a esta clase y a este tipo de aviso", async () => {
    await POST(post(VALID), ctx());

    const [, prefix] = sendSpy.mock.calls[0];
    expect(prefix).toBe(`scn:${ID}:rescheduled`);
  });

  it("deja la cancelación registrada sin horario nuevo", async () => {
    await POST(post({ ...VALID, kind: "cancelled" }), ctx());

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "cancelled",
        new_starts_at: null,
        new_ends_at: null,
        recipients_count: 2,
        sent_by: "admin-1",
      }),
    );
  });

  it("guarda el título en la bitácora, porque la clase puede dejar de existir", async () => {
    await POST(post({ ...VALID, kind: "cancelled" }), ctx());

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ session_title: "Sesión 4", cohort_id: "co1" }),
    );
  });

  // Un correo que dice "cambió de horario" mostrando dos veces la misma hora es
  // peor que no mandar nada.
  it("se niega a avisar una reprogramación que no cambió el horario", async () => {
    const res = await POST(
      post({ ...VALID, previousStartsAt: AHORA_START, previousEndsAt: AHORA_END }),
      ctx(),
    );

    expect(res.status).toBe(422);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("no avisa si no hay a quién", async () => {
    recipientsSpy.mockResolvedValue([]);

    const res = await POST(post(VALID), ctx());

    expect(res.status).toBe(422);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("404 si la clase no existe", async () => {
    state.session = null;
    expect((await POST(post(VALID), ctx())).status).toBe(404);
  });

  it("rechaza un horario anterior incoherente", async () => {
    const res = await POST(
      post({ ...VALID, previousStartsAt: ANTES_END, previousEndsAt: ANTES_START }),
      ctx(),
    );
    expect(res.status).toBe(422);
  });

  it("rechaza un tipo de aviso desconocido", async () => {
    expect((await POST(post({ ...VALID, kind: "movida" }), ctx())).status).toBe(422);
  });

  it("informa los fallos parciales en vez de darlos por entregados", async () => {
    sendSpy.mockResolvedValue({ sent: ["a@x.cl"], failed: ["b@x.cl"] });

    const body = await (await POST(post(VALID), ctx())).json();

    expect(body).toEqual({ sent: 1, failed: 1, total: 2 });
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ recipients_count: 1 }));
  });
});
