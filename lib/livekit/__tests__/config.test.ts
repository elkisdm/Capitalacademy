import { describe, it, expect } from "vitest";
import { getLiveKitConfig, LiveKitNotConfiguredError } from "../config";

const completo = {
  LIVEKIT_URL: "wss://livekit.example",
  LIVEKIT_API_KEY: "APIkey",
  LIVEKIT_API_SECRET: "secreto",
};

describe("getLiveKitConfig", () => {
  it("lee las tres variables", () => {
    expect(getLiveKitConfig(completo)).toEqual({
      url: "wss://livekit.example",
      apiKey: "APIkey",
      apiSecret: "secreto",
    });
  });

  it("recorta espacios y saltos de línea", () => {
    // Un secreto pegado a mano en el panel del proveedor arrastra un salto, y
    // con él la firma sale distinta y el servidor rechaza todos los tokens.
    const cfg = getLiveKitConfig({ ...completo, LIVEKIT_API_SECRET: "  secreto\n" });
    expect(cfg.apiSecret).toBe("secreto");
  });

  it("nombra la variable que falta", () => {
    try {
      getLiveKitConfig({ ...completo, LIVEKIT_API_SECRET: undefined });
      throw new Error("debía lanzar");
    } catch (e) {
      expect(e).toBeInstanceOf(LiveKitNotConfiguredError);
      expect((e as LiveKitNotConfiguredError).missing).toEqual(["LIVEKIT_API_SECRET"]);
    }
  });

  it("junta todas las que falten en un solo error", () => {
    try {
      getLiveKitConfig({});
      throw new Error("debía lanzar");
    } catch (e) {
      expect((e as LiveKitNotConfiguredError).missing).toEqual([
        "LIVEKIT_URL",
        "LIVEKIT_API_KEY",
        "LIVEKIT_API_SECRET",
      ]);
    }
  });

  it("una variable vacía cuenta como faltante", () => {
    expect(() => getLiveKitConfig({ ...completo, LIVEKIT_URL: "   " })).toThrow(
      LiveKitNotConfiguredError,
    );
  });
});
