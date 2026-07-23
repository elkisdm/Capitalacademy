import { describe, it, expect, vi, beforeEach } from "vitest";

type InsertResult = { error: unknown };
let insertResult: InsertResult;
const insertSpy = vi.fn(async (_payload: unknown) => insertResult);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (_table: string) => ({
      insert: insertSpy,
    }),
  })),
}));

const { POST } = await import("@/app/api/leads/route");

// El limitador de tasa vive en el módulo (singleton por proceso, 5 req/60s por IP).
// Cada test usa una IP distinta (x-forwarded-for) para no interferir entre sí.
let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    full_name: "Ana Pérez",
    email: "Ana.Perez@Ejemplo.com",
    phone: "+56912345678",
    program_interest: "diplomado",
    ...overrides,
  };
}

function postReq(body: unknown, opts?: { ip?: string; headers?: Record<string, string> }) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": opts?.ip ?? nextIp(),
    ...opts?.headers,
  };
  return new Request("http://localhost/api/leads", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  insertResult = { error: null };
});

describe("POST /api/leads", () => {
  it("400 cuando el cuerpo no es JSON válido", async () => {
    const res = await POST(postReq("no-es-json{{{"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Cuerpo inválido");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("422 cuando la validación falla (email inválido y program_interest fuera de enum): el error nombra el campo con el primer issue", async () => {
    const res = await POST(postReq(
      validBody({ email: "no-es-email", program_interest: "otro" }),
    ));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Revisa el campo: correo electrónico");
    expect(Array.isArray(json.issues)).toBe(true);
    expect(json.issues.length).toBeGreaterThan(0);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("422 cuando faltan campos requeridos (full_name muy corto): el error nombra el campo nombre", async () => {
    const res = await POST(postReq(validBody({ full_name: "A" })));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Revisa el campo: nombre");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("422 con teléfono muy corto: el error nombra el campo teléfono", async () => {
    const res = await POST(postReq(validBody({ phone: "123" })));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Revisa el campo: teléfono");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("422 con campo sin etiqueta mapeada: usa el texto genérico como fallback", async () => {
    const res = await POST(postReq(validBody({ message: "x".repeat(2001) })));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it(
    "200 silencioso cuando el honeypot 'website' viene con valor (bot detectado)",
    async () => {
      const res = await POST(postReq(validBody({ website: "http://bot.example" })));
      // Comportamiento esperado de un honeypot: 200 { ok: true } sin insertar, para
      // no delatarle al bot que fue detectado.
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ok: true });
      expect(insertSpy).not.toHaveBeenCalled();
    },
  );

  it("200 con website vacío ('' explícito): flujo normal, no activa el honeypot", async () => {
    const res = await POST(postReq(validBody({ website: "" })));
    expect(res.status).toBe(201);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("500 cuando Supabase falla al insertar", async () => {
    insertResult = { error: { message: "db down" } };
    const res = await POST(postReq(validBody()));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("No pudimos guardar tu mensaje. Intenta nuevamente.");
  });

  it("201 en camino feliz: normaliza email a minúsculas, aplica source por defecto y guarda el user-agent", async () => {
    const ip = nextIp();
    const res = await POST(postReq(validBody(), {
      ip,
      headers: { "user-agent": "vitest-agent/1.0" },
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ ok: true });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.email).toBe("ana.perez@ejemplo.com");
    expect(payload.source).toBe("landing");
    expect(payload.user_agent).toBe("vitest-agent/1.0");
    expect(payload.role).toBeNull();
    expect(payload.company).toBeNull();
    expect(payload.message).toBeNull();
    expect(payload.utm_source).toBeNull();
    expect(payload.utm_medium).toBeNull();
    expect(payload.utm_campaign).toBeNull();
    expect(payload.utm_content).toBeNull();
    expect(payload.utm_term).toBeNull();
  });

  it("201 conserva los campos opcionales cuando vienen con valor y respeta el source explícito", async () => {
    const res = await POST(postReq(
      validBody({
        role: "Gerente",
        company: "Acme SpA",
        message: "Quiero más info",
        source: "instagram",
        utm_source: "ig",
        utm_medium: "social",
        utm_campaign: "julio",
        utm_content: "story",
        utm_term: "diplomado",
      }),
    ));
    expect(res.status).toBe(201);

    const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.role).toBe("Gerente");
    expect(payload.company).toBe("Acme SpA");
    expect(payload.message).toBe("Quiero más info");
    expect(payload.source).toBe("instagram");
    expect(payload.utm_source).toBe("ig");
    expect(payload.utm_medium).toBe("social");
    expect(payload.utm_campaign).toBe("julio");
    expect(payload.utm_content).toBe("story");
    expect(payload.utm_term).toBe("diplomado");
  });

  it("201 sin header user-agent: guarda null", async () => {
    const res = await POST(postReq(validBody()));
    expect(res.status).toBe(201);
    const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.user_agent).toBeNull();
  });

  it("429 al superar el límite de 5 solicitudes por minuto para una misma IP", async () => {
    const ip = nextIp();
    for (let i = 0; i < 5; i++) {
      const res = await POST(postReq(validBody(), { ip }));
      expect(res.status).toBe(201);
    }
    const res = await POST(postReq(validBody(), { ip }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe("Demasiadas solicitudes. Intenta nuevamente más tarde.");
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
