import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data: unknown; error: unknown };

let certificatesResult: Result;

function makeBuilder() {
  const chain = ["select", "eq", "order", "limit"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = () => builder;
  }
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(certificatesResult).then(res, rej);
  return builder;
}

let createSignedUrlsMock: (paths: string[], expiresIn: number) => Promise<unknown>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => makeBuilder(),
    storage: {
      from: () => ({
        createSignedUrls: (paths: string[], expiresIn: number) =>
          createSignedUrlsMock(paths, expiresIn),
      }),
    },
  })),
}));

vi.mock("@/lib/certificates/get-certificate-url", () => ({
  CERT_URL_EXPIRY_DISPLAY: 3_600,
}));

const { GET } = await import("@/app/api/admin/certificates/route");

const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";

function getReq(qs: string) {
  return new Request(`http://x/api/admin/certificates${qs ? `?${qs}` : ""}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  authResult = { user: { id: "admin-1" } };
  createSignedUrlsMock = vi.fn(async (paths: string[]) => ({
    data: paths.map((path) => ({
      error: null,
      path,
      signedUrl: `https://signed.example.com/${path}`,
    })),
    error: null,
  }));
  certificatesResult = {
    data: [
      {
        id: "cert-1",
        student_name: "Ana Pérez",
        verification_code: "ABC123",
        issued_at: "2026-01-01T10:00:00.000Z",
        pdf_storage_path: "programa/cert-1.pdf",
      },
    ],
    error: null,
  };
});

describe("GET /api/admin/certificates", () => {
  it("401 cuando no autenticado", async () => {
    authResult = { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(401);
  });

  it("403 cuando no autorizado", async () => {
    authResult = { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(403);
  });

  it("422 cuando falta programId", async () => {
    const res = await GET(getReq(""));
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("programId es requerido");
  });

  it("500 cuando falla la consulta de certificados", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    certificatesResult = { data: null, error: { message: "boom" } };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toBe("Error al obtener certificados");
    expect(errSpy).toHaveBeenCalledWith("Error fetching certificates:", { message: "boom" });
    errSpy.mockRestore();
  });

  it("200 mapea certificados y resuelve pdfUrl firmada por lote", async () => {
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.certificates).toEqual([
      {
        id: "cert-1",
        studentName: "Ana Pérez",
        verificationCode: "ABC123",
        issuedAt: "2026-01-01T10:00:00.000Z",
        pdfUrl: "https://signed.example.com/programa/cert-1.pdf",
      },
    ]);
    expect(createSignedUrlsMock).toHaveBeenCalledWith(["programa/cert-1.pdf"], 3_600);
  });

  it("200 con data null normaliza a lista vacía sin llamar a createSignedUrls", async () => {
    certificatesResult = { data: null, error: null };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.certificates).toEqual([]);
    expect(createSignedUrlsMock).not.toHaveBeenCalled();
  });

  it("200 con pdf_storage_path null propaga pdfUrl null (sin URL firmada) y no llama a createSignedUrls", async () => {
    certificatesResult = {
      data: [
        {
          id: "cert-2",
          student_name: "Luis Soto",
          verification_code: "XYZ789",
          issued_at: "2026-02-01T10:00:00.000Z",
          pdf_storage_path: null,
        },
      ],
      error: null,
    };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    const json = await res!.json();
    expect(json.certificates[0].pdfUrl).toBeNull();
    expect(createSignedUrlsMock).not.toHaveBeenCalled();
  });

  it("200 con createSignedUrls fallando propaga pdfUrl null sin romper la respuesta", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createSignedUrlsMock = vi.fn(async () => ({ data: null, error: { message: "storage caído" } }));
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.certificates[0].pdfUrl).toBeNull();
    expect(errSpy).toHaveBeenCalledWith("Error al firmar certificados:", { message: "storage caído" });
    errSpy.mockRestore();
  });
});
