import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSessionStaff } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

// 50 MB. También lo aplica el bucket (file_size_limit) y se valida en el cliente.
const MAX_SIZE = 50 * 1024 * 1024;
const BUCKET = "lesson-resources"; // bucket compartido de recursos del classroom

const schema = z.object({
  // uuidLike (no z.uuid()): las sesiones semilla usan UUIDs no-RFC-4122 que
  // z.string().uuid() rechaza con 422 → rompía la subida de archivos.
  sessionId: uuidLike,
  filename: z.string().trim().min(1, "filename es requerido").max(255),
  size: z
    .number()
    .int()
    .positive("size debe ser positivo")
    .max(MAX_SIZE, "El archivo no puede superar 50 MB"),
});

function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
  return cleaned || "archivo";
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { sessionId, filename } = parsed.data;

  const staff = await requireSessionStaff(sessionId);
  if ("error" in staff) return staff.error;
  // Path con prefijo de sesión: aísla los archivos por clase y evita colisiones.
  const path = `s/${sessionId}/${crypto.randomUUID()}-${safeName(filename)}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("session resource upload-url error", error);
    return NextResponse.json(
      { error: "No se pudo iniciar la subida" },
      { status: 500 },
    );
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
