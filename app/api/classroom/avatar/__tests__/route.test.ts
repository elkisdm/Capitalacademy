import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock de Supabase: auth, storage y tabla profiles, todos controlables por test ---
type GetUserResult = { data: { user: { id: string } | null } };
type ErrResult = { error: unknown };
type PublicUrlResult = { data: { publicUrl: string } };
type ListResult = { data: Array<{ name: string }> | null };

let getUserResult: GetUserResult;
let uploadResult: ErrResult;
let publicUrlResult: PublicUrlResult;
let updateResult: ErrResult;
let listResult: ListResult;

const uploadSpy = vi.fn(async () => uploadResult);
const getPublicUrlSpy = vi.fn(() => publicUrlResult);
const listSpy = vi.fn(async () => listResult);
const removeSpy = vi.fn(async (): Promise<{ data: unknown[] | null; error: unknown }> => ({
  data: [],
  error: null,
}));
const updateEqSpy = vi.fn(async () => updateResult);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: () => Promise.resolve(getUserResult),
    },
    storage: {
      from: () => ({
        upload: uploadSpy,
        getPublicUrl: getPublicUrlSpy,
        list: listSpy,
        remove: removeSpy,
      }),
    },
    from: () => ({
      update: () => ({ eq: updateEqSpy }),
    }),
  })),
}));

const { POST, DELETE } = await import("@/app/api/classroom/avatar/route");

function makeFile(type: string, sizeBytes: number, name = "avatar.png") {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

function postReq(file: File | null) {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return new Request("http://localhost/api/classroom/avatar", {
    method: "POST",
    body: formData,
  });
}

function delReq() {
  return new Request("http://localhost/api/classroom/avatar", {
    method: "DELETE",
  });
}

describe("POST /api/classroom/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserResult = { data: { user: { id: "user-1" } } };
    uploadResult = { error: null };
    publicUrlResult = { data: { publicUrl: "https://cdn.test/avatars/user-1/avatar.jpg" } };
    updateResult = { error: null };
    listResult = { data: [] };
  });

  it("rechaza sin autenticación con 401", async () => {
    getUserResult = { data: { user: null } };
    const res = await POST(postReq(makeFile("image/png", 100)));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
  });

  it("rechaza cuando no se envía archivo con 400", async () => {
    const res = await POST(postReq(null));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("No se recibió archivo");
  });

  it("rechaza un tipo MIME no permitido con 422", async () => {
    const res = await POST(postReq(makeFile("application/pdf", 100)));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/Formato no permitido/);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("rechaza una imagen que supera 2 MB con 422", async () => {
    const res = await POST(postReq(makeFile("image/png", 2 * 1024 * 1024 + 1)));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/no puede superar 2 MB/);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("acepta una imagen de exactamente 2 MB (límite inclusive)", async () => {
    const res = await POST(postReq(makeFile("image/png", 2 * 1024 * 1024)));
    expect(res.status).toBe(200);
    expect(uploadSpy).toHaveBeenCalled();
  });

  it("devuelve 500 cuando falla la subida a Storage", async () => {
    uploadResult = { error: { message: "bucket lleno" } };
    const res = await POST(postReq(makeFile("image/webp", 100)));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al subir la imagen");
    // No debe intentar actualizar el perfil si la subida falló.
    expect(updateEqSpy).not.toHaveBeenCalled();
  });

  it("revierte el archivo en Storage cuando la subida ocurre pero falla el update de profiles", async () => {
    updateResult = { error: { message: "constraint violada" } };
    const res = await POST(postReq(makeFile("image/jpeg", 100)));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Imagen subida pero no se pudo actualizar el perfil");
    expect(uploadSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith(["user-1/avatar.jpg"]);
  });

  it("sube con éxito, mapea jpeg a extensión jpg y agrega cache-buster ?v=", async () => {
    const res = await POST(postReq(makeFile("image/jpeg", 100)));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.avatar_url).toMatch(
      /^https:\/\/cdn\.test\/avatars\/user-1\/avatar\.jpg\?v=\d+$/,
    );
    expect(uploadSpy).toHaveBeenCalledWith(
      "user-1/avatar.jpg",
      expect.anything(),
      { upsert: true, contentType: "image/jpeg" },
    );
  });

  it("sube con éxito usando la extensión webp tal cual", async () => {
    const res = await POST(postReq(makeFile("image/webp", 100)));
    expect(res.status).toBe(200);
    expect(uploadSpy).toHaveBeenCalledWith(
      "user-1/avatar.webp",
      expect.anything(),
      { upsert: true, contentType: "image/webp" },
    );
  });
});

describe("DELETE /api/classroom/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserResult = { data: { user: { id: "user-1" } } };
    listResult = { data: [] };
    updateResult = { error: null };
  });

  it("rechaza sin autenticación con 401", async () => {
    getUserResult = { data: { user: null } };
    const res = await DELETE(delReq());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
    expect(listSpy).not.toHaveBeenCalled();
  });

  it("no llama a remove() cuando el listado de Storage viene vacío", async () => {
    listResult = { data: [] };
    const res = await DELETE(delReq());
    expect(res.status).toBe(200);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("no llama a remove() cuando el listado de Storage viene null", async () => {
    listResult = { data: null };
    const res = await DELETE(delReq());
    expect(res.status).toBe(200);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("elimina los objetos listados con su ruta completa por usuario", async () => {
    listResult = { data: [{ name: "avatar.jpg" }, { name: "avatar.png" }] };
    const res = await DELETE(delReq());
    expect(res.status).toBe(200);
    expect(removeSpy).toHaveBeenCalledWith([
      "user-1/avatar.jpg",
      "user-1/avatar.png",
    ]);
  });

  it("responde avatar_url: null cuando todo sale bien", async () => {
    const res = await DELETE(delReq());
    const json = await res.json();
    expect(json.avatar_url).toBeNull();
  });

  it("responde 500 cuando falla el update de profiles, sin reportar avatar_url: null", async () => {
    updateResult = { error: { message: "fallo inesperado" } };
    const res = await DELETE(delReq());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("No se pudo actualizar el perfil");
    expect(updateEqSpy).toHaveBeenCalled();
  });

  it("responde 500 cuando falla remove() en Storage, sin llegar a actualizar el perfil", async () => {
    listResult = { data: [{ name: "avatar.jpg" }] };
    removeSpy.mockResolvedValueOnce({ data: null, error: { message: "RLS denegado" } });
    const res = await DELETE(delReq());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("No se pudo eliminar la imagen");
    expect(updateEqSpy).not.toHaveBeenCalled();
  });
});
