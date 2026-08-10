import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "whsec_dGVzdC1zZWNyZXQtcGFyYS1sb3MtdGVzdHM=";

// ── Mock del cliente admin ────────────────────────────────────
// Se captura el update para poder afirmar QUÉ se escribió y contra qué fila.

const mockUpdate = vi.fn();
const mockEq = vi.fn();
let updateResult: { data: unknown; error: { message: string } | null } = {
  data: [{ id: "log-1" }],
  error: null,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      update: (values: unknown) => {
        mockUpdate(table, values);
        return {
          eq: (column: string, value: unknown) => {
            mockEq(column, value);
            return { select: () => Promise.resolve(updateResult) };
          },
        };
      },
    }),
  }),
}));

const { POST } = await import("@/app/api/webhooks/resend/route");

/** Firma el cuerpo igual que Svix: HMAC-SHA256 sobre `<id>.<ts>.<body>`. */
function signedRequest(
  payload: unknown,
  {
    secret = SECRET,
    timestamp = Math.floor(Date.now() / 1000),
    id = "msg_test",
    signature,
  }: { secret?: string; timestamp?: number; id?: string; signature?: string } = {},
) {
  const body = JSON.stringify(payload);
  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const computed = createHmac("sha256", Buffer.from(rawSecret, "base64"))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");

  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(timestamp),
      "svix-signature": signature ?? `v1,${computed}`,
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  updateResult = { data: [{ id: "log-1" }], error: null };
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.RESEND_WEBHOOK_SECRET;
});

