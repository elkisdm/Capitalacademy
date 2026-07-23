import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;

// --- Mock de autorización ---------------------------------------------------
let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

// --- Mock del cliente admin de Supabase -------------------------------------
type QueryResult<T = unknown> = { data: T; error?: unknown; count?: number | null };

let lessonsResult: QueryResult;
let transcriptsResult: QueryResult;
let existingFinalResult: QueryResult;
let createdEvalResult: QueryResult;
let incompleteResult: QueryResult;
let deleteQuestionsResult: { error: unknown };
let insertQuestionsResult: { error: unknown };
let insertedRows: unknown[] | null = null;
let insertedEvaluation: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "lessons") {
        return {
          select: () => ({
            eq: () => Promise.resolve(lessonsResult),
          }),
        };
      }
      if (table === "lesson_transcripts") {
        return {
          select: () => ({
            in: () => ({
              eq: () => Promise.resolve(transcriptsResult),
            }),
          }),
        };
      }
      if (table === "evaluations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve(existingFinalResult),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            insertedEvaluation = row;
            return {
              select: () => ({
                single: () => Promise.resolve(createdEvalResult),
              }),
            };
          },
        };
      }
      if (table === "quiz_attempts") {
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve(incompleteResult),
            }),
          }),
        };
      }
      if (table === "quiz_questions") {
        return {
          delete: () => ({
            eq: () => ({
              eq: () => Promise.resolve(deleteQuestionsResult),
            }),
          }),
          insert: (rows: unknown[]) => {
            insertedRows = rows;
            return Promise.resolve(insertQuestionsResult);
          },
        };
      }
      throw new Error(`Tabla inesperada en el mock: ${table}`);
    },
  })),
}));

const { POST } = await import("@/app/api/admin/generate-quiz/route");

