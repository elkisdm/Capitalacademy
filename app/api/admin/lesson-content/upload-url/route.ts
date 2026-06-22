import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

// 5 MB. También lo aplica el bucket (file_size_limit) y se valida en el cliente.
const MAX_SIZE = 5 * 1024 * 1024;
const BUCKET = "lesson-content";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const schema = z.object({
  lessonId: uuidLike,
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim(),
  size: z.number().int().positive().max(MAX_SIZE, "La imagen no puede superar 5 MB"),
});

function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
  return cleaned || "imagen";
}

export async function POST(req: Request) {
  const staff = await requireStaff();
  if ("error" in staff) return staff.error;

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

  const { lessonId, filename, contentType } = parsed.data;
  if (!ALLOWED.has(contentType)) {
    return NextResponse.json(
      { error: "Solo se permiten imágenes (JPG, PNG, WebP, GIF)." },
      { status: 422 },
    );
  }

  const path = `${lessonId}/${crypto.randomUUID()}-${safeName(filename)}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("lesson-content upload-url error", error);
    return NextResponse.json({ error: "No se pudo iniciar la subida" }, { status: 500 });
  }

  // El bucket es público: la URL pública es estable y sirve para el <img> del Markdown.
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({ path: data.path, token: data.token, publicUrl: pub.publicUrl });
}