describe("POST /api/webhooks/resend", () => {
  it("responde 500 si el secreto no está configurado, sin tocar la bitácora", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(signedRequest({ type: "email.delivered" }));

    expect(res.status).toBe(500);
    expect(mockUpdate).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("rechaza una firma inválida con 401", async () => {
    const res = await POST(
      signedRequest({ type: "email.delivered", data: { email_id: "email_1" } }, {
        signature: "v1,firma-falsa",
      }),
    );

    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rechaza una firma calculada con otro secreto", async () => {
    const res = await POST(
      signedRequest({ type: "email.delivered", data: { email_id: "email_1" } }, {
        secret: "whsec_b3Ryby1zZWNyZXRvLWRpc3RpbnRv",
      }),
    );

    expect(res.status).toBe(401);
  });

  it("rechaza un evento con timestamp viejo (ataque de repetición)", async () => {
    const hace10Min = Math.floor(Date.now() / 1000) - 600;
    const res = await POST(
      signedRequest({ type: "email.delivered", data: { email_id: "email_1" } }, {
        timestamp: hace10Min,
      }),
    );

    expect(res.status).toBe(401);
  });

  it("rechaza cuando faltan los headers de firma", async () => {
    const res = await POST(
      new Request("http://localhost/api/webhooks/resend", {
        method: "POST",
        body: JSON.stringify({ type: "email.delivered" }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("rechaza un timestamp que no es número", async () => {
    // Sin el chequeo de NaN, `Math.abs(NaN) > ventana` es false y el evento se
    // colaría a la verificación de firma con el timestamp corrupto adentro.
    const req = signedRequest({ type: "email.delivered", data: { email_id: "e1" } });
    req.headers.set("svix-timestamp", "no-es-un-numero");

    expect((await POST(req)).status).toBe(401);
  });

  it("rechaza cuando falta solo la firma y el resto de los headers está", async () => {
    const req = signedRequest({ type: "email.delivered", data: { email_id: "e1" } });
    req.headers.delete("svix-signature");

    expect((await POST(req)).status).toBe(401);
  });

  it("acepta un secreto configurado sin el prefijo whsec_", async () => {
    // Resend muestra el secreto con prefijo, pero quien lo copia a Netlify a
    // veces lo pega sin él. Se firma con los mismos bytes en los dos casos.
    const sinPrefijo = SECRET.slice(6);
    process.env.RESEND_WEBHOOK_SECRET = sinPrefijo;

    const res = await POST(
      signedRequest({ type: "email.delivered", data: { email_id: "e1" } }, {
        secret: sinPrefijo,
      }),
    );

    expect(res.status).toBe(200);
  });

  it("acepta cuando el header trae varias versiones y solo una calza", async () => {
    // Durante una rotación de secreto, Svix manda las dos firmas separadas por
    // espacio. Basta que UNA coincida.
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "e1" } });
    const buena = createHmac("sha256", Buffer.from(SECRET.slice(6), "base64"))
      .update(`msg_test.${timestamp}.${body}`)
      .digest("base64");

    const res = await POST(
      new Request("http://localhost/api/webhooks/resend", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "svix-id": "msg_test",
          "svix-timestamp": String(timestamp),
          "svix-signature": `v1,firma-vieja-que-no-calza v1,${buena}`,
        },
        body,
      }),
    );

    expect(res.status).toBe(200);
  });

  it("acepta una firma sin la etiqueta de versión", async () => {
    const res = await POST(
      signedRequest({ type: "email.delivered", data: { email_id: "e1" } }, {
        // Mismo valor que calcula `signedRequest`, pero sin el `v1,` adelante.
        signature: createHmac("sha256", Buffer.from(SECRET.slice(6), "base64"))
          .update(
            `msg_test.${Math.floor(Date.now() / 1000)}.${JSON.stringify({
              type: "email.delivered",
              data: { email_id: "e1" },
            })}`,
          )
          .digest("base64"),
      }),
    );

    expect(res.status).toBe(200);
  });

  it("responde 0 actualizaciones cuando la escritura no devuelve filas", async () => {
    // `data` en null con `error` en null: sin el `?? 0` la respuesta llevaría
    // `updated: undefined` y se perdería en el JSON.
    updateResult = { data: null, error: null };

    const res = await POST(
      signedRequest({ type: "email.bounced", data: { email_id: "e1" } }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: 0 });
  });

  it("marca la entrega con su hora cuando llega email.delivered", async () => {
    const res = await POST(
      signedRequest({ type: "email.delivered", data: { email_id: "email_abc" } }),
    );

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      "access_email_log",
      expect.objectContaining({ delivery_status: "delivered" }),
    );
    const values = mockUpdate.mock.calls[0][1] as { delivered_at: string | null };
    expect(values.delivered_at).toBeTruthy();
    expect(mockEq).toHaveBeenCalledWith("provider_message_id", "email_abc");
  });

  it("marca el rebote sin hora de entrega", async () => {
    await POST(signedRequest({ type: "email.bounced", data: { email_id: "email_abc" } }));

    expect(mockUpdate).toHaveBeenCalledWith("access_email_log", {
      delivery_status: "bounced",
      delivered_at: null,
    });
  });

  it("marca la queja por spam", async () => {
    await POST(signedRequest({ type: "email.complained", data: { email_id: "email_x" } }));

    expect(mockUpdate).toHaveBeenCalledWith(
      "access_email_log",
      expect.objectContaining({ delivery_status: "complained" }),
    );
  });

  it("ignora eventos que no hablan de entrega, sin escribir nada", async () => {
    const res = await POST(
      signedRequest({ type: "email.sent", data: { email_id: "email_abc" } }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: true });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("ignora un evento de entrega sin email_id", async () => {
    const res = await POST(signedRequest({ type: "email.delivered", data: {} }));

    expect(res.status).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("acepta con 0 actualizaciones el correo de otro proyecto de la cuenta compartida", async () => {
    // La cuenta de Resend es común a Capital Inteligente: llegan eventos que no
    // son nuestros. No coinciden con ninguna fila y no deben reintentarse.
    updateResult = { data: [], error: null };

    const res = await POST(
      signedRequest({ type: "email.delivered", data: { email_id: "email_de_brekto" } }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: 0 });
  });

  it("responde 500 si la escritura falla, para que Resend reintente", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    updateResult = { data: null, error: { message: "timeout" } };

    const res = await POST(
      signedRequest({ type: "email.delivered", data: { email_id: "email_abc" } }),
    );

    expect(res.status).toBe(500);
    consoleErrorSpy.mockRestore();
  });

  it("responde 400 cuando el cuerpo firmado no es JSON válido", async () => {
    const body = "no-es-json{";
    const timestamp = Math.floor(Date.now() / 1000);
    const computed = createHmac("sha256", Buffer.from(SECRET.slice(6), "base64"))
      .update(`msg_test.${timestamp}.${body}`)
      .digest("base64");

    const res = await POST(
      new Request("http://localhost/api/webhooks/resend", {
        method: "POST",
        headers: {
          "svix-id": "msg_test",
          "svix-timestamp": String(timestamp),
          "svix-signature": `v1,${computed}`,
        },
        body,
      }),
    );

    expect(res.status).toBe(400);
  });
});
