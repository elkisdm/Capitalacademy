import { describe, it, expect, vi, beforeEach } from "vitest";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data?: unknown; error?: unknown };

type State = {
  sessionResult: Result; // class_sessions select(...).eq(id).single()
  lessonResult: Result; // GET: lessons select(cols de repetición).eq(lesson_id).single()
  lastPosResult: Result; // POST: lessons select("position").order().limit().maybeSingle()
  slugRowsResult: Result; // POST: lessons select("slug").not(...)
  insertResult: Result; // POST: lessons insert(...).select("id").single()
  linkResult: Result; // POST: class_sessions update({lesson_id}).eq(id)
  unlinkResult: Result; // DELETE: class_sessions update({lesson_id: null}).eq(id)
  lessonsDeleteResult: Result; // rollback (POST) o borrado real (DELETE) de lessons
  progressCountResult: { count: number | null; error?: unknown }; // DELETE: video_progress select(count).eq(lesson_id)
};
let state: State;

function makeBuilder(table: string) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const methods = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "order",
    "limit",
    "not",
    "is",
    "like",
  ];
  const b: Record<string, unknown> = {};
  for (const m of methods) {
    b[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return b;
    };
  }
  const hasCall = (m: string) => calls.some((c) => c.method === m);
  const findCall = (m: string) => calls.find((c) => c.method === m);

  const resolve = (): Result => {
    if (table === "class_sessions") {
      if (hasCall("update")) {
        const updateCall = findCall("update");
        const payload = updateCall?.args[0] as
          | { lesson_id?: unknown }
          | undefined;
        if (payload && payload.lesson_id === null) return state.unlinkResult;
        return state.linkResult;
      }
      return state.sessionResult;
    }
    if (table === "lessons") {
      if (hasCall("insert")) return state.insertResult;
      if (hasCall("delete")) return state.lessonsDeleteResult;
      const selectCall = findCall("select");
      const cols = selectCall?.args[0];
      if (cols === "position") return state.lastPosResult;
      if (cols === "slug") return state.slugRowsResult;
      return state.lessonResult;
    }
    if (table === "video_progress") {
      return state.progressCountResult as unknown as Result;
    }
    return { data: null, error: null };
  };

  b.single = () => Promise.resolve(resolve());
  b.maybeSingle = () => Promise.resolve(resolve());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (table: string) => makeBuilder(table) })),
}));

const { GET, POST, DELETE } = await import(
  "@/app/api/admin/sessions/[sessionId]/recording/route"
);

const SESSION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-999999999999";
const MODULE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const LESSON_ID = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";

function ctx(sessionId = SESSION_ID) {
  return { params: Promise.resolve({ sessionId }) };
}

