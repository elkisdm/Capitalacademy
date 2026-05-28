import { describe, it, expect } from "vitest";
import { createRateLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows requests within the limit", () => {
    const limiter = createRateLimiter({ limit: 3, windowSeconds: 60 });

    const r1 = limiter.check("ip-1");
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.check("ip-1");
    expect(r2.ok).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check("ip-1");
    expect(r3.ok).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks requests exceeding the limit", () => {
    const limiter = createRateLimiter({ limit: 2, windowSeconds: 60 });

    limiter.check("ip-2");
    limiter.check("ip-2");

    const r3 = limiter.check("ip-2");
    expect(r3.ok).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.resetAt).toBeGreaterThan(Date.now());
  });

  it("tracks different keys independently", () => {
    const limiter = createRateLimiter({ limit: 1, windowSeconds: 60 });

    const r1 = limiter.check("key-a");
    expect(r1.ok).toBe(true);

    const r2 = limiter.check("key-b");
    expect(r2.ok).toBe(true);

    const r3 = limiter.check("key-a");
    expect(r3.ok).toBe(false);
  });

  it("resets after the window expires", async () => {
    const limiter = createRateLimiter({ limit: 1, windowSeconds: 1 });

    const r1 = limiter.check("ip-3");
    expect(r1.ok).toBe(true);

    const r2 = limiter.check("ip-3");
    expect(r2.ok).toBe(false);

    await new Promise((r) => setTimeout(r, 1100));

    const r3 = limiter.check("ip-3");
    expect(r3.ok).toBe(true);
  });
});

describe("getClientIp", () => {
  it("extracts IP from x-forwarded-for header", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "9.8.7.6" },
    });
    expect(getClientIp(req)).toBe("9.8.7.6");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("unknown");
  });
});

describe("rateLimitResponse", () => {
  it("returns 429 with Retry-After header", async () => {
    const result = {
      ok: false as const,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    };
    const res = rateLimitResponse(result);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    const json = await res.json();
    expect(json.error).toContain("Demasiadas solicitudes");
  });

  it("sets Retry-After to at least 1 even if window already expired", async () => {
    const result = {
      ok: false as const,
      remaining: 0,
      resetAt: Date.now() - 1000,
    };
    const res = rateLimitResponse(result);
    expect(Number(res.headers.get("Retry-After"))).toBe(1);
  });
});
