import { describe, it, expect, vi, beforeEach } from "vitest";

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data: unknown; error?: unknown };

// cohort_roles
let existingRoleResult: Result; // POST: chequeo de duplicado (select "id")
let insertRoleResult: Result; // POST: insert cohort_roles -> select().single()
let roleToDeleteResult: Result; // DELETE: lookup previo al borrado
let deleteRoleResult: { error: unknown }; // DELETE: delete cohort_roles

// instructors / profiles (ficha derivada del rol docente)
let instructorLookupResult: Result; // POST: ficha ya enlazada a esa cuenta
let instructorInsertResult: Result; // POST: alta de la ficha
let profileLookupResult: Result; // POST: nombre desde el que se copia la ficha
const instructorInsertSpy = vi.fn();

// enrollments
let enrollmentLookupResult: Result; // POST: matrícula existente
const enrollmentInsertSpy = vi.fn(async () => ({ error: null as unknown }));
const enrollmentUpdateEqSpy = vi.fn();

function chainableEq(getResult: () => Result) {
  const node = {
    eq: () => node,
    maybeSingle: () => Promise.resolve(getResult()),
  };
  return node;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "cohort_roles") {
        return {
          select: (cols: string) =>
            chainableEq(() => (cols === "id" ? existingRoleResult : roleToDeleteResult)),
          insert: () => ({
            select: () => ({ single: () => Promise.resolve(insertRoleResult) }),
          }),
          delete: () => ({
            eq: () => Promise.resolve(deleteRoleResult),
          }),
        };
      }
      if (table === "instructors") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: () => Promise.resolve(instructorLookupResult) }),
              }),
            }),
          }),
          insert: (row: unknown) => {
            instructorInsertSpy(row);
            return {
              select: () => ({ single: () => Promise.resolve(instructorInsertResult) }),
            };
          },
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve(profileLookupResult) }),
          }),
        };
      }
      if (table === "enrollments") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve(enrollmentLookupResult) }),
            }),
          }),
          insert: enrollmentInsertSpy,
          update: () => ({
            eq: () => ({
              eq: (...args: unknown[]) => {
                enrollmentUpdateEqSpy(...args);
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`tabla no mockeada: ${table}`);
    },
  })),
}));

const { POST, DELETE } = await import("@/app/api/admin/cohort-roles/route");

