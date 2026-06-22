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

// Storage admin: list() controla si el objeto subido "existe"; remove() registra
// la limpieza del objeto al borrar.
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

const { POST, DELETE } = await import("@/app/api/admin/resources/route");

function postReq(body: unknown) {
  return new Request("http://localhost/api/admin/resources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function delReq(id?: string) {
  return new Request(
    `http://localhost/api/admin/resources${id ? `?id=${id}` : ""}`,
    { method: "DELETE" },
  );
}

describe("admin/resources route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maxPosResult = { data: { position: 2 } };
    insertResult = { data: { id: "r1" }, error: null };
    deleteResult = { data: [{ id: "r1", storage_path: null }], error: null };
    listResult = { data: [{ name: "abc-guia.pdf", metadata: { size: 1234 } }] };
  });

  // --- POST link: validación de URL (XSS) ---
  it("rejects a javascript: URL with 422 (no se inserta)", async () => {
    const res = await POST(
      postReq({ source: "link", lessonId: "l1", title: "t", type: "link", url: "javascript:alert(1)" }),
    );
    expect(res!.status).toBe(422);
  });

  it("rejects a data: URL with 422", async () => {
    const res = await POST(
      postReq({ source: "link", lessonId: "l1", title: "t", type: "link", url: "data:text/html,<script>1</script>" }),
    );
    expect(res!.status).toBe(422);
  });

  it("rejects missing required fields with 422", async () => {
    const res = await POST(postReq({ source: "link", lessonId: "l1" }));
    expect(res!.status).toBe(422);
  });

  it("rejects a payload without source discriminator with 422", async () => {
    const res = await POST(
      postReq({ lessonId: "l1", title: "Guía", type: "pdf", url: "https://x.com/guia.pdf" }),
    );
    expect(res!.status).toBe(422);
  });

  it("accepts a valid https URL with 201", async () => {
    const res = await POST(
      postReq({ source: "link", lessonId: "l1", title: "Guía", type: "pdf", url: "https://x.com/guia.pdf" }),
    );
    expect(res!.status).toBe(201);
  });

  // --- POST archivo subido ---
  it("accepts an uploaded file when the object exists with 201", async () => {
    const res = await POST(
      postReq({
        source: "file",
        lessonId: "l1",
        title: "Manual",
        type: "document",
        storagePath: "l1/abc-guia.pdf",
        fileSizeBytes: 1234,
      }),
    );
    expect(res!.status).toBe(201);
  });

  it("rejects a storagePath that does not belong to the lesson with 422", async () => {
    const res = await POST(
      postReq({
        source: "file",
        lessonId: "l1",
        title: "Manual",
        type: "document",
        storagePath: "otra-leccion/abc-guia.pdf",
      }),
    );
    expect(res!.status).toBe(422);
  });

  it("rejects an uploaded file when the object is missing in Storage with 422", async () => {
    listResult = { data: [] };
    const res = await POST(
      postReq({
        source: "file",
        lessonId: "l1",
        title: "Manual",
        type: "document",
        storagePath: "l1/abc-guia.pdf",
      }),
    );
    expect(res!.status).toBe(422);
  });

  // --- DELETE: honesto (sin .select() mentía con {deleted:true}) ---
  it("returns 422 when id is missing", async () => {
    const res = await DELETE(delReq());
    expect(res!.status).toBe(422);
  });

  it("returns 404 when nothing was deleted (id inexistente o bloqueado por RLS)", async () => {
    deleteResult = { data: [], error: null };
    const res = await DELETE(delReq("nope"));
    expect(res!.status).toBe(404);
  });

  it("returns deleted:true when a row was actually removed", async () => {
    const res = await DELETE(delReq("r1"));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.deleted).toBe(true);
    // Recurso por URL (storage_path null): no se toca Storage.
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("removes the storage object when deleting an uploaded resource", async () => {
    deleteResult = { data: [{ id: "r1", storage_path: "l1/abc-guia.pdf" }], error: null };
    const res = await DELETE(delReq("r1"));
    expect(res!.status).toBe(200);
    expect(removeSpy).toHaveBeenCalledWith(["l1/abc-guia.pdf"]);
  });
});
