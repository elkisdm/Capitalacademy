import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * La puerta de los invitados sin cuenta (ADR-0035, migración 0099).
 *
 * Es la única ruta que le crea una fila a alguien no autenticado, así que lo que
 * se protege acá es que no se pueda usar para nada más que lo previsto: sondear
 * qué códigos de reunión existen, colarse en una clase real, o llenarle el panel
 * al docente.
 */

const mockSession = vi.fn();
const mockGuest = vi.fn();
const mockInsert = vi.fn();
const mockCookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mockCookieGet }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: table === "class_sessions" ? mockSession : mockGuest,
        };
        return chain;
      },
      insert: (row: unknown) => ({
        select: () => ({ single: () => mockInsert(row) }),
      }),
    }),
  }),
}));

const { GET, POST } = await import("@/app/api/sala/[code]/invitado/route");

const AHORA = new Date("2026-08-18T15:30:00Z");
const CODIGO = "hde-qmzh-qwj";

/**
 * El limitador es por IP y vive a nivel de módulo: si todos los tests salieran
 * de la misma, el sexto daría 429 por una razón ajena a lo que prueba.
 */
let ips = 0;
function req(body?: unknown, code: string = CODIGO, ip?: string) {
  return [
    new Request(`http://localhost/api/sala/${code}/invitado`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "x-forwarded-for": ip ?? `10.0.0.${++ips}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ code }) },
  ] as const;
}

/** Sala abierta, en plena clase, salvo que el test diga otra cosa. */
function salaAbierta(overrides: Record<string, unknown> = {}) {
  mockSession.mockResolvedValue({
    data: {
      id: "ses-uuid-real",
      cohort_id: "cohorte-1",
      starts_at: "2026-08-18T15:00:00Z",
      ends_at: "2026-08-18T17:00:00Z",
      modality: "live_online",
      guest_access: true,
      ...overrides,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);

  salaAbierta();
  mockGuest.mockResolvedValue({ data: null });
  mockCookieGet.mockReturnValue(undefined);
  mockInsert.mockResolvedValue({ data: { id: "guest-uuid-1", status: "pending" }, error: null });
});

describe("POST /api/sala/[code]/invitado", () => {
  it("registra la solicitud y deja la cookie con la credencial", async () => {
    const res = await POST(...req({ nombre: "Diego" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: "pending", nombre: "Diego" });

    expect(mockInsert).toHaveBeenCalledWith({
      session_id: "ses-uuid-real",
      display_name: "Diego",
    });

    // Se lee del header y no de `res.cookies` porque la ruta puede devolver un
    // Response pelado (`rateLimitResponse`), así que el tipo de la unión no
    // tiene `cookies`. El Set-Cookie es además lo que realmente ve el navegador.
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("ca_guest_ses-uuid-real=guest-uuid-1");
    // No la puede leer el JavaScript de la página: es una credencial.
    expect(setCookie).toContain("HttpOnly");
  });

  it("nace pendiente: pedir entrar NO entrega ningún token", async () => {
    const res = await POST(...req({ nombre: "Diego" }));
    const body = await res.json();
    expect(body.estado).toBe("pending");
    expect(body.token).toBeUndefined();
  });

  it("una sala que no admite invitados responde como si no existiera", async () => {
    salaAbierta({ guest_access: false });

    const res = await POST(...req({ nombre: "Diego" }));
    expect(res.status).toBe(404);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("no crea nada fuera de la ventana de la sala", async () => {
    vi.setSystemTime(new Date("2026-08-18T19:30:00Z"));

    const res = await POST(...req({ nombre: "Diego" }));
    expect(res.status).toBe(409);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("no crea nada si la clase no es en vivo", async () => {
    salaAbierta({ modality: "recorded" });

    const res = await POST(...req({ nombre: "Diego" }));
    expect(res.status).toBe(409);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("exige un nombre razonable", async () => {
    expect((await POST(...req({ nombre: "D" }))).status).toBe(400);
    expect((await POST(...req({ nombre: "   " }))).status).toBe(400);
    expect((await POST(...req({}))).status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("guarda el nombre saneado, no el que llegó", async () => {
    await POST(...req({ nombre: "  Diego   Pérez  " }));
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: "Diego Pérez" }),
    );
  });

  it("reutiliza la solicitud existente en vez de crear otra", async () => {
    mockCookieGet.mockReturnValue({ value: "guest-uuid-1" });
    mockGuest.mockResolvedValue({
      data: { id: "guest-uuid-1", display_name: "Diego", status: "pending" },
    });

    const res = await POST(...req({ nombre: "Diego" }));
    expect(res.status).toBe(200);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("a quien fue rechazado no le sirve reenviar el formulario con otro nombre", async () => {
    mockCookieGet.mockReturnValue({ value: "guest-uuid-1" });
    mockGuest.mockResolvedValue({
      data: { id: "guest-uuid-1", display_name: "Diego", status: "denied" },
    });

    const res = await POST(...req({ nombre: "Otro Nombre" }));
    expect((await res.json()).estado).toBe("denied");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("corta a quien insiste: 5 por minuto y por IP", async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < 5; i++) {
      expect((await POST(...req({ nombre: "Diego" }, CODIGO, ip))).status).toBe(200);
    }
    expect((await POST(...req({ nombre: "Diego" }, CODIGO, ip))).status).toBe(429);
  });

  it("no consulta la base con una referencia que no es código ni UUID", async () => {
    const res = await POST(...req({ nombre: "Diego" }, "../../etc/passwd"));
    expect(res.status).toBe(404);
    expect(mockSession).not.toHaveBeenCalled();
  });
});

describe("GET /api/sala/[code]/invitado", () => {
  it("dice 'none' cuando todavía no pidió entrar", async () => {
    const res = await GET(...req());
    expect(await res.json()).toEqual({ estado: "none", nombre: null });
  });

  it("informa el estado de su solicitud", async () => {
    mockCookieGet.mockReturnValue({ value: "guest-uuid-1" });
    mockGuest.mockResolvedValue({
      data: { id: "guest-uuid-1", display_name: "Diego", status: "approved" },
    });

    const res = await GET(...req());
    expect(await res.json()).toEqual({ estado: "approved", nombre: "Diego" });
  });

  it("no responde por una sala cerrada a invitados", async () => {
    salaAbierta({ guest_access: false });
    expect((await GET(...req())).status).toBe(404);
  });
});
