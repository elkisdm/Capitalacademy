import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mismo arnés de hooks que use-video-progress.test.ts: el módulo es un hook de
// React ("use client") y el proyecto NO tiene @testing-library/react ni jsdom
// (vitest.config.ts corre en entorno "node"). Se mockea "react" con una
// implementación mínima de useRef/useEffect/useCallback que reproduce lo
// indispensable: refs estables, efectos que corren al montar y limpian al
// desmontar, y callbacks que preservan el closure real del módulo.
// ---------------------------------------------------------------------------

type Cleanup = void | (() => void);
type EffectSlot = { cleanup?: () => void; deps?: unknown[] };

function createHookHarness() {
  const refs: { current: unknown }[] = [];
  const effectSlots: EffectSlot[] = [];
  let refCursor = 0;
  let effectCursor = 0;
  let pending: Array<() => void> = [];

  function useRefImpl<T>(initial: T): { current: T } {
    const idx = refCursor++;
    if (!(idx in refs)) refs[idx] = { current: initial };
    return refs[idx] as { current: T };
  }

  function useCallbackImpl<T>(fn: T): T {
    return fn;
  }

  function useEffectImpl(effect: () => Cleanup, deps?: unknown[]) {
    const idx = effectCursor++;
    const prev = effectSlots[idx];
    const depsChanged =
      !prev ||
      !deps ||
      !prev.deps ||
      deps.length !== prev.deps.length ||
      deps.some((d, i) => d !== prev.deps![i]);

    if (depsChanged) {
      pending.push(() => {
        prev?.cleanup?.();
        const cleanup = effect();
        effectSlots[idx] = { cleanup: cleanup ?? undefined, deps };
      });
    }
  }

  function render<T>(fn: () => T): T {
    refCursor = 0;
    effectCursor = 0;
    const value = fn();
    const toRun = pending;
    pending = [];
    toRun.forEach((run) => run());
    return value;
  }

  function unmount() {
    effectSlots.forEach((slot) => slot?.cleanup?.());
    effectSlots.length = 0;
  }

  return { useRefImpl, useCallbackImpl, useEffectImpl, render, unmount };
}

type HookHarness = ReturnType<typeof createHookHarness>;

const hoisted = vi.hoisted(() => ({
  activeHarness: null as HookHarness | null,
}));

vi.mock("react", () => ({
  useRef: (initial: unknown) => hoisted.activeHarness!.useRefImpl(initial),
  useEffect: (effect: () => Cleanup, deps?: unknown[]) =>
    hoisted.activeHarness!.useEffectImpl(effect, deps),
  useCallback: (fn: unknown) => hoisted.activeHarness!.useCallbackImpl(fn),
}));

const { useActividadTracker } = await import("@/lib/classroom/use-actividad-tracker");
const { ACTIVITY_BEAT_INTERVAL_MS } = await import("@/lib/classroom/actividad");

const ENDPOINT = "/api/classroom/actividad";

function setup(options?: Parameters<typeof useActividadTracker>[0]) {
  const harness = createHookHarness();
  hoisted.activeHarness = harness;
  harness.render(() => useActividadTracker(options));
  return { harness };
}

/** Cuerpo del latido n-ésimo, ya parseado. */
function bodyOf(fetchMock: ReturnType<typeof vi.fn>, call: number) {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

describe("useActividadTracker", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let doc: EventTarget & { visibilityState: string };
  let win: EventTarget;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    win = new EventTarget();
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", win);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ---- montaje -------------------------------------------------------------
  it("late al montar con resumed=true, que acredita cero tiempo", () => {
    setup();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ resumed: true });
  });

  it("incluye la cohorte cuando la ruta la tiene", () => {
    setup({ cohortSlug: "diplomado-g4" });

    expect(bodyOf(fetchMock, 0)).toEqual({ resumed: true, cohortSlug: "diplomado-g4" });
  });

  it("omite la cohorte fuera de una cohorte", () => {
    setup({ cohortSlug: undefined });

    expect(bodyOf(fetchMock, 0)).toEqual({ resumed: true });
  });

  it("NO late al montar si la pestaña ya está oculta", () => {
    // Medir con la pestaña al fondo convertiría "me olvidé de cerrar el
    // classroom" en ocho horas de uso.
    doc.visibilityState = "hidden";
    setup();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ---- intervalo -----------------------------------------------------------
  it("late en cada intervalo con resumed=false", () => {
    setup();
    fetchMock.mockClear();

    vi.advanceTimersByTime(ACTIVITY_BEAT_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock, 0)).toEqual({ resumed: false });

    vi.advanceTimersByTime(ACTIVITY_BEAT_INTERVAL_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("no late antes de que se cumpla el intervalo", () => {
    setup();
    fetchMock.mockClear();

    vi.advanceTimersByTime(ACTIVITY_BEAT_INTERVAL_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ---- visibilidad ---------------------------------------------------------
  it("al ocultarse manda un último latido con keepalive y detiene el intervalo", () => {
    setup();
    fetchMock.mockClear();

    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock, 0)).toEqual({ resumed: false });
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);

    // Ya detenido: el reloj puede correr y no debe salir ningún latido más.
    fetchMock.mockClear();
    vi.advanceTimersByTime(ACTIVITY_BEAT_INTERVAL_MS * 5);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("al volver a ser visible reabre el reloj con un latido de reanudación", () => {
    setup();
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    fetchMock.mockClear();

    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock, 0)).toEqual({ resumed: true });

    // Y el intervalo vuelve a correr.
    fetchMock.mockClear();
    vi.advanceTimersByTime(ACTIVITY_BEAT_INTERVAL_MS);
    expect(bodyOf(fetchMock, 0)).toEqual({ resumed: false });
  });

  it("no duplica el intervalo si llegan dos eventos 'visible' seguidos", () => {
    setup();
    fetchMock.mockClear();

    doc.dispatchEvent(new Event("visibilitychange"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(fetchMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(ACTIVITY_BEAT_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("estando oculto, un segundo evento 'hidden' no manda otro latido", () => {
    setup();
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    fetchMock.mockClear();

    doc.dispatchEvent(new Event("visibilitychange"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ---- descargue de la página ----------------------------------------------
  it("pagehide manda el último latido con keepalive", () => {
    setup();
    fetchMock.mockClear();

    win.dispatchEvent(new Event("pagehide"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
    expect(bodyOf(fetchMock, 0)).toEqual({ resumed: false });
  });

  it("pagehide con el reloj ya detenido no manda nada", () => {
    doc.visibilityState = "hidden";
    setup();

    win.dispatchEvent(new Event("pagehide"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ---- degradación ---------------------------------------------------------
  it("no lanza cuando el latido falla por red", () => {
    fetchMock.mockReturnValue(Promise.reject(new Error("network down")));

    expect(() => setup()).not.toThrow();
    expect(() =>
      vi.advanceTimersByTime(ACTIVITY_BEAT_INTERVAL_MS),
    ).not.toThrow();
  });

  it("no lanza cuando fetch revienta de forma síncrona", () => {
    fetchMock.mockImplementation(() => {
      throw new Error("fetch no disponible");
    });

    expect(() => setup()).not.toThrow();
  });

  // ---- desmontaje ----------------------------------------------------------
  it("al desmontar detiene el intervalo y suelta los listeners", () => {
    const { harness } = setup();
    fetchMock.mockClear();

    harness.unmount();

    vi.advanceTimersByTime(ACTIVITY_BEAT_INTERVAL_MS * 3);
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("pagehide"));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
