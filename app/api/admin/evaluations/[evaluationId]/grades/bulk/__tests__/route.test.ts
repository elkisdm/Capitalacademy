import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock del gate de autorización: por defecto simula un staff válido.
// Cada test que necesite forzar 401/403/422 sobreescribe `staffResult`.
// ---------------------------------------------------------------------------

let staffResult: { user: { id: string } } | { error: Response };

const requireEvaluationStaffSpy = vi.fn(async (..._args: unknown[]) => staffResult);

vi.mock("@/lib/auth/authorize-admin", () => ({
  requireEvaluationStaff: (...args: unknown[]) => requireEvaluationStaffSpy(...args),
}));

// ---------------------------------------------------------------------------
// Mock de createAdminClient(): un builder encadenable por tabla que resuelve
// al resultado configurado en `state`.
// ---------------------------------------------------------------------------

type Result = { data: unknown; error?: unknown };

let state: {
  evaluation: Result;
  program: Result;
  enrollments: Result;
  existingGrades: Result;
  upsertErrorByEnrollment: Map<string, { message: string }>;
};

const upsertSpy = vi.fn();
const gradesSelectSpy = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "evaluations") {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve(state.evaluation) }) }),
        };
      }
      if (table === "programs") {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve(state.program) }) }),
        };
      }
      if (table === "enrollments") {
        return {
          select: () => ({ eq: () => ({ in: () => Promise.resolve(state.enrollments) }) }),
        };
      }
      if (table === "evaluation_grades") {
        return {
          select: (cols: string) => {
            gradesSelectSpy(cols);
            return { eq: () => ({ in: () => Promise.resolve(state.existingGrades) }) };
          },
          upsert: (payload: { enrollment_id: string }, opts: unknown) => {
            upsertSpy(payload, opts);
            const err = state.upsertErrorByEnrollment.get(payload.enrollment_id) ?? null;
            return Promise.resolve({ error: err });
          },
        };
      }
      throw new Error(`tabla no mockeada en el test: ${table}`);
    },
  })),
}));

const { POST } = await import(
  "@/app/api/admin/evaluations/[evaluationId]/grades/bulk/route"
);

const EVAL_ID = "aaaaaaaa-1111-4ccc-8ddd-555555555555";
const COHORT_ID = "bbbbbbbb-2222-4ccc-8ddd-555555555555";
const PROGRAM_ID = "prog-1";
const ENROLLMENT_A = "cccccccc-3333-4ccc-8ddd-555555555555";
const ENROLLMENT_B = "dddddddd-4444-4ccc-8ddd-555555555555";

function ctx(evaluationId = EVAL_ID) {
  return { params: Promise.resolve({ evaluationId }) };
}

