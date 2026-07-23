import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const PROGRAM_ID = "d1b2c3d4-e5f6-7890-abcd-ef1234567890";
const ACTOR = { id: "u1111111-1111-1111-1111-111111111111" };

function makeRequest(qs: string) {
  return new Request(`http://localhost/api/classroom/conversaciones/members${qs}`);
}

// ── Mutable mock state (cliente admin: supabase/admin) ───────────────
// El endpoint solo consulta `enrollments` y `profiles` una vez cada una
// por request (no hay ambigüedad de múltiples usos de la misma tabla).

const adminState = {
  enrollments: { data: [] as unknown, error: null as unknown },
  profiles: { data: [] as unknown, error: null as unknown },
  calls: [] as Array<{ table: string; prop: string; args: unknown[] }>,
};

function resolveAdmin(table: string) {
  if (table === "enrollments") return adminState.enrollments;
  if (table === "profiles") return adminState.profiles;
  return { data: null, error: null };
}

function createAdminBuilder(table: string) {
  const make = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve(resolveAdmin(table));
          }
          if (["select", "eq", "in"].includes(prop)) {
            return (...args: unknown[]) => {
              adminState.calls.push({ table, prop, args });
              return make();
            };
          }
          return undefined;
        },
      },
    );
  return make();
}

// ── Module mocks (hoisted por vitest) ─────────────────────────
// `getProgramAccess` y `getProgramStaffIds` ya tienen sus propias suites
// (lib/conversaciones/access, lib/profiles/program-staff); acá se mockean
// directo para aislar la lógica propia de este endpoint (merge de ids,
// resolución de perfiles, orden, filtro por `q` y el cap de 200).

const mockUser = { current: ACTOR as { id: string } | null };
const mockGetProgramAccess = vi.fn();
const mockGetProgramStaffIds = vi.fn();
const mockCreateAdminClient = vi.fn((..._args: unknown[]) => ({
  from: (table: string) => createAdminBuilder(table),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockUser.current } }),
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

vi.mock("@/lib/conversaciones/access", () => ({
  getProgramAccess: (...args: unknown[]) => mockGetProgramAccess(...args),
}));

vi.mock("@/lib/profiles/program-staff", () => ({
  getProgramStaffIds: (...args: unknown[]) => mockGetProgramStaffIds(...args),
}));

// ── Import handler (DESPUÉS de los mocks) ──────────────────────

const { GET } = await import("@/app/api/classroom/conversaciones/members/route");

// ── Reset de estado antes de cada test ─────────────────────────

beforeEach(() => {
  mockUser.current = ACTOR;

  adminState.enrollments = { data: [], error: null };
  adminState.profiles = { data: [], error: null };
  adminState.calls = [];

  mockGetProgramAccess.mockReset();
  mockGetProgramAccess.mockResolvedValue({ isStaff: false });

  mockGetProgramStaffIds.mockReset();
  mockGetProgramStaffIds.mockResolvedValue(new Set<string>());

  mockCreateAdminClient.mockClear();
});

