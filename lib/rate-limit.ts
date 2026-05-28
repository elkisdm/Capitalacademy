type RateLimitEntry = { count: number; resetAt: number };

export type RateLimiterConfig = {
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

export function createRateLimiter(config: RateLimiterConfig) {
  const store = new Map<string, RateLimitEntry>();
  const CLEANUP_INTERVAL = 60_000;
  let lastCleanup = Date.now();

  function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    for (const [key, entry] of store) {
      if (entry.resetAt < now) store.delete(key);
    }
  }

  return {
    check(key: string): RateLimitResult {
      cleanup();
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || entry.resetAt < now) {
        const resetAt = now + config.windowSeconds * 1000;
        store.set(key, { count: 1, resetAt });
        return { ok: true, remaining: config.limit - 1, resetAt };
      }

      entry.count++;
      if (entry.count > config.limit) {
        return { ok: false, remaining: 0, resetAt: entry.resetAt };
      }

      return {
        ok: true,
        remaining: config.limit - entry.count,
        resetAt: entry.resetAt,
      };
    },
  };
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function rateLimitResponse(result: RateLimitResult) {
  const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
  return Response.json(
    { error: "Demasiadas solicitudes. Intenta nuevamente más tarde." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(retryAfter, 1)) },
    },
  );
}
