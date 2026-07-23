import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock del gate de autorización: por defecto simula un docente/ops válido.
// Cada test que necesite forzar 401/403/422 sobreescribe `staffResult`.
// ---------------------------------------------------------------------------

let staffResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  requireEvaluationStaff: vi.fn(async () => staffResult),
}));

// ---------------------------------------------------------------------------
// Mock de createAdminClient(): un builder encadenable por tabla que resuelve
// al resultado configurado en `state`, ya sea como promesa "bare" (await
// directo sobre el query) o vía los terminales `.single()`/`.maybeSingle()`.
// ---------------------------------------------------------------------------

type Result = { data: unknown; error?: unknown };

let state: {
  evaluation: Result;
  criteria: Result;
  enrollmentsList: Result;
  enrollmentSingle: Result;
  gradesList: Result;
  gradeExisting: Result;
  gradeUpsert: Result;
  gradeUpdate: Result;
};

const upsertSpy = vi.fn();
const updateSpy = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "evaluations") {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve(state.evaluation) }) }),
        };
      }
      if (table === "evaluation_criteria") {
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve(state.criteria) }) }),
        };
      }
      if (table === "enrollments") {
        return {
          select: () => ({
            eq: () => ({
              // GET roster: .eq("cohort_id", ...).in("status", [...])
              in: () => Promise.resolve(state.enrollmentsList),
              // PUT: .eq("id", ...).maybeSingle()
              maybeSingle: () => Promise.resolve(state.enrollmentSingle),
              // POST publish: .eq("cohort_id", ...) awaited directamente (sin terminal)
              then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
                Promise.resolve(state.enrollmentsList).then(resolve, reject),
            }),
          }),
        };
      }
      if (table === "evaluation_grades") {
        return {
          select: (cols: string) => {
            if (cols === "*") {
              // GET roster: .select("*").eq("evaluation_id", ...).in("enrollment_id", [...])
              return { eq: () => ({ in: () => Promise.resolve(state.gradesList) }) };
            }
            // PUT: .select("published_at").eq(...).eq(...).maybeSingle()
            return {
              eq: () => ({
                eq: () => ({ maybeSingle: () => Promise.resolve(state.gradeExisting) }),
              }),
            };
          },
          upsert: (payload: unknown, opts: unknown) => {
            upsertSpy(payload, opts);
            return { select: () => ({ single: () => Promise.resolve(state.gradeUpsert) }) };
          },
          update: (payload: unknown) => {
            updateSpy(payload);
            return {
              eq: () => ({
                in: () => ({
                  not: () => ({
                    is: () => ({ select: () => Promise.resolve(state.gradeUpdate) }),
                  }),
                }),
              }),
            };
          },
        };
      }
      throw new Error(`tabla no mockeada en el test: ${table}`);
    },
  })),
}));

const { GET, PUT, POST } = await import(
  "@/app/api/admin/evaluations/[evaluationId]/grades/route"
);

const EVAL_ID = "aaaaaaaa-1111-4ccc-8ddd-555555555555";
const COHORT_ID = "bbbbbbbb-2222-4ccc-8ddd-555555555555";
const ENROLLMENT_A = "cccccccc-3333-4ccc-8ddd-555555555555";
const ENROLLMENT_B = "dddddddd-4444-4ccc-8ddd-555555555555";
const CRITERION_ID = "eeeeeeee-5555-4ccc-8ddd-555555555555";

function ctx(evaluationId = EVAL_ID) {
  return { params: Promise.resolve({ evaluationId }) };
}

function getReq(query: string) {
  return new Request(`http://x/api/admin/evaluations/${EVAL_ID}/grades${query}`);
}

