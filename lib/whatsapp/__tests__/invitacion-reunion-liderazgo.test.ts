import { describe, it, expect, vi, beforeEach } from "vitest";

const enviarPlantillaMock = vi.fn();
vi.mock("@/lib/whatsapp/cloud-api", () => ({
  enviarPlantilla: enviarPlantillaMock,
}));

const { enviarInvitacionReunion, debeInvitar, nombreDePila } = await import(
  "@/lib/whatsapp/invitacion-reunion-liderazgo"
);

const insertSpy = vi.fn(async (_row: unknown): Promise<{ error: unknown }> => ({ error: null }));
const supabase = { from: (_t: string) => ({ insert: insertSpy }) } as never;
const lead = { id: "lead-1", full_name: "Ana María Pérez", phone: "912345678" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("debeInvitar", () => {
  it("solo la landing de Liderazgo", () => {
    expect(debeInvitar({ program_interest: "liderazgo", source: "landing-liderazgo" })).toBe(true);
    expect(debeInvitar({ program_interest: "diplomado", source: "landing-diplomado" })).toBe(false);
    expect(debeInvitar({ program_interest: "liderazgo", source: "calculadora" })).toBe(false);
    expect(debeInvitar({ program_interest: "liderazgo", source: null })).toBe(false);
  });
});

describe("nombreDePila", () => {
  it("toma la primera palabra", () => {
    expect(nombreDePila("  Ana María Pérez ")).toBe("Ana");
    expect(nombreDePila("Ana")).toBe("Ana");
  });
});

describe("enviarInvitacionReunion", () => {
  it("envía la plantilla al teléfono normalizado y registra el envío en la bitácora", async () => {
    enviarPlantillaMock.mockResolvedValue({ messageId: "wamid.1" });
    const r = await enviarInvitacionReunion(supabase, lead);
    expect(r).toEqual({ ok: true, messageId: "wamid.1" });
    expect(enviarPlantillaMock).toHaveBeenCalledWith({
      to: "56912345678",
      template: "liderazgo_reunion_directora",
      bodyParams: ["Ana"],
    });
    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.lead_id).toBe("lead-1");
    expect(row.kind).toBe("whatsapp");
    expect(row.created_by).toBeNull();
    expect(row.body).toMatch(/enviada, id wamid\.1/);
  });

  it("si Meta falla, no lanza y deja el error en la bitácora", async () => {
    enviarPlantillaMock.mockRejectedValue(new Error("Meta respondió 132001: no existe"));
    const r = await enviarInvitacionReunion(supabase, lead);
    expect(r).toEqual({ ok: false, error: "Meta respondió 132001: no existe" });
    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.kind).toBe("whatsapp");
    expect(row.body).toMatch(/NO enviada: Meta respondió 132001/);
  });

  it("si la bitácora falla, el resultado del envío se conserva", async () => {
    enviarPlantillaMock.mockResolvedValue({ messageId: null });
    insertSpy.mockResolvedValueOnce({ error: { message: "rls" } });
    const r = await enviarInvitacionReunion(supabase, lead);
    expect(r).toEqual({ ok: true, messageId: null });
  });
});
