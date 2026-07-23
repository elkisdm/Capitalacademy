import { describe, it, expect, vi, beforeEach } from "vitest";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data?: unknown; error?: unknown };

type State = {
  deliverableResult: Result; // "deliverables" .select("*").eq(id).single()
  enrollmentsResult: Result; // "enrollments" .select(...).eq(...).in(...)
  submissionsResult: Result; // "deliverable_submissions" .select(...).eq(...).order(...)
  profilesResult: Result; // "profiles" .select(...).in(id, orphanIds) — solo huérfanos
  signedUrlsResult: Result; // storage.createSignedUrls
};
let state: State;

function resultFor(table: string): Result {
  if (table === "deliverables") return state.deliverableResult;
  if (table === "enrollments") return state.enrollmentsResult;
  if (table === "deliverable_submissions") return state.submissionsResult;
  if (table === "profiles") return state.profilesResult;
  return { data: null, error: null };
}

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "order"];
  for (const m of methods) {
    b[m] = (..._args: unknown[]) => b;
  }
  b.single = () => Promise.resolve(resultFor(table));
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resultFor(table)).then(res, rej);
  return b;
}

const createSignedUrlsSpy = vi.fn(async () => state.signedUrlsResult);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => makeBuilder(table),
    storage: {
      from: () => ({ createSignedUrls: createSignedUrlsSpy }),
    },
  })),
}));

const { GET } = await import(
  "@/app/api/admin/deliverables/[deliverableId]/submissions/route"
);

const DELIVERABLE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-999999999999";

function ctx() {
  return { params: Promise.resolve({ deliverableId: DELIVERABLE_ID }) };
}

function req() {
  return new Request("http://x/api/admin/deliverables/" + DELIVERABLE_ID + "/submissions");
}

beforeEach(() => {
  vi.clearAllMocks();
  authResult = { user: { id: "admin-1" } };
  state = {
    deliverableResult: {
      data: { id: DELIVERABLE_ID, program_id: "prog-1", title: "Entregable 1" },
      error: null,
    },
    enrollmentsResult: { data: [], error: null },
    submissionsResult: { data: [], error: null },
    profilesResult: { data: [], error: null },
    signedUrlsResult: { data: [], error: null },
  };
});

