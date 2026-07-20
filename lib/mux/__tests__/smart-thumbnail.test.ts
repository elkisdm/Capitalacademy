import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pickSmartThumbnailTime } from "@/lib/mux/smart-thumbnail";

const ORIGINAL_ENV = process.env.OPENAI_API_KEY;

function mockOpenAIResponse(content: string, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: async () => "unknown error",
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

describe("pickSmartThumbnailTime", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIGINAL_ENV;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sin API key devuelve null", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await pickSmartThumbnailTime("pb123", 120);
    expect(result).toBeNull();
  });

  it("video corto (<30s) devuelve null", async () => {
    const result = await pickSmartThumbnailTime("pb123", 20);
    expect(result).toBeNull();
  });

  it("index:2 devuelve el timestamp del candidato 2", async () => {
    const fetchMock = mockOpenAIResponse(JSON.stringify({ index: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    const duration = 600;
    const expectedTimes = Array.from({ length: 6 }, (_, i) =>
      Math.round(duration * (0.1 + (0.75 * i) / 5)),
    );

    const result = await pickSmartThumbnailTime("pb123", duration);
    expect(result).toBe(expectedTimes[2]);
  });

  it("index:-1 devuelve null (ningún frame sirve)", async () => {
    const fetchMock = mockOpenAIResponse(JSON.stringify({ index: -1 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await pickSmartThumbnailTime("pb123", 300);
    expect(result).toBeNull();
  });

  it("respuesta no-JSON devuelve null", async () => {
    const fetchMock = mockOpenAIResponse("esto no es json");
    vi.stubGlobal("fetch", fetchMock);

    const result = await pickSmartThumbnailTime("pb123", 300);
    expect(result).toBeNull();
  });

  it("abort por presupuesto de tiempo devuelve null", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pickSmartThumbnailTime("pb123", 300, { budgetMs: 10 });
    expect(result).toBeNull();
  });
});
