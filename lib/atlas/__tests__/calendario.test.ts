import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  eventIdParaTarea,
  finDeReunion,
  crearReunion,
  cancelarReunion,
  AtlasCalendarError,
  BUZON_REUNIONES,
} from "@/lib/atlas/calendario";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ATLAS_API_URL", "https://atlas.test/");
  vi.stubEnv("ATLAS_API_KEY", "secreta");
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number, body: unknown) => ({ ok: false, status, json: async () => body });

describe("eventIdParaTarea", () => {
  it("convierte el uuid en algo que Google acepta", () => {
    // base32hex admite solo a-v y 0-9; el hex de un uuid (0-9a-f) es subconjunto.
    const id = eventIdParaTarea("6064b11e-556c-4609-be14-9446037e6af7");
    expect(id).toBe("6064b11e556c4609be149446037e6af7");
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
  });

  it("es estable: el mismo uuid da el mismo id, y por eso el reintento no duplica", () => {
    const uuid = "6064b11e-556c-4609-be14-9446037e6af7";
    expect(eventIdParaTarea(uuid)).toBe(eventIdParaTarea(uuid));
  });

  it("normaliza mayúsculas", () => {
    expect(eventIdParaTarea("ABCDEF01-2345-6789-ABCD-EF0123456789")).toMatch(/^[a-v0-9]+$/);
  });
});

describe("finDeReunion", () => {
  it("suma la duración al inicio", () => {
    expect(finDeReunion("2026-08-27T15:00:00.000Z", 45)).toBe("2026-08-27T15:45:00.000Z");
  });

  it("cruza la medianoche sin perder el día", () => {
    expect(finDeReunion("2026-08-27T23:30:00.000Z", 60)).toBe("2026-08-28T00:30:00.000Z");
  });
});

describe("crearReunion", () => {
  const input = {
    taskId: "6064b11e-556c-4609-be14-9446037e6af7",
    titulo: "Reunión con Ana",
    inicioIso: "2026-08-27T15:00:00.000Z",
    duracionMinutos: 45,
    correoInvitado: "ana@example.cl",
  };

  it("manda el buzón, el id derivado y el fin calculado", async () => {
    fetchMock.mockResolvedValue(ok({ event_id: "abc", meet_url: "https://meet.google.com/x" }));
    await crearReunion(input);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://atlas.test/calendar/events");
    expect(init.headers["X-API-Key"]).toBe("secreta");
    const body = JSON.parse(init.body);
    expect(body.mailbox).toBe(BUZON_REUNIONES);
    expect(body.event_id).toBe("6064b11e556c4609be149446037e6af7");
    expect(body.end_iso).toBe("2026-08-27T15:45:00.000Z");
    expect(body.attendee_email).toBe("ana@example.cl");
  });

  it("devuelve el Meet y si el evento ya existía", async () => {
    fetchMock.mockResolvedValue(
      ok({ event_id: "abc", meet_url: "https://meet.google.com/x", html_link: "h", already_existed: true }),
    );
    await expect(crearReunion(input)).resolves.toEqual({
      eventId: "abc",
      meetUrl: "https://meet.google.com/x",
      htmlLink: "h",
      yaExistia: true,
    });
  });

  it("tolera una respuesta sin Meet", async () => {
    fetchMock.mockResolvedValue(ok({ event_id: "abc" }));
    const r = await crearReunion(input);
    expect(r.meetUrl).toBeNull();
    expect(r.yaExistia).toBe(false);
  });

  it("no confía en tipos ajenos: un meet_url que no es string se descarta", async () => {
    fetchMock.mockResolvedValue(ok({ event_id: "abc", meet_url: 42 }));
    expect((await crearReunion(input)).meetUrl).toBeNull();
  });

  it("propaga el motivo que dio Atlas", async () => {
    fetchMock.mockResolvedValue(fail(422, { detail: "Buzon no habilitado para agendar" }));
    await expect(crearReunion(input)).rejects.toThrow("Buzon no habilitado para agendar");
  });

  it("una respuesta de error sin cuerpo igual dice algo útil", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => { throw new Error("x"); } });
    await expect(crearReunion(input)).rejects.toThrow("503");
  });

  it("si Atlas omite el event_id, se cae al derivado de la tarea", async () => {
    fetchMock.mockResolvedValue(ok({ meet_url: "https://meet.google.com/x" }));
    expect((await crearReunion(input)).eventId).toBe("6064b11e556c4609be149446037e6af7");
  });

  it("un rechazo que no es Error igual da un mensaje legible", async () => {
    fetchMock.mockRejectedValue("se cayó la red");
    await expect(crearReunion(input)).rejects.toThrow("se cayó la red");
  });

  it("Atlas inalcanzable se distingue de Atlas rechazando", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(crearReunion(input)).rejects.toMatchObject({
      name: "AtlasCalendarError",
      status: null,
    });
  });

  it("sin configuración falla antes de tocar la red", async () => {
    vi.stubEnv("ATLAS_API_URL", "");
    await expect(crearReunion(input)).rejects.toThrow(AtlasCalendarError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("cancelarReunion", () => {
  it("pide el borrado con el buzón correcto", async () => {
    fetchMock.mockResolvedValue(ok({ ok: true, deleted: true }));
    await expect(cancelarReunion("abc12")).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/calendar/events/abc12");
    expect(url).toContain(encodeURIComponent(BUZON_REUNIONES));
    expect(init.method).toBe("DELETE");
  });

  it("false cuando el evento ya no estaba", async () => {
    fetchMock.mockResolvedValue(ok({ ok: true, deleted: false }));
    await expect(cancelarReunion("abc12")).resolves.toBe(false);
  });

  it("propaga el error de Atlas", async () => {
    fetchMock.mockResolvedValue(fail(500, { detail: "boom" }));
    await expect(cancelarReunion("abc12")).rejects.toThrow("boom");
  });
});