describe("GET /api/admin/deliverables/[deliverableId]/submissions", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await GET(req(), ctx());
    expect(res!.status).toBe(403);
  });

  it("404 cuando el entregable no existe", async () => {
    state.deliverableResult = { data: null, error: null };
    const res = await GET(req(), ctx());
    expect(res!.status).toBe(404);
    const json = await res!.json();
    expect(json.error).toBe("Entregable no encontrado");
  });

  it("404 cuando la consulta del entregable falla", async () => {
    state.deliverableResult = { data: null, error: { message: "boom" } };
    const res = await GET(req(), ctx());
    expect(res!.status).toBe(404);
  });

  it("200 con roster vacío cuando no hay matrículas ni entregas", async () => {
    const res = await GET(req(), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.deliverable.id).toBe(DELIVERABLE_ID);
    expect(json.roster).toEqual([]);
  });

  it("alumno matriculado sin entrega: submitted false y files vacío", async () => {
    state.enrollmentsResult = {
      data: [
        {
          student_id: "s1",
          profiles: { id: "s1", email: "s1@x.com", full_name: "Alumno Uno" },
        },
      ],
      error: null,
    };
    const res = await GET(req(), ctx());
    const json = await res!.json();
    expect(json.roster).toHaveLength(1);
    expect(json.roster[0].submitted).toBe(false);
    expect(json.roster[0].files).toEqual([]);
    expect(json.roster[0].enrolled).toBe(true);
  });

  it("alumno matriculado con una entrega: submitted true y signedUrl resuelto", async () => {
    state.enrollmentsResult = {
      data: [
        {
          student_id: "s1",
          profiles: { id: "s1", email: "s1@x.com", full_name: "Alumno Uno" },
        },
      ],
      error: null,
    };
    state.submissionsResult = {
      data: [
        {
          id: "sub-1",
          student_id: "s1",
          filename: "tarea.pdf",
          storage_path: "prog-1/s1/tarea.pdf",
          uploaded_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      error: null,
    };
    state.signedUrlsResult = {
      data: [{ path: "prog-1/s1/tarea.pdf", signedUrl: "https://signed.example/tarea.pdf" }],
      error: null,
    };
    const res = await GET(req(), ctx());
    const json = await res!.json();
    expect(json.roster).toHaveLength(1);
    expect(json.roster[0].submitted).toBe(true);
    expect(json.roster[0].files).toHaveLength(1);
    expect(json.roster[0].files[0].signedUrl).toBe("https://signed.example/tarea.pdf");
    expect(json.roster[0].files[0].id).toBe("sub-1");
  });

  it("un alumno con múltiples entregas acumula todos los archivos", async () => {
    state.enrollmentsResult = {
      data: [
        {
          student_id: "s1",
          profiles: { id: "s1", email: "s1@x.com", full_name: "Alumno Uno" },
        },
      ],
      error: null,
    };
    state.submissionsResult = {
      data: [
        {
          id: "sub-1",
          student_id: "s1",
          filename: "a.pdf",
          storage_path: "p/s1/a.pdf",
          uploaded_at: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "sub-2",
          student_id: "s1",
          filename: "b.pdf",
          storage_path: "p/s1/b.pdf",
          uploaded_at: "2026-08-02T00:00:00.000Z",
        },
      ],
      error: null,
    };
    state.signedUrlsResult = {
      data: [
        { path: "p/s1/a.pdf", signedUrl: "https://signed.example/a.pdf" },
        { path: "p/s1/b.pdf", signedUrl: "https://signed.example/b.pdf" },
      ],
      error: null,
    };
    const res = await GET(req(), ctx());
    const json = await res!.json();
    expect(json.roster).toHaveLength(1);
    expect(json.roster[0].files).toHaveLength(2);
  });

  it("dedupe: dos filas de matrícula del mismo alumno (ej. activa y completed) no lo duplican en el roster", async () => {
    state.enrollmentsResult = {
      data: [
        {
          student_id: "s1",
          profiles: { id: "s1", email: "s1@x.com", full_name: "Alumno Uno" },
        },
        {
          student_id: "s1",
          profiles: { id: "s1", email: "s1@x.com", full_name: "Alumno Uno" },
        },
      ],
      error: null,
    };
    const res = await GET(req(), ctx());
    const json = await res!.json();
    expect(json.roster).toHaveLength(1);
  });

  it("fila de matrícula sin profiles (join vacío) se descarta sin romper", async () => {
    state.enrollmentsResult = {
      data: [{ student_id: "s1", profiles: null }],
      error: null,
    };
    const res = await GET(req(), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.roster).toEqual([]);
  });

  it("entrega huérfana (student_id sin matrícula activa/completed) se resuelve vía perfil y marca enrolled false", async () => {
    // Sin matrículas para este programa.
    state.enrollmentsResult = { data: [], error: null };
    state.submissionsResult = {
      data: [
        {
          id: "sub-1",
          student_id: "s-huerfano",
          filename: "tarea.pdf",
          storage_path: "p/s-huerfano/tarea.pdf",
          uploaded_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      error: null,
    };
    state.signedUrlsResult = {
      data: [{ path: "p/s-huerfano/tarea.pdf", signedUrl: "https://signed.example/x.pdf" }],
      error: null,
    };
    state.profilesResult = {
      data: [{ id: "s-huerfano", email: "huerfano@x.com", full_name: "Ex Alumno" }],
      error: null,
    };
    const res = await GET(req(), ctx());
    const json = await res!.json();
    expect(json.roster).toHaveLength(1);
    expect(json.roster[0].enrolled).toBe(false);
    expect(json.roster[0].submitted).toBe(true);
    expect(json.roster[0].student.email).toBe("huerfano@x.com");
  });

  it("entrega huérfana cuyo perfil ya no existe desaparece del roster en vez de listarse", async () => {
    // BUG: si el `student_id` de una entrega no tiene matrícula activa/completed
    // en el programa Y el perfil fue borrado (o el lookup no lo devuelve), la
    // entrega nunca aparece en el roster: `studentsById` nunca gana esa key
    // porque solo se puebla desde `orphanProfiles`, así que el `roster` final
    // (armado desde `studentsById.values()`) omite silenciosamente al alumno
    // y su(s) archivo(s) entregado(s), sin error ni aviso.
    state.enrollmentsResult = { data: [], error: null };
    state.submissionsResult = {
      data: [
        {
          id: "sub-1",
          student_id: "s-borrado",
          filename: "tarea.pdf",
          storage_path: "p/s-borrado/tarea.pdf",
          uploaded_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      error: null,
    };
    state.profilesResult = { data: [], error: null };
    const res = await GET(req(), ctx());
    const json = await res!.json();
    expect(json.roster).toEqual([]);
  });

  it("no consulta perfiles huérfanos cuando todas las entregas ya tienen alumno matriculado", async () => {
    state.enrollmentsResult = {
      data: [
        {
          student_id: "s1",
          profiles: { id: "s1", email: "s1@x.com", full_name: "Alumno Uno" },
        },
      ],
      error: null,
    };
    state.submissionsResult = {
      data: [
        {
          id: "sub-1",
          student_id: "s1",
          filename: "a.pdf",
          storage_path: "p/s1/a.pdf",
          uploaded_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      error: null,
    };
    state.signedUrlsResult = {
      data: [{ path: "p/s1/a.pdf", signedUrl: "https://signed.example/a.pdf" }],
      error: null,
    };
    // Si el código consultara profiles igual, este resultado lo delataría
    // marcando erróneamente enrolled:false.
    state.profilesResult = {
      data: [{ id: "s1", email: "otro@x.com", full_name: "No debería usarse" }],
      error: null,
    };
    const res = await GET(req(), ctx());
    const json = await res!.json();
    expect(json.roster[0].enrolled).toBe(true);
    expect(json.roster[0].student.email).toBe("s1@x.com");
  });

  it("enrollments null (fallo silencioso de la consulta) no rompe y produce roster vacío", async () => {
    state.enrollmentsResult = { data: null, error: { message: "boom" } };
    const res = await GET(req(), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.roster).toEqual([]);
  });

  it("submissions null (fallo silencioso de la consulta) no rompe y no llama a createSignedUrls", async () => {
    state.submissionsResult = { data: null, error: { message: "boom" } };
    const res = await GET(req(), ctx());
    expect(res!.status).toBe(200);
    expect(createSignedUrlsSpy).not.toHaveBeenCalled();
  });

  it("entregas sin storage_path no llaman a createSignedUrls y quedan con signedUrl null", async () => {
    state.enrollmentsResult = {
      data: [
        {
          student_id: "s1",
          profiles: { id: "s1", email: "s1@x.com", full_name: "Alumno Uno" },
        },
      ],
      error: null,
    };
    state.submissionsResult = {
      data: [
        {
          id: "sub-1",
          student_id: "s1",
          filename: "a.pdf",
          storage_path: null,
          uploaded_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      error: null,
    };
    const res = await GET(req(), ctx());
    const json = await res!.json();
    expect(createSignedUrlsSpy).not.toHaveBeenCalled();
    expect(json.roster[0].files[0].signedUrl).toBeNull();
  });

  it("error al firmar URLs deja signedUrl null para todas las entregas", async () => {
    state.enrollmentsResult = {
      data: [
        {
          student_id: "s1",
          profiles: { id: "s1", email: "s1@x.com", full_name: "Alumno Uno" },
        },
      ],
      error: null,
    };
    state.submissionsResult = {
      data: [
        {
          id: "sub-1",
          student_id: "s1",
          filename: "a.pdf",
          storage_path: "p/s1/a.pdf",
          uploaded_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      error: null,
    };
    state.signedUrlsResult = { data: null, error: { message: "boom" } };
    const res = await GET(req(), ctx());
    const json = await res!.json();
    expect(json.roster[0].files[0].signedUrl).toBeNull();
  });
});
