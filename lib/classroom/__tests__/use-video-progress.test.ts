import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Este módulo es un hook de React ("use client") y el proyecto NO tiene
// @testing-library/react ni jsdom (vitest.config.ts corre en entorno "node").
// Para poder ejercitar el ciclo montaje → efectos → desmontaje sin agregar
// dependencias nuevas, mockeamos "react" con una implementación mínima de
// useRef/useEffect/useCallback (un "arnés" de hooks) que reproduce lo
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

const { useVideoProgress } = await import("@/lib/classroom/use-video-progress");

function setup(options: Parameters<typeof useVideoProgress>[0]) {
  const harness = createHookHarness();
  hoisted.activeHarness = harness;
  const result = harness.render(() => useVideoProgress(options));
  return { result, harness };
}

describe("useVideoProgress", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let doc: EventTarget & { visibilityState: string };
  let win: EventTarget;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
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

  describe("flush", () => {
    it("no hace fetch cuando durationSeconds es 0", async () => {
      const { result } = setup({ lessonId: "l1", durationSeconds: 0 });
      await result.flush();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("hace PATCH con el body correcto y traduce la respuesta a watchPercentage/completed", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ watch_percentage: 42, completed: false }),
      });
      const onProgressUpdate = vi.fn();
      const { result } = setup({
        lessonId: "leccion-1",
        durationSeconds: 300,
        initialPosition: 30,
        onProgressUpdate,
      });

      await result.flush();

      expect(fetchMock).toHaveBeenCalledWith("/api/classroom/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: "leccion-1",
          playbackPositionSeconds: 30,
          durationSeconds: 300,
        }),
      });
      expect(onProgressUpdate).toHaveBeenCalledWith({
        watchPercentage: 42,
        completed: false,
      });
    });

    it("no llama onProgressUpdate cuando la respuesta no es ok", async () => {
      const jsonSpy = vi.fn();
      fetchMock.mockResolvedValueOnce({ ok: false, json: jsonSpy });
      const onProgressUpdate = vi.fn();
      const { result } = setup({
        lessonId: "l1",
        durationSeconds: 100,
        onProgressUpdate,
      });

      await result.flush();

      expect(jsonSpy).not.toHaveBeenCalled();
      expect(onProgressUpdate).not.toHaveBeenCalled();
    });

    it("no lanza y no llama onProgressUpdate cuando fetch rechaza (error de red)", async () => {
      fetchMock.mockRejectedValueOnce(new Error("network down"));
      const onProgressUpdate = vi.fn();
      const { result } = setup({
        lessonId: "l1",
        durationSeconds: 100,
        onProgressUpdate,
      });

      await expect(result.flush()).resolves.toBeUndefined();
      expect(onProgressUpdate).not.toHaveBeenCalled();
    });

    it("una llamada concurrente durante un flush en vuelo se reencola y corre después con la posición más reciente", async () => {
      let resolveFirst!: (value: unknown) => void;
      const firstResponse = new Promise((resolve) => {
        resolveFirst = resolve;
      });
      fetchMock
        .mockImplementationOnce(() => firstResponse)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ watch_percentage: 99, completed: true }),
        });

      const onProgressUpdate = vi.fn();
      const { result } = setup({
        lessonId: "l1",
        durationSeconds: 100,
        initialPosition: 5,
        onProgressUpdate,
      });

      const p1 = result.flush(); // arranca y queda "en vuelo" esperando firstResponse
      result.handleTimeUpdate(40); // la posición cambia mientras el primer flush sigue pendiente
      const p2 = result.flush(); // debe reencolarse (flushPending) sin generar un 2º fetch todavía

      expect(fetchMock).toHaveBeenCalledTimes(1);

      resolveFirst({
        ok: true,
        json: async () => ({ watch_percentage: 5, completed: false }),
      });
      await p1;
      await p2;
      // deja correr la recursión interna (finally -> flush()) que dispara el 2º fetch
      await vi.advanceTimersByTimeAsync(0);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/classroom/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: "l1",
          playbackPositionSeconds: 40,
          durationSeconds: 100,
        }),
      });
      expect(onProgressUpdate).toHaveBeenLastCalledWith({
        watchPercentage: 99,
        completed: true,
      });
    });
  });

  describe("flushOnUnload (vía visibilitychange/pagehide)", () => {
    it("no hace fetch cuando durationSeconds es 0", () => {
      setup({ lessonId: "l1", durationSeconds: 0 });
      win.dispatchEvent(new Event("pagehide"));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("ocultar la pestaña (visibilitychange=hidden) dispara un PATCH con keepalive", () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
      setup({ lessonId: "l1", durationSeconds: 100, initialPosition: 7 });

      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));

      expect(fetchMock).toHaveBeenCalledWith("/api/classroom/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: "l1",
          playbackPositionSeconds: 7,
          durationSeconds: 100,
        }),
        keepalive: true,
      });
    });

    it("volver a visible no dispara ningún flush", () => {
      setup({ lessonId: "l1", durationSeconds: 100 });
      doc.visibilityState = "visible";
      doc.dispatchEvent(new Event("visibilitychange"));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("pagehide dispara un flushOnUnload", () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
      setup({ lessonId: "l1", durationSeconds: 100 });
      win.dispatchEvent(new Event("pagehide"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("un rechazo de red en flushOnUnload se maneja internamente y no bloquea flushes posteriores", async () => {
      // flushOnUnload encadena su propio `.catch()`/`.finally()` sobre la
      // promesa de fetch(), así que un rechazo de red no se filtra como
      // Unhandled Promise Rejection y el mutex (isFlushing) queda liberado
      // para el siguiente flush.
      fetchMock.mockImplementationOnce(() => Promise.reject(new Error("network down")));
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ watch_percentage: 10, completed: false }),
      });

      const onProgressUpdate = vi.fn();
      const { result } = setup({
        lessonId: "l1",
        durationSeconds: 100,
        onProgressUpdate,
      });

      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));

      await vi.advanceTimersByTimeAsync(0);
      expect(onProgressUpdate).not.toHaveBeenCalled();

      await result.flush();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(onProgressUpdate).toHaveBeenCalledWith({
        watchPercentage: 10,
        completed: false,
      });
    });
  });

  describe("handleTimeUpdate / handlePause / handleEnded", () => {
    it("handleTimeUpdate trunca la posición con Math.floor antes de guardarla", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ watch_percentage: 1, completed: false }),
      });
      const { result } = setup({ lessonId: "l1", durationSeconds: 100 });

      result.handleTimeUpdate(12.9);
      await result.flush();

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/classroom/progress",
        expect.objectContaining({
          body: JSON.stringify({
            lessonId: "l1",
            playbackPositionSeconds: 12,
            durationSeconds: 100,
          }),
        }),
      );
    });

    it("handlePause dispara un flush inmediato", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ watch_percentage: 1, completed: false }),
      });
      const { result } = setup({ lessonId: "l1", durationSeconds: 100 });

      result.handlePause();
      await vi.advanceTimersByTimeAsync(0);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("handleEnded fija la posición en durationSeconds y dispara flush, aunque la última posición reportada fuera menor", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ watch_percentage: 100, completed: true }),
      });
      const { result } = setup({ lessonId: "l1", durationSeconds: 100 });

      result.handleTimeUpdate(50);
      result.handleEnded();
      await vi.advanceTimersByTimeAsync(0);

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/classroom/progress",
        expect.objectContaining({
          body: JSON.stringify({
            lessonId: "l1",
            playbackPositionSeconds: 100,
            durationSeconds: 100,
          }),
        }),
      );
    });
  });

  describe("efecto de intervalo (montaje/desmontaje)", () => {
    it("crea un intervalo que llama a flush cada 15s", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ watch_percentage: 1, completed: false }),
      });
      setup({ lessonId: "l1", durationSeconds: 100 });
      expect(fetchMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(15_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(15_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("con durationSeconds<=0 el intervalo no produce llamadas de red", async () => {
      setup({ lessonId: "l1", durationSeconds: 0 });
      await vi.advanceTimersByTimeAsync(15_000);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("al desmontar limpia el intervalo y dispara un flush final, sin más llamadas después", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ watch_percentage: 1, completed: false }),
      });
      const { harness } = setup({ lessonId: "l1", durationSeconds: 100 });

      harness.unmount();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1); // el flush final del cleanup

      await vi.advanceTimersByTimeAsync(30_000);
      expect(fetchMock).toHaveBeenCalledTimes(1); // el intervalo ya fue limpiado
    });
  });

  describe("efecto de visibilidad (listeners)", () => {
    it("remueve los listeners al desmontar: después, ocultar la pestaña o pagehide ya no disparan flush", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ watch_percentage: 1, completed: false }),
      });
      const { harness } = setup({ lessonId: "l1", durationSeconds: 100 });

      harness.unmount();
      await vi.advanceTimersByTimeAsync(0);
      fetchMock.mockClear(); // descarta el flush final del otro efecto de cleanup

      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
      win.dispatchEvent(new Event("pagehide"));

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