describe("GET /api/classroom/conversaciones/members", () => {
  it("responde 401 si no hay usuario autenticado", async () => {
    mockUser.current = null;
    const res = await GET(makeRequest(`?programId=${PROGRAM_ID}`));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
  });

  it("responde 422 si falta el parámetro programId", async () => {
    const res = await GET(makeRequest(""));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("programId es requerido y debe ser un UUID válido");
  });

  it("responde 422 si programId no tiene formato UUID", async () => {
    const res = await GET(makeRequest("?programId=no-es-un-uuid"));
    expect(res.status).toBe(422);
  });

  it("responde 403 si el usuario no tiene acceso al programa", async () => {
    mockGetProgramAccess.mockResolvedValue(null);
    const res = await GET(makeRequest(`?programId=${PROGRAM_ID}`));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Sin acceso");
  });

  it("responde 200 con members:[] si no hay matriculados ni staff (evita consultar profiles)", async () => {
    adminState.enrollments = { data: [], error: null };
    mockGetProgramStaffIds.mockResolvedValue(new Set());

    const res = await GET(makeRequest(`?programId=${PROGRAM_ID}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ members: [] });

    // No debería haber ninguna llamada a `profiles` porque `ids.size === 0`
    // corta antes.
    expect(adminState.calls.some((c) => c.table === "profiles")).toBe(false);
  });

  it("devuelve members:[] si la consulta de perfiles no trae filas (data null)", async () => {
    adminState.enrollments = { data: [{ student_id: "stu-1" }], error: null };
    adminState.profiles = { data: null, error: { message: "db down" } };

    const res = await GET(makeRequest(`?programId=${PROGRAM_ID}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ members: [] });
  });

  it("usa 'Usuario' como full_name de respaldo cuando el perfil no tiene nombre", async () => {
    adminState.enrollments = { data: [{ student_id: "stu-1" }], error: null };
    adminState.profiles = { data: [{ id: "stu-1", full_name: null }], error: null };

    const res = await GET(makeRequest(`?programId=${PROGRAM_ID}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.members).toEqual([{ id: "stu-1", full_name: "Usuario" }]);
  });

  it("combina alumnos matriculados y staff del programa sin duplicar ids repetidos", async () => {
    adminState.enrollments = {
      data: [{ student_id: "stu-1" }, { student_id: "stu-2" }],
      error: null,
    };
    // stu-2 también es staff (docente matriculado): debe contarse una sola vez.
    mockGetProgramStaffIds.mockResolvedValue(new Set(["stu-2", "staff-1"]));
    adminState.profiles = {
      data: [
        { id: "stu-1", full_name: "Beatriz Alumna" },
        { id: "stu-2", full_name: "Carlos Docente" },
        { id: "staff-1", full_name: "Ana Admin" },
      ],
      error: null,
    };

    const res = await GET(makeRequest(`?programId=${PROGRAM_ID}`));
    expect(res.status).toBe(200);
    const json = await res.json();

    // 3 ids únicos (no 4) -> se refleja en el filtro `.in()` de profiles.
    const profilesInCall = adminState.calls.find(
      (c) => c.table === "profiles" && c.prop === "in",
    );
    expect((profilesInCall?.args[1] as string[]).length).toBe(3);

    // Orden alfabético por full_name (es).
    expect(json.members).toEqual([
      { id: "staff-1", full_name: "Ana Admin" },
      { id: "stu-1", full_name: "Beatriz Alumna" },
      { id: "stu-2", full_name: "Carlos Docente" },
    ]);
  });

  it("filtra por q (case-insensitive, con espacios) sobre el full_name", async () => {
    adminState.enrollments = {
      data: [{ student_id: "stu-1" }, { student_id: "stu-2" }],
      error: null,
    };
    adminState.profiles = {
      data: [
        { id: "stu-1", full_name: "Beatriz Alumna" },
        { id: "stu-2", full_name: "Carlos Docente" },
      ],
      error: null,
    };

    const res = await GET(makeRequest(`?programId=${PROGRAM_ID}&q=  BEA  `));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.members).toEqual([{ id: "stu-1", full_name: "Beatriz Alumna" }]);
  });

  it("responde members:[] cuando q no matchea a nadie", async () => {
    adminState.enrollments = { data: [{ student_id: "stu-1" }], error: null };
    adminState.profiles = {
      data: [{ id: "stu-1", full_name: "Beatriz Alumna" }],
      error: null,
    };

    const res = await GET(makeRequest(`?programId=${PROGRAM_ID}&q=zzz`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.members).toEqual([]);
  });

  it("capa la lista a 200 miembros DESPUÉS de ordenar alfabéticamente", async () => {
    const TOTAL = 205;
    const enrollmentRows = Array.from({ length: TOTAL }, (_, i) => ({
      student_id: `stu-${String(i).padStart(3, "0")}`,
    }));
    const profileRows = Array.from({ length: TOTAL }, (_, i) => ({
      id: `stu-${String(i).padStart(3, "0")}`,
      full_name: `Miembro ${String(i).padStart(3, "0")}`,
    }));

    adminState.enrollments = { data: enrollmentRows, error: null };
    adminState.profiles = { data: profileRows, error: null };

    const res = await GET(makeRequest(`?programId=${PROGRAM_ID}`));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.members.length).toBe(200);
    // Al ordenar antes de capar, quedan los primeros 200 alfabéticamente
    // (Miembro 000 .. Miembro 199), no los primeros 200 por inserción.
    expect(json.members[0].full_name).toBe("Miembro 000");
    expect(json.members[199].full_name).toBe("Miembro 199");
    expect(json.members.some((m: { full_name: string }) => m.full_name === "Miembro 200")).toBe(
      false,
    );
  });
});
