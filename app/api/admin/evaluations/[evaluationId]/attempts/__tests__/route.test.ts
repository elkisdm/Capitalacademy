import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock del gate de autorización: por defecto simula un staff válido. Los
// tests de 401/403 sobreescriben `authResult`.
// ---------------------------------------------------------------------------

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

// ---------------------------------------------------------------------------
// Mock de createAdminClient(): un builder encadenable por tabla que resuelve
// al resultado configurado en `state`.
// ---------------------------------------------------------------------------

type Result = { data: unknown; error?: unknown };

let state: {
  questions: Result;
  attempts: Result;
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "quiz_questions") {
        return {
          select: () => ({
            eq: () => ({ order: () => Promise.resolve(state.questions) }),
          }),
        };
      }
      if (table === "quiz_attempts") {
        return {
          select: () => ({
            eq: () => ({ order: () => Promise.resolve(state.attempts) }),
          }),
        };
      }
      throw new Error(`tabla no mockeada en el test: ${table}`);
    },
  })),
}));

const { GET } = await import("@/app/api/admin/evaluations/[evaluationId]/attempts/route");

const EVAL_ID = "aaaaaaaa-1111-4ccc-8ddd-555555555555";

function ctx(evaluationId = EVAL_ID) {
  return { params: Promise.resolve({ evaluationId }) };
}

function req() {
  return new Request(`http://x/api/admin/evaluations/${EVAL_ID}/attempts`);
}

const Q1 = {
  id: "q1",
  question_text: "¿Cuál es la capital de Chile?",
  question_type: "single_choice" as const,
  options: { A: "Santiago", B: "Valparaíso" },
  correct_answer: "A",
  correct_option: null,
};

const Q2 = {
  id: "q2",
  question_text: "Selecciona los números pares",
  question_type: "multiple_choice" as const,
  options: { A: "2", B: "3", C: "4" },
  correct_answer: ["A", "C"],
  correct_option: null,
};

const Q3 = {
  id: "q3",
  question_text: "Escribe la capital de Perú",
  question_type: "short_answer" as const,
  options: {},
  correct_answer: ["lima"],
  correct_option: null,
};

// Sin correct_answer poblado: prueba el fallback a correct_option (compat).
const Q4 = {
  id: "q4",
  question_text: "¿El agua hierve a 100°C al nivel del mar?",
  question_type: "true_false" as const,
  options: { A: "Verdadero", B: "Falso" },
  correct_answer: null,
  correct_option: "A",
};