function req(body: unknown) {
  return new Request("http://x/api/admin/generate-quiz", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function badJsonReq() {
  return new Request("http://x/api/admin/generate-quiz", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{invalid-json",
  });
}

// POST puede tipar su retorno como `Response | undefined` (el helper de
// autorización expone `error` como propiedad opcional en la rama sin error,
// lo que hace que TS no descarte `undefined` al desestructurar). En runtime
// nunca ocurre, pero para no tapar el tipo con `as any` hacemos que la prueba
// falle explícitamente si algún día sí pasara.
async function callPost(request: Request): Promise<Response> {
  const res = await POST(request);
  expect(res).toBeDefined();
  return res as Response;
}

function mockFetchOnce(response: { ok: boolean; status?: number; content?: string; textFails?: boolean }) {
  return vi.fn().mockResolvedValueOnce({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    text: response.textFails
      ? async () => {
          throw new Error("no se pudo leer body");
        }
      : async () => "openai error body",
    json: async () => ({ choices: [{ message: { content: response.content } }] }),
  });
}

const PROGRAM_ID = "prog-1";

const VALID_QUESTIONS = [
  {
    question_text: "¿Qué es el flujo de caja?",
    options: { A: "opt A", B: "opt B", C: "opt C", D: "opt D" },
    correct_option: "B",
    explanation: "Porque sí.",
    lesson_title: "Lesson One",
  },
  {
    question_text: "¿Qué es la tasa de capitalización?",
    options: { A: "x", B: "y", C: "z", D: "w" },
    correct_option: "A",
    explanation: "Porque sí.",
    lesson_title: "Lesson Desconocida",
  },
];

describe("POST /api/admin/generate-quiz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.OPENAI_API_KEY = "test-key";

    authResult = { user: { id: "admin-1" } };

    lessonsResult = {
      data: [
        { id: "lesson-1", title: "Lesson One" },
        { id: "lesson-2", title: "Lesson Two" },
      ],
    };
    transcriptsResult = {
      data: [
        { lesson_id: "lesson-1", content_text: "contenido de la clase uno" },
        { lesson_id: "lesson-2", content_text: "contenido de la clase dos" },
      ],
    };
    existingFinalResult = { data: { id: "eval-final-1" } };
    createdEvalResult = { data: { id: "eval-final-new" }, error: null };
    incompleteResult = { data: null, count: 0, error: null };
    deleteQuestionsResult = { error: null };
    insertQuestionsResult = { error: null };
    insertedRows = null;
    insertedEvaluation = null;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("propaga el error de autorización cuando no es admin", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(403);
  });

  it("400 cuando el body no es JSON válido", async () => {
    const res = await callPost(badJsonReq());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Body invalido");
  });

  it("422 cuando falta programId", async () => {
    const res = await callPost(req({}));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("programId es requerido");
  });

  it("500 cuando falla la consulta de lecciones", async () => {
    lessonsResult = { data: null, error: { message: "boom" } };
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Error al obtener lecciones del programa");
  });

  it("404 cuando el programa no tiene lecciones", async () => {
    lessonsResult = { data: [] };
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("No se encontraron lecciones para este programa");
  });

  it("500 cuando falla la consulta de transcripciones", async () => {
    transcriptsResult = { data: null, error: { message: "boom" } };
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Error al obtener transcripciones");
  });

  it("404 cuando no hay transcripciones listas", async () => {
    transcriptsResult = { data: [] };
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("No hay transcripciones listas para este programa");
  });

  it("422 cuando las transcripciones existen pero están vacías", async () => {
    transcriptsResult = {
      data: [
        { lesson_id: "lesson-1", content_text: "" },
        { lesson_id: "lesson-2", content_text: null },
      ],
    };
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("Las transcripciones estan vacias");
  });

  it("500 cuando OPENAI_API_KEY no está configurada", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("OPENAI_API_KEY no esta configurada en el servidor");
  });

  it("502 cuando OpenAI responde con error HTTP", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ ok: false, status: 500 }));
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Error al comunicarse con OpenAI");
  });

  it("502 cuando OpenAI responde error HTTP y ademas falla la lectura del body de error", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ ok: false, status: 500, textFails: true }));
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(502);
  });

  it("502 tras agotar reintentos cuando OpenAI devuelve contenido vacío ambas veces", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ choices: [{ message: { content: "" } }] }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ choices: [{ message: { content: "" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("OpenAI devolvio una respuesta invalida");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("502 tras agotar reintentos cuando OpenAI devuelve JSON inválido ambas veces", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "no-json",
      json: async () => ({ choices: [{ message: { content: "{esto no es json" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reintenta una vez tras contenido vacío y luego tiene éxito", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ choices: [{ message: { content: "" } }] }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ questions: VALID_QUESTIONS }) } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("502 sin reintentar cuando fetch falla con un error genérico de red", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("OpenAI devolvio una respuesta invalida");
    // No es un error de parseo (SyntaxError o "empty content") así que no reintenta.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("502 cuando OpenAI no genera preguntas (arreglo vacío)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({ ok: true, content: JSON.stringify({ questions: [] }) }),
    );
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("OpenAI no genero preguntas");
  });

  it("500 cuando falla la creación de la evaluación final", async () => {
    existingFinalResult = { data: null };
    createdEvalResult = { data: null, error: { message: "boom" } };
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({ ok: true, content: JSON.stringify({ questions: VALID_QUESTIONS }) }),
    );
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Error al crear la evaluación final");
  });

  it("crea la evaluación final cuando no existe todavía", async () => {
    existingFinalResult = { data: null };
    createdEvalResult = { data: { id: "eval-final-new" }, error: null };
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({ ok: true, content: JSON.stringify({ questions: VALID_QUESTIONS }) }),
    );
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(200);
    expect(insertedEvaluation).toMatchObject({ program_id: PROGRAM_ID, scope: "final" });
  });

  it("500 cuando falla el chequeo de intentos incompletos", async () => {
    incompleteResult = { data: null, count: null, error: { message: "boom" } };
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({ ok: true, content: JSON.stringify({ questions: VALID_QUESTIONS }) }),
    );
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Error al verificar intentos en curso");
  });

  it("409 cuando hay intentos de quiz en curso", async () => {
    incompleteResult = { data: null, count: 2, error: null };
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({ ok: true, content: JSON.stringify({ questions: VALID_QUESTIONS }) }),
    );
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("2 intento(s) de quiz en curso");
  });

  it("500 cuando falla el borrado de preguntas anteriores", async () => {
    deleteQuestionsResult = { error: { message: "boom" } };
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({ ok: true, content: JSON.stringify({ questions: VALID_QUESTIONS }) }),
    );
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Error al eliminar preguntas anteriores");
  });

  it("500 cuando falla la inserción de las nuevas preguntas", async () => {
    insertQuestionsResult = { error: { message: "boom" } };
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({ ok: true, content: JSON.stringify({ questions: VALID_QUESTIONS }) }),
    );
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Error al guardar las preguntas generadas");
  });

  it("camino feliz: genera, mezcla y guarda preguntas ligadas a lecciones por título", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({ ok: true, content: JSON.stringify({ questions: VALID_QUESTIONS }) }),
    );
    const res = await callPost(req({ programId: PROGRAM_ID }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ generated: true, questionCount: 2 });

    expect(insertedRows).not.toBeNull();
    const rows = insertedRows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);

    // La pregunta cuyo lesson_title matchea (case/trim-insensitive) con una lección real
    // debe quedar ligada a esa lección; la que no matchea queda con lesson_id null.
    const q1 = rows[0];
    expect(q1.lesson_id).toBe("lesson-1");
    expect(q1.evaluation_id).toBe("eval-final-1");
    expect(q1.program_id).toBe(PROGRAM_ID);
    expect(q1.is_generated).toBe(true);
    expect(q1.sort_order).toBe(1);

    const q2 = rows[1];
    expect(q2.lesson_id).toBeNull();
    expect(q2.sort_order).toBe(2);

    // El shuffle debe preservar el conjunto de textos de opciones y mantener
    // la coherencia entre correct_option y el texto originalmente correcto.
    const originalCorrectText = (VALID_QUESTIONS[0].options as Record<string, string>)[
      VALID_QUESTIONS[0].correct_option
    ];
    const q1Options = q1.options as Record<string, string>;
    expect(Object.keys(q1Options).sort()).toEqual(["A", "B", "C", "D"]);
    expect(Object.values(q1Options).sort()).toEqual(
      Object.values(VALID_QUESTIONS[0].options).sort(),
    );
    expect(q1Options[q1.correct_option as string]).toBe(originalCorrectText);
    expect(q1.correct_answer).toBe(q1.correct_option);
  });

  it("descarta preguntas cuyo correct_option no matchea ninguna clave de options y no persiste 'A' por defecto", async () => {
    const invalidQuestion = {
      question_text: "¿Pregunta con correct_option inválido?",
      options: { A: "opt A", B: "opt B", C: "opt C", D: "opt D" },
      correct_option: "b", // no coincide exactamente con ninguna clave (case)
      explanation: "Porque sí.",
      lesson_title: "Lesson One",
    };
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({
        ok: true,
        content: JSON.stringify({ questions: [invalidQuestion, VALID_QUESTIONS[0]] }),
      }),
    );
    const res = await callPost(req({ programId: PROGRAM_ID }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.questionCount).toBe(1);

    const rows = insertedRows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    // La única pregunta guardada es la válida; la de correct_option inválido
    // se descarta en vez de persistir 'A' como respuesta correcta por defecto.
    expect(rows[0].question_text).toBe(VALID_QUESTIONS[0].question_text);
  });

  it("502 cuando todas las preguntas de OpenAI tienen formato inválido (options u correct_option)", async () => {
    const invalidQuestion = {
      question_text: "¿Pregunta con solo 3 opciones?",
      options: { A: "opt A", B: "opt B", C: "opt C" },
      correct_option: "A",
      explanation: "Porque sí.",
      lesson_title: "Lesson One",
    };
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({ ok: true, content: JSON.stringify({ questions: [invalidQuestion] }) }),
    );
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("OpenAI no genero preguntas");
    expect(insertedRows).toBeNull();
  });

  it("usa la evaluación final existente sin crear una nueva", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({ ok: true, content: JSON.stringify({ questions: VALID_QUESTIONS }) }),
    );
    const res = await callPost(req({ programId: PROGRAM_ID }));
    expect(res.status).toBe(200);
    expect(insertedEvaluation).toBeNull();
    const rows = insertedRows as Array<Record<string, unknown>>;
    expect(rows[0].evaluation_id).toBe("eval-final-1");
  });
});
