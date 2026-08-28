import { describe, it, expect, afterEach, vi } from "vitest";
import { GET } from "@/app/agendar/liderazgo/route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /agendar/liderazgo", () => {
  it("redirige a la página de citas configurada", () => {
    vi.stubEnv("LIDERAZGO_AGENDA_URL", "https://calendar.app.google/abc123");
    const res = GET(new Request("https://capitalacademy.cl/agendar/liderazgo"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://calendar.app.google/abc123");
  });

  it("sin la variable (o con un valor que no es URL) cae en la landing", () => {
    vi.stubEnv("LIDERAZGO_AGENDA_URL", "");
    let res = GET(new Request("https://capitalacademy.cl/agendar/liderazgo"));
    expect(res.headers.get("location")).toBe("https://capitalacademy.cl/liderazgo");
    vi.stubEnv("LIDERAZGO_AGENDA_URL", "javascript:alert(1)");
    res = GET(new Request("https://capitalacademy.cl/agendar/liderazgo"));
    expect(res.headers.get("location")).toBe("https://capitalacademy.cl/liderazgo");
  });
});