describe("GET /api/admin/evaluations/[evaluationId]/attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authResult = { user: { id: "staff-1" } };
    state = {
      questions: { data: [Q1, Q2, Q3, Q4] },
      attempts: { data: [] },
    };
  });

  it("devuelve el error de autorización tal cual cuando el gate rechaza", async () => {
    authResult = {
      error: Response.json({ error: "No autenticado" }, { status: 401 }),
    };
    const res = (await GET(req(), ctx()))!;
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "No autenticado" });
  });

  // BUG: esta ruta usa `authorizeAdmin` (solo system_role ops/admin), mientras
  // que las rutas hermanas del mismo panel de evaluación (grades, criteria,
  // grades/bulk) usan `requireEvaluationStaff`, que también deja pasar a un
  // docente real (rol teacher/assistant en cohort_roles). Un profesor sin
  // ops/admin puede ver notas y criterios de la evaluación pero recibe 403 en
  // la pestaña "Respuestas" (components/admin/quiz/evaluation-attempts.tsx),
  // que llama a este mismo endpoint. Se documenta el comportamiento actual.
  it("propaga el error 403 de autorización", async () => {
    authResult = {
      error: Response.json({ error: "No autorizado" }, { status: 403 }),
    };
    const res = (await GET(req(), ctx()))!;
    expect(res.status).toBe(403);
  });

  it("responde 500 si falla la consulta de quiz_attempts", async () => {
    state.attempts = { data: null, error: { message: "db down" } };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = (await GET(req(), ctx()))!;
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Error al obtener los intentos" });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("devuelve lista vacía cuando no hay intentos ni preguntas", async () => {
    state = { questions: { data: null }, attempts: { data: null } };
    const res = (await GET(req(), ctx()))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ attempts: [] });
  });

  it("no calcula desglose para un intento sin completar (completed_at null)", async () => {
    state.attempts = {
      data: [
        {
          id: "att-1",
          score_pct: null,
          passed: null,
          started_at: "2026-07-01T10:00:00Z",
          completed_at: null,
          questions_presented: [Q1.id],
          answers: { [Q1.id]: "A" },
          enrollments: { student_id: "st-1", profiles: { full_name: "Ana Soto" } },
        },
      ],
    };
    const res = (await GET(req(), ctx()))!;
    const body = await res.json();
    expect(body.attempts).toHaveLength(1);
    const attempt = body.attempts[0];
    expect(attempt.breakdown).toEqual([]);
    expect(attempt.correctCount).toBe(0);
    expect(attempt.totalPresented).toBe(1);
    expect(attempt.studentName).toBe("Ana Soto");
  });

  it("usa 'Sin nombre' cuando el enrollment no trae profile.full_name", async () => {
    state.attempts = {
      data: [
        {
          id: "att-2",
          score_pct: 50,
          passed: false,
          started_at: "2026-07-01T10:00:00Z",
          completed_at: "2026-07-01T10:20:00Z",
          questions_presented: [],
          answers: {},
          enrollments: { student_id: "st-2", profiles: { full_name: null } },
        },
      ],
    };
    const res = (await GET(req(), ctx()))!;
    const body = await res.json();
    expect(body.attempts[0].studentName).toBe("Sin nombre");
  });

  it("usa 'Sin nombre' cuando no hay enrollment asociado (join nulo)", async () => {
    state.attempts = {
      data: [
        {
          id: "att-3",
          score_pct: null,
          passed: null,
          started_at: "2026-07-01T10:00:00Z",
          completed_at: "2026-07-01T10:05:00Z",
          questions_presented: null,
          answers: null,
          enrollments: null,
        },
      ],
    };
    const res = (await GET(req(), ctx()))!;
    const body = await res.json();
    const attempt = body.attempts[0];
    expect(attempt.studentName).toBe("Sin nombre");
    expect(attempt.totalPresented).toBe(0);
    expect(attempt.breakdown).toEqual([]);
  });

  it("filtra del desglose las preguntas presentadas que ya no existen en quiz_questions", async () => {
    state.attempts = {
      data: [
        {
          id: "att-4",
          score_pct: 100,
          passed: true,
          started_at: "2026-07-01T10:00:00Z",
          completed_at: "2026-07-01T10:10:00Z",
          questions_presented: [Q1.id, "pregunta-borrada"],
          answers: { [Q1.id]: "A" },
          enrollments: { student_id: "st-4", profiles: { full_name: "Luis Rojas" } },
        },
      ],
    };
    const res = (await GET(req(), ctx()))!;
    const body = await res.json();
    const attempt = body.attempts[0];
    expect(attempt.totalPresented).toBe(2);
    expect(attempt.breakdown).toHaveLength(1);
    expect(attempt.breakdown[0].questionId).toBe(Q1.id);
  });

  it("calcula el desglose completo: correcto/incorrecto por tipo, display y correctValue con fallback a correct_option", async () => {
    state.attempts = {
      data: [
        {
          id: "att-5",
          score_pct: 50,
          passed: false,
          started_at: "2026-07-01T10:00:00Z",
          completed_at: "2026-07-01T10:30:00Z",
          questions_presented: [Q1.id, Q2.id, Q3.id, Q4.id],
          answers: {
            [Q1.id]: "A", // single_choice correcta, dada como string
            [Q2.id]: ["A", "B"], // multiple_choice incorrecta (set no coincide)
            [Q3.id]: "lima", // short_answer dada como string (formato real del submit)
            // Q4 sin respuesta -> given undefined -> "—", incorrecta
          },
          enrollments: { student_id: "st-5", profiles: { full_name: "María Vidal" } },
        },
      ],
    };
    const res = (await GET(req(), ctx()))!;
    const body = await res.json();
    const attempt = body.attempts[0];
    expect(attempt.totalPresented).toBe(4);
    expect(attempt.breakdown).toHaveLength(4);

    const [b1, b2, b3, b4] = attempt.breakdown;

    // Q1: single_choice correcta
    expect(b1.questionId).toBe(Q1.id);
    expect(b1.givenDisplay).toBe("Santiago");
    expect(b1.correctDisplay).toBe("Santiago");
    expect(b1.isCorrect).toBe(true);

    // Q2: multiple_choice incorrecta, muestra ambas opciones elegidas
    expect(b2.givenDisplay).toBe("2, 3");
    expect(b2.correctDisplay).toBe("2, 4");
    expect(b2.isCorrect).toBe(false);

    // Q3: short_answer correcta; correctDisplay sale de correct_answer (array) -> join " / "
    expect(b3.givenDisplay).toBe("lima");
    expect(b3.correctDisplay).toBe("lima");
    expect(b3.isCorrect).toBe(true);

    // Q4: sin respuesta -> "—", correct_answer null cae a correct_option "A"
    expect(b4.givenDisplay).toBe("—");
    expect(b4.correctDisplay).toBe("Verdadero");
    expect(b4.isCorrect).toBe(false);

    expect(attempt.correctCount).toBe(2);
  });

  it("toDisplay muestra '—' para respuesta null explícita y respeta claves sin opción conocida", async () => {
    state.attempts = {
      data: [
        {
          id: "att-6",
          score_pct: 0,
          passed: false,
          started_at: "2026-07-01T10:00:00Z",
          completed_at: "2026-07-01T10:05:00Z",
          questions_presented: [Q1.id, Q2.id],
          answers: {
            [Q1.id]: null,
            [Q2.id]: ["A", "Z"], // "Z" no está en options -> se muestra tal cual
          },
          enrollments: { student_id: "st-6", profiles: { full_name: "Pedro Gómez" } },
        },
      ],
    };
    const res = (await GET(req(), ctx()))!;
    const body = await res.json();
    const [b1, b2] = body.attempts[0].breakdown;
    expect(b1.givenDisplay).toBe("—");
    expect(b1.isCorrect).toBe(false);
    expect(b2.givenDisplay).toBe("2, Z");
    expect(b2.isCorrect).toBe(false);
  });

  it("toDisplay short_answer con string vacío muestra '—'", async () => {
    state.attempts = {
      data: [
        {
          id: "att-7",
          score_pct: 0,
          passed: false,
          started_at: "2026-07-01T10:00:00Z",
          completed_at: "2026-07-01T10:05:00Z",
          questions_presented: [Q3.id],
          answers: { [Q3.id]: "" },
          enrollments: { student_id: "st-7", profiles: { full_name: "Carla Núñez" } },
        },
      ],
    };
    const res = (await GET(req(), ctx()))!;
    const body = await res.json();
    const [b1] = body.attempts[0].breakdown;
    expect(b1.givenDisplay).toBe("—");
    expect(b1.isCorrect).toBe(false);
  });
});