function putReq(body: unknown) {
  return new Request(`http://x/api/admin/evaluations/${EVAL_ID}/grades`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postReq(body: unknown, action = "publish") {
  return new Request(
    `http://x/api/admin/evaluations/${EVAL_ID}/grades?action=${action}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("admin/evaluations/[evaluationId]/grades route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staffResult = { user: { id: "staff-1" } };
    state = {
      evaluation: { data: { id: EVAL_ID, program_id: "prog-1" } },
      criteria: { data: [{ id: CRITERION_ID, label: "Claridad", position: 1 }] },
      enrollmentsList: { data: [] },
      enrollmentSingle: { data: { id: ENROLLMENT_A, cohort_id: COHORT_ID } },
      gradesList: { data: [] },
      gradeExisting: { data: null },
      gradeUpsert: { data: { id: "grade-1" }, error: null },
      gradeUpdate: { data: [], error: null },
    };
  });

  // -------------------------------------------------------------------------
  // GET
  // -------------------------------------------------------------------------

  describe("GET", () => {
    it("responde 422 cuando falta cohortId", async () => {
      const res = await GET(getReq(""), ctx());
      expect(res!.status).toBe(422);
      const body = await res!.json();
      expect(body.error).toMatch(/cohortId/);
    });

    it("propaga el error de autorización (403) sin tocar la BD", async () => {
      staffResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
      const res = await GET(getReq(`?cohortId=${COHORT_ID}`), ctx());
      expect(res!.status).toBe(403);
    });

    it("responde 404 cuando la evaluación no existe", async () => {
      state.evaluation = { data: null };
      const res = await GET(getReq(`?cohortId=${COHORT_ID}`), ctx());
      expect(res!.status).toBe(404);
    });

    it("responde 404 cuando la consulta de evaluación devuelve error", async () => {
      state.evaluation = { data: null, error: { message: "boom" } };
      const res = await GET(getReq(`?cohortId=${COHORT_ID}`), ctx());
      expect(res!.status).toBe(404);
    });

    it("arma el roster con notas y sin notas, ordenado por nombre", async () => {
      state.enrollmentsList = {
        data: [
          {
            id: ENROLLMENT_B,
            student_id: "s2",
            profiles: { full_name: "Zoe Alumna", email: "zoe@x.com" },
          },
          {
            id: ENROLLMENT_A,
            student_id: "s1",
            profiles: { full_name: "Ana Alumna", email: "ana@x.com" },
          },
        ],
      };
      state.gradesList = {
        data: [
          {
            enrollment_id: ENROLLMENT_A,
            grade: 6.5,
            score_pct: 90,
            source: "manual",
            feedback: "Bien",
            criteria_marks: [{ criterion_id: CRITERION_ID, label: "Claridad", checked: true }],
            published_at: "2026-01-01T00:00:00Z",
            graded_at: "2026-01-01T00:00:00Z",
          },
        ],
      };

      const res = await GET(getReq(`?cohortId=${COHORT_ID}`), ctx());
      expect(res!.status).toBe(200);
      const body = await res!.json();
      expect(body.roster).toHaveLength(2);
      // orden alfabético: Ana antes que Zoe
      expect(body.roster[0].studentName).toBe("Ana Alumna");
      expect(body.roster[0].grade).toBe(6.5);
      expect(body.roster[0].criteriaMarks).toHaveLength(1);
      // Zoe no tiene nota: todos los campos de nota en null / arreglo vacío
      expect(body.roster[1].studentName).toBe("Zoe Alumna");
      expect(body.roster[1].grade).toBeNull();
      expect(body.roster[1].criteriaMarks).toEqual([]);
      expect(body.criteria).toHaveLength(1);
    });

    it("usa el email como studentName cuando full_name es null", async () => {
      state.enrollmentsList = {
        data: [{ id: ENROLLMENT_A, student_id: "s1", profiles: { full_name: null, email: "solo@x.com" } }],
      };
      const res = await GET(getReq(`?cohortId=${COHORT_ID}`), ctx());
      const body = await res!.json();
      expect(body.roster[0].studentName).toBe("solo@x.com");
      expect(body.roster[0].email).toBe("solo@x.com");
    });

    it('usa "—" cuando no hay profile asociado', async () => {
      state.enrollmentsList = {
        data: [{ id: ENROLLMENT_A, student_id: "s1", profiles: null }],
      };
      const res = await GET(getReq(`?cohortId=${COHORT_ID}`), ctx());
      const body = await res!.json();
      expect(body.roster[0].studentName).toBe("—");
      expect(body.roster[0].email).toBeNull();
    });

    it("no consulta evaluation_grades cuando no hay matrículas (roster vacío)", async () => {
      state.enrollmentsList = { data: [] };
      const res = await GET(getReq(`?cohortId=${COHORT_ID}`), ctx());
      expect(res!.status).toBe(200);
      const body = await res!.json();
      expect(body.roster).toEqual([]);
    });

    it("responde criteria: [] cuando la consulta de criterios devuelve null", async () => {
      state.criteria = { data: null };
      const res = await GET(getReq(`?cohortId=${COHORT_ID}`), ctx());
      expect(res!.status).toBe(200);
      const body = await res!.json();
      expect(body.criteria).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // PUT
  // -------------------------------------------------------------------------

  describe("PUT", () => {
    function validBody(overrides: Record<string, unknown> = {}) {
      return {
        enrollmentId: ENROLLMENT_A,
        grade: 5.5,
        publish: false,
        ...overrides,
      };
    }

    it("responde 400 con body no-JSON", async () => {
      const req = new Request(`http://x/api/admin/evaluations/${EVAL_ID}/grades`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{no-es-json",
      });
      const res = await PUT(req, ctx());
      expect(res!.status).toBe(400);
    });

    it("responde 422 con validación fallida (grade fuera de rango)", async () => {
      const res = await PUT(putReq(validBody({ grade: 9 })), ctx());
      expect(res!.status).toBe(422);
      const body = await res!.json();
      expect(body.issues).toBeDefined();
    });

    it("responde 404 cuando la matrícula no existe", async () => {
      state.enrollmentSingle = { data: null };
      const res = await PUT(putReq(validBody()), ctx());
      expect(res!.status).toBe(404);
    });

    it("propaga el error de autorización (403)", async () => {
      staffResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
      const res = await PUT(putReq(validBody()), ctx());
      expect(res!.status).toBe(403);
    });

    it("guarda borrador (publish=false) sin tocar published_at existente null", async () => {
      state.gradeExisting = { data: null };
      const res = await PUT(putReq(validBody({ publish: false })), ctx());
      expect(res!.status).toBe(200);
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      const [payload] = upsertSpy.mock.calls[0];
      expect(payload.published_at).toBeNull();
      expect(payload.source).toBe("manual");
      expect(payload.graded_by).toBe("staff-1");
    });

    it("al publicar por primera vez fija published_at con la hora actual", async () => {
      state.gradeExisting = { data: null };
      const res = await PUT(putReq(validBody({ publish: true })), ctx());
      expect(res!.status).toBe(200);
      const [payload] = upsertSpy.mock.calls[0];
      expect(payload.published_at).not.toBeNull();
      expect(typeof payload.published_at).toBe("string");
    });

    it("al re-publicar preserva la fecha de la PRIMERA publicación", async () => {
      const primeraPublicacion = "2025-01-01T00:00:00.000Z";
      state.gradeExisting = { data: { published_at: primeraPublicacion } };
      const res = await PUT(putReq(validBody({ publish: true, grade: 6 })), ctx());
      expect(res!.status).toBe(200);
      const [payload] = upsertSpy.mock.calls[0];
      expect(payload.published_at).toBe(primeraPublicacion);
    });

    it("guardar borrador nunca despublica una nota ya publicada", async () => {
      const publicadaPreviamente = "2025-06-01T00:00:00.000Z";
      state.gradeExisting = { data: { published_at: publicadaPreviamente } };
      const res = await PUT(putReq(validBody({ publish: false })), ctx());
      expect(res!.status).toBe(200);
      const [payload] = upsertSpy.mock.calls[0];
      expect(payload.published_at).toBe(publicadaPreviamente);
    });

    it("unpublish=true retira una nota publicada", async () => {
      state.gradeExisting = { data: { published_at: "2025-06-01T00:00:00.000Z" } };
      const res = await PUT(putReq(validBody({ publish: false, unpublish: true })), ctx());
      expect(res!.status).toBe(200);
      const [payload] = upsertSpy.mock.calls[0];
      expect(payload.published_at).toBeNull();
    });

    // BUG: el comentario del código dice "unpublish solo se honra si publish
    // es false", pero la implementación (route.ts:152-156) no valida esa
    // combinación: si el cliente manda publish=true Y unpublish=true a la
    // vez, unpublish igual gana y published_at queda en null, contradiciendo
    // el contrato documentado. En la práctica la UI actual (evaluation-grades.tsx)
    // nunca manda ambos true a la vez, así que hoy no es explotable desde el
    // panel, pero el endpoint no se protege a sí mismo de esa combinación.
    it("BUG: publish=true + unpublish=true igual despublica (unpublish gana silenciosamente)", async () => {
      state.gradeExisting = { data: { published_at: "2025-06-01T00:00:00.000Z" } };
      const res = await PUT(putReq(validBody({ publish: true, unpublish: true })), ctx());
      expect(res!.status).toBe(200);
      const [payload] = upsertSpy.mock.calls[0];
      expect(payload.published_at).toBeNull();
    });

    it("feedback y criteriaMarks ausentes caen a null / arreglo vacío", async () => {
      const res = await PUT(putReq(validBody()), ctx());
      expect(res!.status).toBe(200);
      const [payload] = upsertSpy.mock.calls[0];
      expect(payload.feedback).toBeNull();
      expect(payload.criteria_marks).toEqual([]);
    });

    it("feedback y criteriaMarks provistos se guardan tal cual", async () => {
      const res = await PUT(
        putReq(
          validBody({
            feedback: "Buen trabajo",
            criteriaMarks: [{ criterion_id: CRITERION_ID, label: "Claridad", checked: true }],
          }),
        ),
        ctx(),
      );
      expect(res!.status).toBe(200);
      const [payload] = upsertSpy.mock.calls[0];
      expect(payload.feedback).toBe("Buen trabajo");
      expect(payload.criteria_marks).toEqual([
        { criterion_id: CRITERION_ID, label: "Claridad", checked: true },
      ]);
    });

    it("responde 500 cuando el upsert falla", async () => {
      state.gradeUpsert = { data: null, error: { message: "db down" } };
      const res = await PUT(putReq(validBody()), ctx());
      expect(res!.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST ?action=publish
  // -------------------------------------------------------------------------

  describe("POST (publicar cohorte)", () => {
    it("responde 422 cuando la acción no es 'publish'", async () => {
      const res = await POST(postReq({ cohortId: COHORT_ID }, "otra"), ctx());
      expect(res!.status).toBe(422);
    });

    it("responde 400 con body no-JSON", async () => {
      const req = new Request(
        `http://x/api/admin/evaluations/${EVAL_ID}/grades?action=publish`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{roto" },
      );
      const res = await POST(req, ctx());
      expect(res!.status).toBe(400);
    });

    it("responde 422 cuando falta cohortId en el body", async () => {
      const res = await POST(postReq({}), ctx());
      expect(res!.status).toBe(422);
    });

    it("propaga el error de autorización (403)", async () => {
      staffResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
      const res = await POST(postReq({ cohortId: COHORT_ID }), ctx());
      expect(res!.status).toBe(403);
    });

    it("responde published:0 sin consultar notas cuando la cohorte no tiene matrículas", async () => {
      state.enrollmentsList = { data: [] };
      const res = await POST(postReq({ cohortId: COHORT_ID }), ctx());
      expect(res!.status).toBe(200);
      const body = await res!.json();
      expect(body.published).toBe(0);
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("publica las notas cargadas y aún no publicadas de la cohorte", async () => {
      state.enrollmentsList = { data: [{ id: ENROLLMENT_A }, { id: ENROLLMENT_B }] };
      state.gradeUpdate = { data: [{ id: "g1" }, { id: "g2" }], error: null };
      const res = await POST(postReq({ cohortId: COHORT_ID }), ctx());
      expect(res!.status).toBe(200);
      const body = await res!.json();
      expect(body.published).toBe(2);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      const [payload] = updateSpy.mock.calls[0];
      expect(payload.published_at).toBeDefined();
    });

    it("responde 500 cuando el update masivo falla", async () => {
      state.enrollmentsList = { data: [{ id: ENROLLMENT_A }] };
      state.gradeUpdate = { data: null, error: { message: "db down" } };
      const res = await POST(postReq({ cohortId: COHORT_ID }), ctx());
      expect(res!.status).toBe(500);
    });
  });
});
