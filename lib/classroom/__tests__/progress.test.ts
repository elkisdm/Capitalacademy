import { describe, it, expect, vi, afterEach } from "vitest";
import {
  calculateModuleProgress,
  getLessonStatus,
  computeServerProgress,
} from "@/lib/classroom/progress";
import type { LessonWithProgress, VideoProgress } from "@/lib/classroom/types";

// ---------------------------------------------------------------------------
// Helpers mínimos: los tipos reales (Tables<"lessons">, VideoProgress) traen
// muchas columnas que no importan para esta lógica. Casteamos objetos
// parciales a LessonWithProgress, como ya se hace en otros tests del repo.
// ---------------------------------------------------------------------------

function makeVideoProgress(overrides: Partial<VideoProgress> = {}): VideoProgress {
  return {
    id: "vp-1",
    enrollment_id: "e-1",
    lesson_id: "l-1",
    playback_position_seconds: 0,
    duration_seconds: 100,
    max_position_seconds: 0,
    watch_percentage: 0,
    completed: false,
    completed_at: null,
    source: "player",
    last_watched_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeLesson(overrides: Record<string, unknown> = {}): LessonWithProgress {
  return {
    id: "l-1",
    module_id: "m-1",
    mux_playback_id: null,
    video_progress: null,
    resources: [],
    unlock_at: null,
    content: null,
    ...overrides,
  } as unknown as LessonWithProgress;
}

describe("calculateModuleProgress", () => {
  it("con la lista vacía devuelve module_id vacío y todo en cero (sin división por cero)", () => {
    const result = calculateModuleProgress([]);
    expect(result).toEqual({
      module_id: "",
      total_lessons: 0,
      completed_lessons: 0,
      total_with_video: 0,
      percentage: 0,
    });
  });

  it("toma el module_id de la primera lección", () => {
    const result = calculateModuleProgress([makeLesson({ module_id: "mod-42" })]);
    expect(result.module_id).toBe("mod-42");
  });

  it("ignora las lecciones sin mux_playback_id para el conteo de video, pero las cuenta en total_lessons", () => {
    const lessons = [
      makeLesson({ mux_playback_id: null }),
      makeLesson({ mux_playback_id: "pb-1", video_progress: makeVideoProgress({ completed: true }) }),
    ];
    const result = calculateModuleProgress(lessons);
    expect(result.total_lessons).toBe(2);
    expect(result.total_with_video).toBe(1);
    expect(result.completed_lessons).toBe(1);
  });

  it("no cuenta como completada una lección con video pero sin video_progress", () => {
    const lessons = [makeLesson({ mux_playback_id: "pb-1", video_progress: null })];
    const result = calculateModuleProgress(lessons);
    expect(result.completed_lessons).toBe(0);
  });

  it("no cuenta como completada una lección con video_progress.completed en false", () => {
    const lessons = [
      makeLesson({
        mux_playback_id: "pb-1",
        video_progress: makeVideoProgress({ completed: false }),
      }),
    ];
    const result = calculateModuleProgress(lessons);
    expect(result.completed_lessons).toBe(0);
  });

  it("redondea el porcentaje sobre el total de lecciones (no solo las que tienen video)", () => {
    // 1 de 3 completada => 33.33...% => redondeado a 33
    const lessons = [
      makeLesson({ mux_playback_id: "pb-1", video_progress: makeVideoProgress({ completed: true }) }),
      makeLesson({ mux_playback_id: "pb-2", video_progress: makeVideoProgress({ completed: false }) }),
      makeLesson({ mux_playback_id: null }),
    ];
    const result = calculateModuleProgress(lessons);
    expect(result.total_lessons).toBe(3);
    expect(result.completed_lessons).toBe(1);
    expect(result.percentage).toBe(33);
  });
});

describe("getLessonStatus", () => {
  it("devuelve 'locked' cuando unlock_at está en el futuro", () => {
    const lesson = makeLesson({ unlock_at: new Date(Date.now() + 60_000).toISOString() });
    expect(getLessonStatus(lesson)).toBe("locked");
  });

  // BUG: el chequeo de unlock_at corre ANTES que el de video_progress.completed,
  // así que una lección ya completada por el alumno vuelve a mostrarse "locked"
  // si unlock_at está en el futuro (p.ej. el profesor reprograma el desbloqueo
  // después de que el alumno ya la vio). El orden de los `if` no distingue ese
  // caso; se documenta el comportamiento actual, no se afirma que sea deseado.
  it("una lección ya completada igual aparece 'locked' si unlock_at quedó en el futuro", () => {
    const lesson = makeLesson({
      unlock_at: new Date(Date.now() + 60_000).toISOString(),
      mux_playback_id: "pb-1",
      video_progress: makeVideoProgress({ completed: true }),
    });
    expect(getLessonStatus(lesson)).toBe("locked");
  });

  it("con unlock_at en el pasado, no queda 'locked'", () => {
    const lesson = makeLesson({
      unlock_at: new Date(Date.now() - 60_000).toISOString(),
      mux_playback_id: "pb-1",
    });
    expect(getLessonStatus(lesson)).toBe("available");
  });

  it("con unlock_at null, no queda 'locked'", () => {
    const lesson = makeLesson({ unlock_at: null, mux_playback_id: "pb-1" });
    expect(getLessonStatus(lesson)).toBe("available");
  });

  it("devuelve 'completed' cuando video_progress.completed es true, con video", () => {
    const lesson = makeLesson({
      mux_playback_id: "pb-1",
      video_progress: makeVideoProgress({ completed: true, watch_percentage: 95 }),
    });
    expect(getLessonStatus(lesson)).toBe("completed");
  });

  it("devuelve 'completed' para una lección de texto marcada manualmente (sin video)", () => {
    const lesson = makeLesson({
      mux_playback_id: null,
      video_progress: makeVideoProgress({ completed: true }),
    });
    expect(getLessonStatus(lesson)).toBe("completed");
  });

  it("con video y watch_percentage > 0 sin completar, devuelve 'in_progress'", () => {
    const lesson = makeLesson({
      mux_playback_id: "pb-1",
      video_progress: makeVideoProgress({ completed: false, watch_percentage: 10 }),
    });
    expect(getLessonStatus(lesson)).toBe("in_progress");
  });

  it("con video y video_progress con watch_percentage en 0, devuelve 'available' (no in_progress)", () => {
    const lesson = makeLesson({
      mux_playback_id: "pb-1",
      video_progress: makeVideoProgress({ completed: false, watch_percentage: 0 }),
    });
    expect(getLessonStatus(lesson)).toBe("available");
  });

  it("con video y sin video_progress, devuelve 'available'", () => {
    const lesson = makeLesson({ mux_playback_id: "pb-1", video_progress: null });
    expect(getLessonStatus(lesson)).toBe("available");
  });

  it("sin video pero con contenido de texto no vacío, devuelve 'available'", () => {
    const lesson = makeLesson({ mux_playback_id: null, content: "Contenido de la clase" });
    expect(getLessonStatus(lesson)).toBe("available");
  });

  it("sin video y con contenido solo de espacios en blanco, devuelve 'no_video'", () => {
    const lesson = makeLesson({ mux_playback_id: null, content: "   " });
    expect(getLessonStatus(lesson)).toBe("no_video");
  });

  it("sin video y sin contenido, devuelve 'no_video'", () => {
    const lesson = makeLesson({ mux_playback_id: null, content: null });
    expect(getLessonStatus(lesson)).toBe("no_video");
  });
});

describe("computeServerProgress", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sin registro previo (current=null), max_position toma la posición entrante", () => {
    const result = computeServerProgress(null, {
      playback_position_seconds: 30,
      duration_seconds: 100,
    });
    expect(result.max_position_seconds).toBe(30);
    expect(result.watch_percentage).toBe(30);
    expect(result.completed).toBe(false);
  });

  it("conserva el máximo histórico cuando la posición entrante retrocede (el alumno rebobinó)", () => {
    const result = computeServerProgress(
      { max_position_seconds: 80 },
      { playback_position_seconds: 20, duration_seconds: 100 },
    );
    expect(result.max_position_seconds).toBe(80);
    expect(result.playback_position_seconds).toBe(20); // se guarda la posición actual, no el máximo
    expect(result.watch_percentage).toBe(80);
  });

  it("avanza el máximo cuando la posición entrante supera al registro previo", () => {
    const result = computeServerProgress(
      { max_position_seconds: 10 },
      { playback_position_seconds: 50, duration_seconds: 100 },
    );
    expect(result.max_position_seconds).toBe(50);
  });

  it("con duration_seconds en 0, el porcentaje es 0 (evita división por cero)", () => {
    const result = computeServerProgress(null, {
      playback_position_seconds: 10,
      duration_seconds: 0,
    });
    expect(result.watch_percentage).toBe(0);
    expect(result.completed).toBe(false);
  });

  it("no completada justo por debajo del umbral (89.99% < 90%)", () => {
    const result = computeServerProgress(null, {
      playback_position_seconds: 89.99,
      duration_seconds: 100,
    });
    expect(result.watch_percentage).toBeCloseTo(89.99, 2);
    expect(result.completed).toBe(false);
  });

  it("completada justo en el umbral (90%)", () => {
    const result = computeServerProgress(null, {
      playback_position_seconds: 90,
      duration_seconds: 100,
    });
    expect(result.watch_percentage).toBe(90);
    expect(result.completed).toBe(true);
  });

  it("el porcentaje se limita a 100 aunque la posición supere la duración", () => {
    const result = computeServerProgress(null, {
      playback_position_seconds: 150,
      duration_seconds: 100,
    });
    expect(result.max_position_seconds).toBe(150);
    expect(result.watch_percentage).toBe(100);
    expect(result.completed).toBe(true);
  });

  it("redondea el watch_percentage a 2 decimales", () => {
    const result = computeServerProgress(null, {
      playback_position_seconds: 1,
      duration_seconds: 3,
    });
    // 1/3 * 100 = 33.3333... -> 33.33
    expect(result.watch_percentage).toBe(33.33);
  });

  it("last_watched_at se fija al momento de la llamada", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T10:00:00.000Z"));

    const result = computeServerProgress(null, {
      playback_position_seconds: 10,
      duration_seconds: 100,
    });

    expect(result.last_watched_at).toBe("2026-07-23T10:00:00.000Z");
  });
});
