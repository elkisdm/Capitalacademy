import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Este módulo es un hook de React ("use client") y el proyecto NO tiene
// @testing-library/react ni jsdom (vitest.config.ts corre en entorno "node").
// Igual que en lib/classroom/__tests__/use-video-progress.test.ts, mockeamos
// "react" con un arnés mínimo de useRef/useEffect para poder ejercitar el
// ciclo montaje → efecto → desmontaje sin agregar dependencias nuevas.
//
// A diferencia de ese otro arnés, acá NO ejecutamos el efecto automáticamente
// dentro de `render()`: el hook depende de que `containerRef.current` ya esté
// asignado a un nodo DOM cuando el efecto corre (así funciona React: el ref
// se adjunta en el commit, ANTES de que se disparen los efectos). Por eso
// exponemos `runEffects()` para correr el efecto pendiente después de que el
// test haya asignado manualmente `ref.current` a un contenedor falso.
// ---------------------------------------------------------------------------

type Cleanup = void | (() => void);
type EffectRecord = { cleanup?: () => void; deps?: unknown[] };

function createHookHarness() {
  const ref: { current: unknown } = { current: null };
  let effectRecord: EffectRecord | undefined;
  let pendingEffect: (() => Cleanup) | null = null;
  let pendingDeps: unknown[] | undefined;

  function useRefImpl(_initial: unknown) {
    return ref;
  }

  function useEffectImpl(effect: () => Cleanup, deps?: unknown[]) {
    const depsChanged =
      !effectRecord ||
      !deps ||
      !effectRecord.deps ||
      deps.length !== effectRecord.deps.length ||
      deps.some((d, i) => d !== effectRecord!.deps![i]);

    if (depsChanged) {
      pendingEffect = effect;
      pendingDeps = deps;
    } else {
      pendingEffect = null;
    }
  }

  function render<T>(fn: () => T): T {
    return fn();
  }

  function runEffects() {
    if (pendingEffect) {
      const effect = pendingEffect;
      pendingEffect = null;
      effectRecord?.cleanup?.();
      const cleanup = effect();
      effectRecord = { cleanup: cleanup ?? undefined, deps: pendingDeps };
    }
  }

  function unmount() {
    effectRecord?.cleanup?.();
    effectRecord = undefined;
  }

  return { ref, useRefImpl, useEffectImpl, render, runEffects, unmount };
}

type HookHarness = ReturnType<typeof createHookHarness>;

const hoisted = vi.hoisted(() => ({
  activeHarness: null as HookHarness | null,
}));

vi.mock("react", () => ({
  useRef: (initial: unknown) => hoisted.activeHarness!.useRefImpl(initial),
  useEffect: (effect: () => Cleanup, deps?: unknown[]) =>
    hoisted.activeHarness!.useEffectImpl(effect, deps),
}));

const { useFocusTrap } = await import("@/lib/utils/use-focus-trap");

// ---------------------------------------------------------------------------
// Fakes de DOM: un elemento con focus() que actualiza document.activeElement,
// y un contenedor con querySelectorAll/addEventListener/removeEventListener.
// ---------------------------------------------------------------------------

function makeElement(id: string, doc: { activeElement: unknown }) {
  const el = {
    id,
    focus: vi.fn(() => {
      doc.activeElement = el;
    }),
  };
  return el;
}

function makeContainer(focusable: unknown[]) {
  const listeners: Record<string, EventListener> = {};
  return {
    querySelectorAll: vi.fn(() => focusable),
    addEventListener: vi.fn((type: string, handler: EventListener) => {
      listeners[type] = handler;
    }),
    removeEventListener: vi.fn((type: string, handler: EventListener) => {
      if (listeners[type] === handler) delete listeners[type];
    }),
    getListener(type: string) {
      return listeners[type];
    },
    setFocusable(list: unknown[]) {
      focusable = list;
    },
  };
}

function setup(active: boolean) {
  const harness = createHookHarness();
  hoisted.activeHarness = harness;
  const containerRef = harness.render(() => useFocusTrap(active));
  return { containerRef, harness };
}

