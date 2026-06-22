import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/authorize-admin", () => ({
  requireStaff: vi.fn(async () => ({ user: { id: "staff-1" } })),
}));

type Result = { data: unknown; error?: unknown };
let maxPosResult: Result;
let insertResult: Result;
let deleteResult: Result;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({ maybeSingle: () => Promise.resolve(maxPosResult) }),
          }),
        }),
      }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve(insertResult) }) }),
      delete: () => ({ eq: () => ({ select: () => Promise.resolve(deleteResult) }) }),
    }),
  })),
}));

let listResult: Result;
const removeSpy = vi.fn(async () => ({ data: [], error: null }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: () => ({
        list: () => Promise.resolve(listResult),
        remove: removeSpy,
      }),
    },
  })),
}));

const { POST, DELETE } = await import("@/app/api/admin/session-resources/route");

const SESSION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-555555555555";

function postReq(body: unknown) {
  return new Request("http://x/api/admin/session-resources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function delReq(id?: string) {
  return new Request(`http://x/api/admin/session-resources${id ? `?id=${id}` : ""}`, {
    method: "DELETE",
  });
}

describe("admin/session-resources route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maxPosResult = { data: { position: 1 } };
    insertResult = { data: { id: "sr1" }, error: null };
    deleteResult = { data: [{ id: "sr1", storage_path: null }], error: null };
    listResult = { data: [{ name: "abc-doc.pdf", metadata: { size: 999 } }] };
  });

  it("rechaza javascript: URL con 422", async () => {
    const res = await POST(
      postReq({ source: "link", sessionId: SESSION_ID, title: "t", type: "link", url: "javascript:alert(1)" }),
    );
    expect(res!.status).toBe(422);
  });

  it("rechaza payload sin source con 422", async () => {
    const res = await POST(
      postReq({ sessionId: SESSION_ID, title: "t", type: "pdf", url: "https://x.com/a.pdf" }),
    );
    expect(res!.status).toBe(422);
  });

  it("acepta link https con 201", async () => {
    const res = await POST(
      postReq({ source: "link", sessionId: SESSION_ID, title: "Lectura", type: "pdf", url: "https://x.com/a.pdf" }),
    );
    expect(res!.status).toBe(201);
  });

  it("acepta archivo subido cuando el objeto existe con 201", async () => {
    const res = await POST(
      postReq({
        source: "file",
        sessionId: SESSION_ID,
        title: "El camino del lobo",
        type: "pdf",
        storagePath: `s/${SESSION_ID}/abc-doc.pdf`,
        fileSizeBytes: 999,
      }),
    );
    expect(res!.status).toBe(201);
  });

  it("rechaza storagePath que no corresponde a la sesión con 422", async () => {
    const res = await POST(
      postReq({
        source: "file",
        sessionId: SESSION_ID,
        title: "x",
        type: "pdf",
        storagePath: "s/otra-sesion/abc-doc.pdf",
      }),
    );
    expect(res!.status).toBe(422);
  });

  it("rechaza archivo inexistente en Storage con 422", async () => {
    listResult = { data: [] };
    const res = await POST(
      postReq({
        source: "file",
        sessionId: SESSION_ID,
        title: "x",
        type: "pdf",
        storagePath: `s/${SESSION_ID}/abc-doc.pdf`,
      }),
    );
    expect(res!.status).toBe(422);
  });

  it("DELETE 404 cuando no se borró nada", async () => {
    deleteResult = { data: [], error: null };
    const res = await DELETE(delReq("nope"));
    expect(res!.status).toBe(404);
  });

  it("DELETE de archivo subido elimina el objeto de Storage", async () => {
    deleteResult = { data: [{ id: "sr1", storage_path: `s/${SESSION_ID}/abc-doc.pdf` }], error: null };
    const res = await DELETE(delReq("sr1"));
    expect(res!.status).toBe(200);
    expect(removeSpy).toHaveBeenCalledWith([`s/${SESSION_ID}/abc-doc.pdf`]);
  });
});