function req(body: unknown) {
  return new Request(`http://x/api/admin/evaluations/${EVAL_ID}/grades/bulk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    cohortId: COHORT_ID,
    rows: [{ email: "ana@x.com", grade: 5.5 }],
    ...overrides,
  };
}

describe("POST /api/admin/evaluations/[evaluationId]/grades/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staffResult = { user: { id: "staff-1" } };
    state = {
      evaluation: { data: { id: EVAL_ID, program_id: PROGRAM_ID } },
      program: { data: { grade_exigencia_pct: 60 } },
      enrollments: {
        data: [
          { id: ENROLLMENT_A, profiles: { email: "ana@x.com" } },
          { id: ENROLLMENT_B, profiles: { email: "beto@x.com" } },
        ],
      },
      existingGrades: { data: [] },
      upsertErrorByEnrollment: new Map(),
    };
  });

  // -------------------------------------------------------------------------
  // Validación de body
  // -------------------------------------------------------------------------

  it("responde 400 con body no-JSON", async () => {
    const request = new Request(`http://x/api/admin/evaluations/${EVAL_ID}/grades/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{no-es-json",
    });
    const res = await POST(request, ctx());
    expect(res!.status).toBe(400);
  });

  it("responde 422 cuando cohortId no es un uuid válido", async () => {
    const res = await POST(req(validBody({ cohortId: "no-es-uuid" })), ctx());
    expect(res!.status).toBe(422);
    const body = await res!.json();
    expect(body.error).toBe("Validación fallida");
    expect(body.issues).toBeDefined();
  });

  it("responde 422 cuando rows está vacío", async () => {
    const res = await POST(req(validBody({ rows: [] })), ctx());
    expect(res!.status).toBe(422);
  });

  it("responde 422 cuando una fila no tiene grade ni scorePct", async () => {
    const res = await POST(req(validBody({ rows: [{ email: "ana@x.com" }] })), ctx());
    expect(res!.status).toBe(422);
    const body = await res!.json();
    expect(JSON.stringify(body.issues)).toMatch(/nota o porcentaje/);
  });

  it("responde 422 cuando el email de una fila es inválido", async () => {
    const res = await POST(
      req(validBody({ rows: [{ email: "no-es-email", grade: 5 }] })),
      ctx(),
    );
    expect(res!.status).toBe(422);
  });

  it("responde 422 cuando rows excede el máximo de 500 filas", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      email: `alumno${i}@x.com`,
      grade: 5,
    }));
    const res = await POST(req(validBody({ rows })), ctx());
    expect(res!.status).toBe(422);
  });

  // -------------------------------------------------------------------------
  // Autorización
  // -------------------------------------------------------------------------

  it("propaga el error de autorización (403) sin tocar la BD", async () => {
    staffResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await POST(req(validBody()), ctx());
    expect(res!.status).toBe(403);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("invoca requireEvaluationStaff con evaluationId y cohortId", async () => {
    await POST(req(validBody()), ctx());
    expect(requireEvaluationStaffSpy).toHaveBeenCalledWith(EVAL_ID, COHORT_ID);
  });

  // -------------------------------------------------------------------------
  // Evaluación / programa
  // -------------------------------------------------------------------------

  it("responde 404 cuando la evaluación no existe", async () => {
    state.evaluation = { data: null };
    const res = await POST(req(validBody()), ctx());
    expect(res!.status).toBe(404);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("usa DEFAULT_EXIGENCIA_PCT (60) cuando el programa no existe", async () => {
    state.program = { data: null };
    const res = await POST(
      req(validBody({ rows: [{ email: "ana@x.com", scorePct: 90 }] })),
      ctx(),
    );
    expect(res!.status).toBe(200);
    const [payload] = upsertSpy.mock.calls[0];
    // pctToGrade(90, 60) = 6.3 según el datapoint documentado en scale.ts
    expect(payload.grade).toBe(6.3);
  });

  it("usa grade_exigencia_pct del programa cuando está definido", async () => {
    state.program = { data: { grade_exigencia_pct: 50 } };
    const res = await POST(
      req(validBody({ rows: [{ email: "ana@x.com", scorePct: 90 }] })),
      ctx(),
    );
    expect(res!.status).toBe(200);
    const [payload] = upsertSpy.mock.calls[0];
    // pctToGrade(90, 50) = 4 + 3*((90-50)/(100-50)) = 4 + 2.4 = 6.4
    expect(payload.grade).toBe(6.4);
  });

  it("prioriza grade explícito por sobre scorePct cuando ambos están presentes", async () => {
    const res = await POST(
      req(validBody({ rows: [{ email: "ana@x.com", grade: 3.3, scorePct: 90 }] })),
      ctx(),
    );
    expect(res!.status).toBe(200);
    const [payload] = upsertSpy.mock.calls[0];
    expect(payload.grade).toBe(3.3);
    expect(payload.score_pct).toBe(90);
  });

  // -------------------------------------------------------------------------
  // Resolución por email dentro de la cohorte
  // -------------------------------------------------------------------------

  it("crea nota nueva para un email que matchea una matrícula de la cohorte", async () => {
    const res = await POST(req(validBody()), ctx());
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.created).toBe(1);
    expect(body.updated).toBe(0);
    expect(body.results).toEqual([{ email: "ana@x.com", status: "created" }]);
  });

  it("marca not_found para un email que no matchea ninguna matrícula de la cohorte", async () => {
    const res = await POST(
      req(validBody({ rows: [{ email: "fuera@x.com", grade: 5 }] })),
      ctx(),
    );
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.results).toEqual([{ email: "fuera@x.com", status: "not_found" }]);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("ignora matrículas sin profile asociado (no quedan en el mapa de emails)", async () => {
    state.enrollments = { data: [{ id: ENROLLMENT_A, profiles: null }] };
    const res = await POST(req(validBody()), ctx());
    const body = await res!.json();
    expect(body.results).toEqual([{ email: "ana@x.com", status: "not_found" }]);
  });

  it("no consulta evaluation_grades cuando la cohorte no tiene matrículas (enrollmentIds vacío)", async () => {
    // enrollmentIds se arma desde TODAS las matrículas de la cohorte, no solo
    // las que matchean filas del import — por eso lo que lo vacía es una
    // cohorte sin matrículas, no un email de fila sin match.
    state.enrollments = { data: [] };
    const res = await POST(
      req(validBody({ rows: [{ email: "fuera@x.com", grade: 5 }] })),
      ctx(),
    );
    expect(res!.status).toBe(200);
    expect(gradesSelectSpy).not.toHaveBeenCalled();
  });

  it("consulta evaluation_grades cuando al menos una fila matchea matrícula", async () => {
    const res = await POST(req(validBody()), ctx());
    expect(res!.status).toBe(200);
    expect(gradesSelectSpy).toHaveBeenCalledTimes(1);
  });

  it("marca updated cuando ya existía una nota para esa matrícula", async () => {
    state.existingGrades = { data: [{ enrollment_id: ENROLLMENT_A, published_at: null }] };
    const res = await POST(req(validBody()), ctx());
    const body = await res!.json();
    expect(body.created).toBe(0);
    expect(body.updated).toBe(1);
    expect(body.results[0].status).toBe("updated");
  });

  // -------------------------------------------------------------------------
  // Lógica de published_at (preservar / setear / no despublicar en masa)
  // -------------------------------------------------------------------------

  it("publish=false y nota nueva: published_at queda null", async () => {
    const res = await POST(req(validBody({ publish: false })), ctx());
    expect(res!.status).toBe(200);
    const [payload] = upsertSpy.mock.calls[0];
    expect(payload.published_at).toBeNull();
  });

  it("publish=false preserva el published_at de una nota ya publicada (no despublica en masa)", async () => {
    const publicada = "2025-06-01T00:00:00.000Z";
    state.existingGrades = { data: [{ enrollment_id: ENROLLMENT_A, published_at: publicada }] };
    const res = await POST(req(validBody({ publish: false })), ctx());
    expect(res!.status).toBe(200);
    const [payload] = upsertSpy.mock.calls[0];
    expect(payload.published_at).toBe(publicada);
  });

  it("publish=true y nota nueva: fija published_at con la hora actual", async () => {
    const res = await POST(req(validBody({ publish: true })), ctx());
    expect(res!.status).toBe(200);
    const [payload] = upsertSpy.mock.calls[0];
    expect(typeof payload.published_at).toBe("string");
    expect(payload.published_at).not.toBeNull();
  });

  it("publish=true y nota existente en borrador (published_at null): fija fecha nueva", async () => {
    state.existingGrades = { data: [{ enrollment_id: ENROLLMENT_A, published_at: null }] };
    const res = await POST(req(validBody({ publish: true })), ctx());
    expect(res!.status).toBe(200);
    const [payload] = upsertSpy.mock.calls[0];
    expect(typeof payload.published_at).toBe("string");
    expect(payload.published_at).not.toBeNull();
  });

  it("publish=true y nota ya publicada: preserva la PRIMERA fecha de publicación", async () => {
    const primeraPublicacion = "2025-01-01T00:00:00.000Z";
    state.existingGrades = {
      data: [{ enrollment_id: ENROLLMENT_A, published_at: primeraPublicacion }],
    };
    const res = await POST(req(validBody({ publish: true })), ctx());
    expect(res!.status).toBe(200);
    const [payload] = upsertSpy.mock.calls[0];
    expect(payload.published_at).toBe(primeraPublicacion);
  });

  // -------------------------------------------------------------------------
  // Payload / campos opcionales
  // -------------------------------------------------------------------------

  it("feedback y scorePct ausentes caen a null en el payload", async () => {
    const res = await POST(req(validBody()), ctx());
    expect(res!.status).toBe(200);
    const [payload] = upsertSpy.mock.calls[0];
    expect(payload.feedback).toBeNull();
    expect(payload.score_pct).toBeNull();
  });

  it("comentario provisto se guarda como feedback", async () => {
    const res = await POST(
      req(validBody({ rows: [{ email: "ana@x.com", grade: 5, comentario: "Buen trabajo" }] })),
      ctx(),
    );
    expect(res!.status).toBe(200);
    const [payload] = upsertSpy.mock.calls[0];
    expect(payload.feedback).toBe("Buen trabajo");
  });

  it("source siempre es 'import' y graded_by es el id del staff autenticado", async () => {
    const res = await POST(req(validBody()), ctx());
    expect(res!.status).toBe(200);
    const [payload, opts] = upsertSpy.mock.calls[0];
    expect(payload.source).toBe("import");
    expect(payload.graded_by).toBe("staff-1");
    expect(payload.evaluation_id).toBe(EVAL_ID);
    expect(payload.enrollment_id).toBe(ENROLLMENT_A);
    expect(opts).toEqual({ onConflict: "evaluation_id,enrollment_id" });
  });

  // -------------------------------------------------------------------------
  // Manejo de filas mixtas / errores por fila
  // -------------------------------------------------------------------------

  it("procesa varias filas independientemente: creadas, actualizadas y no encontradas", async () => {
    state.existingGrades = { data: [{ enrollment_id: ENROLLMENT_B, published_at: null }] };
    const res = await POST(
      req(
        validBody({
          rows: [
            { email: "ana@x.com", grade: 5 }, // nueva -> created
            { email: "beto@x.com", grade: 6 }, // ya existía -> updated
            { email: "fuera@x.com", grade: 4 }, // no matchea -> not_found
          ],
        }),
      ),
      ctx(),
    );
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.created).toBe(1);
    expect(body.updated).toBe(1);
    expect(body.results).toEqual([
      { email: "ana@x.com", status: "created" },
      { email: "beto@x.com", status: "updated" },
      { email: "fuera@x.com", status: "not_found" },
    ]);
    expect(upsertSpy).toHaveBeenCalledTimes(2);
  });

  it("una fila con error de upsert no aborta el resto del import", async () => {
    state.upsertErrorByEnrollment.set(ENROLLMENT_A, { message: "db down" });
    const res = await POST(
      req(
        validBody({
          rows: [
            { email: "ana@x.com", grade: 5 },
            { email: "beto@x.com", grade: 6 },
          ],
        }),
      ),
      ctx(),
    );
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.results).toEqual([
      { email: "ana@x.com", status: "error", reason: "db down" },
      { email: "beto@x.com", status: "created" },
    ]);
    // las filas con error no cuentan como created ni updated
    expect(body.created).toBe(1);
    expect(body.updated).toBe(0);
    expect(upsertSpy).toHaveBeenCalledTimes(2);
  });
});