function postReq(body: unknown) {
  return new Request("http://x/api/admin/cohort-roles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function delReq(id?: string) {
  return new Request(`http://x/api/admin/cohort-roles${id ? `?id=${id}` : ""}`, {
    method: "DELETE",
  });
}

const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-555555555555";
const COHORT_ID = "bbbbbbbb-bbbb-4ccc-8ddd-555555555555";

describe("admin/cohort-roles POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authResult = { user: { id: "admin-1" } };
    existingRoleResult = { data: null };
    insertRoleResult = { data: { id: "cr1", user_id: USER_ID, cohort_id: COHORT_ID, role: "student" }, error: null };
    roleToDeleteResult = { data: null };
    deleteRoleResult = { error: null };
    enrollmentLookupResult = { data: null };
    instructorLookupResult = { data: null };
    instructorInsertResult = { data: { id: "inst-1", full_name: "Cristian Farias" }, error: null };
    profileLookupResult = { data: { full_name: "Cristian Farias" } };
  });

  it("rechaza con 401/403 si authorizeAdmin deniega", async () => {
    const denied = NextResponseError(403, "No autorizado");
    authResult = { error: denied };
    const res = await POST(postReq({ user_id: USER_ID, cohort_id: COHORT_ID, role: "student" }));
    expect(res).toBe(denied);
  });

  it("rechaza body inválido (JSON malformado) con 400", async () => {
    const res = await POST(postReq("{no-es-json"));
    expect(res!.status).toBe(400);
    const json = await res!.json();
    expect(json.error).toBe("Body inválido");
  });

  it("rechaza body JSON literal 'null' con 400", async () => {
    const res = await POST(postReq("null"));
    expect(res!.status).toBe(400);
    const json = await res!.json();
    expect(json.error).toBe("Body inválido");
  });

  it("rechaza si falta user_id/cohort_id/role con 422", async () => {
    const res = await POST(postReq({ user_id: USER_ID, cohort_id: COHORT_ID }));
    expect(res!.status).toBe(422);
  });

  it("rechaza un role fuera del enum con 422", async () => {
    const res = await POST(
      postReq({ user_id: USER_ID, cohort_id: COHORT_ID, role: "director" }),
    );
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toContain("student, teacher, assistant");
  });

  it("rechaza rol duplicado en la misma cohorte con 409", async () => {
    existingRoleResult = { data: { id: "ya-existe" } };
    const res = await POST(postReq({ user_id: USER_ID, cohort_id: COHORT_ID, role: "teacher" }));
    expect(res!.status).toBe(409);
  });

  it("responde 500 si el insert de cohort_roles falla", async () => {
    insertRoleResult = { data: null, error: { message: "db down" } };
    const res = await POST(postReq({ user_id: USER_ID, cohort_id: COHORT_ID, role: "teacher" }));
    expect(res!.status).toBe(500);
  });

  it("crea rol 'teacher' con 201, le crea la ficha docente y NO toca enrollments", async () => {
    insertRoleResult = { data: { id: "cr2", role: "teacher" }, error: null };
    const res = await POST(postReq({ user_id: USER_ID, cohort_id: COHORT_ID, role: "teacher" }));
    expect(res!.status).toBe(201);
    const json = await res!.json();
    // La ficha viaja en la respuesta: es lo que hace visible al docente en el
    // selector al crear una clase (`class_sessions.teacher_id` → `instructors`).
    expect(json).toEqual({
      id: "cr2",
      role: "teacher",
      instructor: { id: "inst-1", full_name: "Cristian Farias", created: true },
    });
    expect(instructorInsertSpy).toHaveBeenCalledWith({
      full_name: "Cristian Farias",
      profile_id: USER_ID,
      is_active: true,
    });
    expect(enrollmentInsertSpy).not.toHaveBeenCalled();
  });

  it("no duplica la ficha si el docente ya tenía una", async () => {
    insertRoleResult = { data: { id: "cr2", role: "teacher" }, error: null };
    instructorLookupResult = { data: { id: "inst-previa", full_name: "Paola Vicuña" } };
    const res = await POST(postReq({ user_id: USER_ID, cohort_id: COHORT_ID, role: "teacher" }));
    expect(res!.status).toBe(201);
    const json = await res!.json();
    expect(json.instructor).toEqual({
      id: "inst-previa",
      full_name: "Paola Vicuña",
      created: false,
    });
    expect(instructorInsertSpy).not.toHaveBeenCalled();
  });

  it("un 'assistant' NO genera ficha: tiene permisos, no es cara visible de la clase", async () => {
    insertRoleResult = { data: { id: "cr3", role: "assistant" }, error: null };
    const res = await POST(postReq({ user_id: USER_ID, cohort_id: COHORT_ID, role: "assistant" }));
    expect(res!.status).toBe(201);
    const json = await res!.json();
    expect(json.instructor).toBeNull();
    expect(instructorInsertSpy).not.toHaveBeenCalled();
  });

  it("el rol queda asignado aunque falle el alta de la ficha (el permiso vale por sí solo)", async () => {
    insertRoleResult = { data: { id: "cr2", role: "teacher" }, error: null };
    instructorInsertResult = { data: null, error: { message: "rls" } };
    const res = await POST(postReq({ user_id: USER_ID, cohort_id: COHORT_ID, role: "teacher" }));
    expect(res!.status).toBe(201);
    const json = await res!.json();
    expect(json.id).toBe("cr2");
    expect(json.instructor).toBeNull();
  });

  it("crea rol 'student' con 201 y matricula (enrollments.insert) cuando no había matrícula", async () => {
    const res = await POST(postReq({ user_id: USER_ID, cohort_id: COHORT_ID, role: "student" }));
    expect(res!.status).toBe(201);
    expect(enrollmentInsertSpy).toHaveBeenCalledWith({
      student_id: USER_ID,
      cohort_id: COHORT_ID,
      status: "active",
    });
  });

  it("crea rol 'student' con 201 pero NO duplica la matrícula si ya existía", async () => {
    enrollmentLookupResult = { data: { id: "enroll-1" } };
    const res = await POST(postReq({ user_id: USER_ID, cohort_id: COHORT_ID, role: "student" }));
    expect(res!.status).toBe(201);
    expect(enrollmentInsertSpy).not.toHaveBeenCalled();
  });

  it("crea rol 'student' con 201 aunque el insert de enrollments falle (no propaga el error)", async () => {
    enrollmentInsertSpy.mockResolvedValueOnce({ error: { message: "fk violation" } });
    const res = await POST(postReq({ user_id: USER_ID, cohort_id: COHORT_ID, role: "student" }));
    expect(res!.status).toBe(201);
  });
});

describe("admin/cohort-roles DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authResult = { user: { id: "admin-1" } };
    roleToDeleteResult = { data: { user_id: USER_ID, cohort_id: COHORT_ID, role: "student" } };
    deleteRoleResult = { error: null };
  });

  it("rechaza con 401/403 si authorizeAdmin deniega", async () => {
    const denied = NextResponseError(401, "No autenticado");
    authResult = { error: denied };
    const res = await DELETE(delReq("cr1"));
    expect(res).toBe(denied);
  });

  it("rechaza sin query param id con 422", async () => {
    const res = await DELETE(delReq());
    expect(res!.status).toBe(422);
  });

  it("responde 404 si el rol a borrar no existe", async () => {
    roleToDeleteResult = { data: null };
    const res = await DELETE(delReq("no-existe"));
    expect(res!.status).toBe(404);
  });

  it("responde 500 si el delete de cohort_roles falla", async () => {
    deleteRoleResult = { error: { message: "db down" } };
    const res = await DELETE(delReq("cr1"));
    expect(res!.status).toBe(500);
    expect(enrollmentUpdateEqSpy).not.toHaveBeenCalled();
  });

  it("borra un rol 'teacher' con 200 y NO toca enrollments", async () => {
    roleToDeleteResult = { data: { user_id: USER_ID, cohort_id: COHORT_ID, role: "teacher" } };
    const res = await DELETE(delReq("cr1"));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json).toEqual({ deleted: true });
    expect(enrollmentUpdateEqSpy).not.toHaveBeenCalled();
  });

  it("borra un rol 'student' con 200 y marca la matrícula como 'dropped'", async () => {
    const res = await DELETE(delReq("cr1"));
    expect(res!.status).toBe(200);
    expect(enrollmentUpdateEqSpy).toHaveBeenCalledWith("cohort_id", COHORT_ID);
  });
});

function NextResponseError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  }) as unknown as Response & { status: number };
}