function req(method: string) {
  return new Request("http://x/api/admin/sessions/" + SESSION_ID + "/recording", {
    method,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authResult = { user: { id: "admin-1" } };
  state = {
    sessionResult: {
      data: {
        id: SESSION_ID,
        cohort_id: "cohort-1",
        module_id: MODULE_ID,
        lesson_id: null,
        title: "Clase 1",
      },
      error: null,
    },
    lessonResult: {
      data: {
        id: LESSON_ID,
        slug: "repeticion-clase-1",
        mux_upload_id: "up_1",
        mux_playback_id: "pb_1",
        mux_error: null,
        video_duration_seconds: 120,
        thumbnail_url: "https://example.com/thumb.jpg",
      },
      error: null,
    },
    lastPosResult: { data: null, error: null },
    slugRowsResult: { data: [{ slug: "otra-cosa" }], error: null },
    insertResult: { data: { id: LESSON_ID }, error: null },
    linkResult: { data: { id: "11111111-1111-4111-8111-111111111111" }, error: null },
    unlinkResult: { error: null },
    lessonsDeleteResult: { error: null },
    progressCountResult: { count: 0, error: null },
  };
});

describe("GET /api/admin/sessions/[sessionId]/recording", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await GET(req("GET"), ctx());
    expect(res!.status).toBe(403);
  });

  it("422 cuando el id no es un UUID válido", async () => {
    const res = await GET(req("GET"), ctx("no-es-un-uuid"));
    expect(res!.status).toBe(422);
  });

  it("404 cuando la sesión no existe", async () => {
    state.sessionResult = { data: null, error: null };
    const res = await GET(req("GET"), ctx());
    expect(res!.status).toBe(404);
  });

  it("200 sin lección: moduleMissing=true cuando la sesión no tiene módulo", async () => {
    state.sessionResult = {
      data: {
        id: SESSION_ID,
        cohort_id: "cohort-1",
        module_id: null,
        lesson_id: null,
        title: "Clase 1",
      },
      error: null,
    };
    const res = await GET(req("GET"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json).toEqual({ lessonId: null, recording: null, moduleMissing: true, nativa: null });
  });

  it("200 sin lección: moduleMissing=false cuando la sesión sí tiene módulo", async () => {
    const res = await GET(req("GET"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json).toEqual({ lessonId: null, recording: null, moduleMissing: false, nativa: null });
  });

  it("200 con lección preparada: devuelve el estado Mux de la repetición", async () => {
    state.sessionResult = {
      data: {
        id: SESSION_ID,
        cohort_id: "cohort-1",
        module_id: MODULE_ID,
        lesson_id: LESSON_ID,
        title: "Clase 1",
      },
      error: null,
    };
    const res = await GET(req("GET"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.lessonId).toBe(LESSON_ID);
    expect(json.recording.mux_playback_id).toBe("pb_1");
    expect(json.moduleMissing).toBe(false);
  });

  it("200 con lección enlazada pero fila de lección ausente: recording=null", async () => {
    state.sessionResult = {
      data: {
        id: SESSION_ID,
        cohort_id: "cohort-1",
        module_id: MODULE_ID,
        lesson_id: LESSON_ID,
        title: "Clase 1",
      },
      error: null,
    };
    state.lessonResult = { data: null, error: null };
    const res = await GET(req("GET"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.recording).toBeNull();
  });
});

describe("POST /api/admin/sessions/[sessionId]/recording", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await POST(req("POST"), ctx());
    expect(res!.status).toBe(403);
  });

  it("422 cuando el id no es un UUID válido", async () => {
    const res = await POST(req("POST"), ctx("no-es-un-uuid"));
    expect(res!.status).toBe(422);
  });

  it("404 cuando la sesión no existe", async () => {
    state.sessionResult = { data: null, error: null };
    const res = await POST(req("POST"), ctx());
    expect(res!.status).toBe(404);
  });

  it("200 idempotente: si ya hay lección enlazada, la devuelve sin crear nada", async () => {
    state.sessionResult = {
      data: {
        id: SESSION_ID,
        cohort_id: "cohort-1",
        module_id: MODULE_ID,
        lesson_id: LESSON_ID,
        title: "Clase 1",
      },
      error: null,
    };
    const res = await POST(req("POST"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json).toEqual({ lessonId: LESSON_ID });
  });

  it("422 cuando la sesión no tiene módulo asignado", async () => {
    state.sessionResult = {
      data: {
        id: SESSION_ID,
        cohort_id: "cohort-1",
        module_id: null,
        lesson_id: null,
        title: "Clase 1",
      },
      error: null,
    };
    const res = await POST(req("POST"), ctx());
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toMatch(/módulo/);
  });

  it("500 cuando falla el insert de la lección-repetición", async () => {
    state.insertResult = { data: null, error: { message: "boom" } };
    const res = await POST(req("POST"), ctx());
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toMatch(/preparar la repetición/);
  });

  it("500 y hace rollback de la lección cuando falla el enlace a la sesión", async () => {
    state.linkResult = { error: { message: "boom" } };
    const res = await POST(req("POST"), ctx());
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toMatch(/enlazar la repetición/);
  });

  it("200 crea y enlaza la lección-repetición usando el título de la sesión", async () => {
    state.lastPosResult = { data: { position: 3 }, error: null };
    const res = await POST(req("POST"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json).toEqual({ lessonId: LESSON_ID });
  });

  it("200 crea la lección cuando la consulta de slugs tomados devuelve null", async () => {
    state.slugRowsResult = { data: null, error: null };
    const res = await POST(req("POST"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json).toEqual({ lessonId: LESSON_ID });
  });

  it("200 usa el título por defecto cuando la sesión no tiene título", async () => {
    state.sessionResult = {
      data: {
        id: SESSION_ID,
        cohort_id: "cohort-1",
        module_id: MODULE_ID,
        lesson_id: null,
        title: null,
      },
      error: null,
    };
    const res = await POST(req("POST"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json).toEqual({ lessonId: LESSON_ID });
  });
});

describe("DELETE /api/admin/sessions/[sessionId]/recording", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await DELETE(req("DELETE"), ctx());
    expect(res!.status).toBe(403);
  });

  it("422 cuando el id no es un UUID válido", async () => {
    const res = await DELETE(req("DELETE"), ctx("no-es-un-uuid"));
    expect(res!.status).toBe(422);
  });

  it("404 cuando la sesión no existe", async () => {
    state.sessionResult = { data: null, error: null };
    const res = await DELETE(req("DELETE"), ctx());
    expect(res!.status).toBe(404);
  });

  it("200 sin lección enlazada: no hace nada y devuelve ok", async () => {
    const res = await DELETE(req("DELETE"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json).toEqual({ ok: true });
  });

  it("500 cuando falla el desenlace", async () => {
    state.sessionResult = {
      data: {
        id: SESSION_ID,
        cohort_id: "cohort-1",
        module_id: MODULE_ID,
        lesson_id: LESSON_ID,
        title: "Clase 1",
      },
      error: null,
    };
    state.unlinkResult = { error: { message: "boom" } };
    const res = await DELETE(req("DELETE"), ctx());
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toMatch(/desenlazar/);
  });

  it("500 cuando el desenlace funciona pero falla el borrado de la lección", async () => {
    state.sessionResult = {
      data: {
        id: SESSION_ID,
        cohort_id: "cohort-1",
        module_id: MODULE_ID,
        lesson_id: LESSON_ID,
        title: "Clase 1",
      },
      error: null,
    };
    state.lessonsDeleteResult = { error: { message: "boom" } };
    const res = await DELETE(req("DELETE"), ctx());
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toMatch(/borrar la lección-repetición/);
  });

  it("409 cuando la lección-repetición tiene progreso de alumnos: no desenlaza ni borra", async () => {
    state.sessionResult = {
      data: {
        id: SESSION_ID,
        cohort_id: "cohort-1",
        module_id: MODULE_ID,
        lesson_id: LESSON_ID,
        title: "Clase 1",
      },
      error: null,
    };
    state.progressCountResult = { count: 2, error: null };
    // Si el desenlace se ejecutara pese a la guarda, este error lo delataría
    // (la respuesta sería 500 "desenlazar" en vez de 409).
    state.unlinkResult = { error: { message: "boom" } };
    const res = await DELETE(req("DELETE"), ctx());
    expect(res!.status).toBe(409);
    const json = await res!.json();
    expect(json.error).toMatch(/ya tiene progreso de alumnos/);
  });

  it("200 desenlaza y borra la lección-repetición", async () => {
    state.sessionResult = {
      data: {
        id: SESSION_ID,
        cohort_id: "cohort-1",
        module_id: MODULE_ID,
        lesson_id: LESSON_ID,
        title: "Clase 1",
      },
      error: null,
    };
    const res = await DELETE(req("DELETE"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json).toEqual({ ok: true });
  });
});