describe("useFocusTrap", () => {
  let fakeDoc: { activeElement: unknown };

  beforeEach(() => {
    fakeDoc = { activeElement: null };
    vi.stubGlobal("document", fakeDoc);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("cuando active es false, no toca el DOM ni registra listeners", () => {
    const { containerRef, harness } = setup(false);
    const container = makeContainer([]);
    containerRef.current = container as unknown as HTMLDivElement;

    harness.runEffects();

    expect(container.querySelectorAll).not.toHaveBeenCalled();
    expect(container.addEventListener).not.toHaveBeenCalled();
  });

  it("cuando active es true pero containerRef.current sigue null, no lanza y no hace nada", () => {
    const { containerRef, harness } = setup(true);
    expect(containerRef.current).toBeNull();

    expect(() => harness.runEffects()).not.toThrow();
  });

  it("al montar con elementos focoseables, enfoca el primero", () => {
    const { containerRef, harness } = setup(true);
    const first = makeElement("first", fakeDoc);
    const second = makeElement("second", fakeDoc);
    const container = makeContainer([first, second]);
    containerRef.current = container as unknown as HTMLDivElement;

    harness.runEffects();

    expect(first.focus).toHaveBeenCalledTimes(1);
    expect(second.focus).not.toHaveBeenCalled();
    expect(container.addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("al montar sin elementos focoseables, no llama a focus()", () => {
    const { containerRef, harness } = setup(true);
    const container = makeContainer([]);
    containerRef.current = container as unknown as HTMLDivElement;

    harness.runEffects();

    // Nada que assertar sobre un elemento inexistente: solo verificamos que
    // no truene y que el listener sí quede registrado (el trap igual arma el
    // handler de teclado aunque no haya nada que enfocar al montar).
    expect(container.addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("Tab en un elemento intermedio no redirige el foco ni previene el default", () => {
    const { containerRef, harness } = setup(true);
    const first = makeElement("first", fakeDoc);
    const middle = makeElement("middle", fakeDoc);
    const last = makeElement("last", fakeDoc);
    const container = makeContainer([first, middle, last]);
    containerRef.current = container as unknown as HTMLDivElement;
    harness.runEffects();
    first.focus.mockClear(); // descarta el focus del montaje

    fakeDoc.activeElement = middle;
    const handler = container.getListener("keydown");
    const preventDefault = vi.fn();
    handler!({ key: "Tab", shiftKey: false, preventDefault } as unknown as KeyboardEvent);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(first.focus).not.toHaveBeenCalled();
    expect(last.focus).not.toHaveBeenCalled();
  });

  it("Shift+Tab en el primer elemento envuelve el foco al último", () => {
    const { containerRef, harness } = setup(true);
    const first = makeElement("first", fakeDoc);
    const last = makeElement("last", fakeDoc);
    const container = makeContainer([first, last]);
    containerRef.current = container as unknown as HTMLDivElement;
    harness.runEffects();
    first.focus.mockClear(); // descarta el focus del montaje

    fakeDoc.activeElement = first;
    const handler = container.getListener("keydown");
    const preventDefault = vi.fn();
    handler!({ key: "Tab", shiftKey: true, preventDefault } as unknown as KeyboardEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(last.focus).toHaveBeenCalledTimes(1);
  });

  it("Tab (sin shift) en el último elemento envuelve el foco al primero", () => {
    const { containerRef, harness } = setup(true);
    const first = makeElement("first", fakeDoc);
    const last = makeElement("last", fakeDoc);
    const container = makeContainer([first, last]);
    containerRef.current = container as unknown as HTMLDivElement;
    harness.runEffects();
    first.focus.mockClear();

    fakeDoc.activeElement = last;
    const handler = container.getListener("keydown");
    const preventDefault = vi.fn();
    handler!({ key: "Tab", shiftKey: false, preventDefault } as unknown as KeyboardEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(first.focus).toHaveBeenCalledTimes(1);
  });

  it("una tecla distinta de Tab no dispara ninguna lógica de trampa", () => {
    const { containerRef, harness } = setup(true);
    const first = makeElement("first", fakeDoc);
    const last = makeElement("last", fakeDoc);
    const container = makeContainer([first, last]);
    containerRef.current = container as unknown as HTMLDivElement;
    harness.runEffects();
    first.focus.mockClear(); // descarta el focus del montaje

    fakeDoc.activeElement = last;
    const handler = container.getListener("keydown");
    const preventDefault = vi.fn();
    handler!({ key: "Enter", shiftKey: false, preventDefault } as unknown as KeyboardEvent);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(first.focus).not.toHaveBeenCalled();
  });

  it("si al momento del Tab ya no hay elementos focoseables, no lanza y no redirige", () => {
    const { containerRef, harness } = setup(true);
    const first = makeElement("first", fakeDoc);
    const container = makeContainer([first]);
    containerRef.current = container as unknown as HTMLDivElement;
    harness.runEffects();

    const handler = container.getListener("keydown");
    container.setFocusable([]); // el DOM cambió entre el montaje y el keydown
    const preventDefault = vi.fn();

    expect(() =>
      handler!({ key: "Tab", shiftKey: false, preventDefault } as unknown as KeyboardEvent),
    ).not.toThrow();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("al desmontar, remueve el listener de keydown y restaura el foco previo", () => {
    const previouslyFocused = makeElement("trigger-button", fakeDoc);
    fakeDoc.activeElement = previouslyFocused;

    const { containerRef, harness } = setup(true);
    const first = makeElement("first", fakeDoc);
    const container = makeContainer([first]);
    containerRef.current = container as unknown as HTMLDivElement;
    harness.runEffects();

    const handler = container.getListener("keydown");
    harness.unmount();

    expect(container.removeEventListener).toHaveBeenCalledWith("keydown", handler);
    expect(previouslyFocused.focus).toHaveBeenCalledTimes(1);
  });

  it("al desmontar sin foco previo (activeElement era null), no lanza y no llama focus() de más", () => {
    fakeDoc.activeElement = null;

    const { containerRef, harness } = setup(true);
    const first = makeElement("first", fakeDoc);
    const container = makeContainer([first]);
    containerRef.current = container as unknown as HTMLDivElement;
    harness.runEffects();
    first.focus.mockClear(); // solo nos interesa el focus del cleanup, no el del montaje

    expect(() => harness.unmount()).not.toThrow();
    expect(first.focus).not.toHaveBeenCalled();
  });

  it("al cambiar active de true a false, el efecto anterior limpia (remueve listener y restaura foco) antes de que el nuevo efecto no haga nada", () => {
    const previouslyFocused = makeElement("trigger-button", fakeDoc);
    fakeDoc.activeElement = previouslyFocused;

    const harness = createHookHarness();
    hoisted.activeHarness = harness;

    let active = true;
    const containerRef = harness.render(() => useFocusTrap(active));
    const first = makeElement("first", fakeDoc);
    const container = makeContainer([first]);
    containerRef.current = container as unknown as HTMLDivElement;
    harness.runEffects();

    const handler = container.getListener("keydown");
    expect(handler).toBeTypeOf("function");

    // Re-render con active=false: cambia la dependencia del efecto.
    active = false;
    harness.render(() => useFocusTrap(active));
    harness.runEffects();

    expect(container.removeEventListener).toHaveBeenCalledWith("keydown", handler);
    expect(previouslyFocused.focus).toHaveBeenCalledTimes(1);
  });
});
