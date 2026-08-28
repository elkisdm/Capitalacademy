import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enviarPlantilla, WhatsAppCloudError } from "@/lib/whatsapp/cloud-api";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1243481052177734");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token-de-prueba");
  vi.stubEnv("WHATSAPP_CLOUD_API_VERSION", "v21.0");
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function respuesta(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

describe("enviarPlantilla", () => {
  it("arma el payload de plantilla contra el número emisor y quita el '+'", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { messages: [{ id: "wamid.abc" }] }));
    const r = await enviarPlantilla({
      to: "+56912345678",
      template: "liderazgo_reunion_directora",
      bodyParams: ["Ana"],
    });
    expect(r).toEqual({ messageId: "wamid.abc" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/1243481052177734/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-de-prueba");
    const body = JSON.parse(String(init.body));
    expect(body.to).toBe("56912345678");
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("liderazgo_reunion_directora");
    expect(body.template.language.code).toBe("es");
    expect(body.template.components[0].parameters).toEqual([{ type: "text", text: "Ana" }]);
  });

  it("traduce el error de Meta a un mensaje legible con su código", async () => {
    fetchMock.mockResolvedValue(
      respuesta(400, { error: { code: 132001, message: "Template name does not exist" } }),
    );
    await expect(
      enviarPlantilla({ to: "56912345678", template: "x", bodyParams: [] }),
    ).rejects.toMatchObject({ name: "WhatsAppCloudError", status: 400, message: /132001.*does not exist/ });
  });

  it("un fallo de red se reporta sin status", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      enviarPlantilla({ to: "56912345678", template: "x", bodyParams: [] }),
    ).rejects.toMatchObject({ status: null, message: /ECONNRESET/ });
  });

  it("sin credenciales lanza antes de llamar a Meta", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    await expect(
      enviarPlantilla({ to: "56912345678", template: "x", bodyParams: [] }),
    ).rejects.toBeInstanceOf(WhatsAppCloudError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
