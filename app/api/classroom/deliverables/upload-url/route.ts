import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/auth";
import { uuidLike } from "@/lib/utils/zod";
import { extensionAllowed } from "@/lib/deliverables/file-types";

export const runtime = "nodejs";

const BUCKET = "deliverables";

const schema = z.object({
  deliverableId: uuidLike,
  filename: z.string().trim().min(1, "filename es requerido").max(255),
  size: z.number().int().positive("size debe ser positivo"),
});

// Sanitiza el nombre para el path de storage (igual que resources/upload-url).
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
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

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
  const { deliverableId, filename, size } = parsed.data;
  const admin = createAdminClient();

  const { data: deliverable } = await admin
    .from("deliverables")
    .select("opens_at, due_at, program_id, allowed_file_types, max_file_size_bytes")
    .eq("id", deliverableId)
    .single();
  if (!deliverable) {
    return NextResponse.json({ error: "Entregable no encontrado" }, { status: 404 });
  }

  const now = new Date();
  if (now < new Date(deliverable.opens_at) || now > new Date(deliverable.due_at)) {
    return NextResponse.json(
      { error: "La ventana de entrega no está abierta" },
      { status: 403 },
    );
  }

  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id, cohorts!inner(program_id)")
    .eq("student_id", user.id)
    .eq("cohorts.program_id", deliverable.program_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!enrollment) {
    return NextResponse.json({ error: "No tienes matrícula activa en este programa" }, { status: 403 });
  }

  if (!extensionAllowed(filename, deliverable.allowed_file_types)) {
    return NextResponse.json(
      { error: "Tipo de archivo no permitido para este entregable" },
      { status: 422 },
    );
  }

  if (size > deliverable.max_file_size_bytes) {
    return NextResponse.json(
      { error: "El archivo supera el tamaño máximo permitido" },
      { status: 422 },
    );
  }

  // Path student-scoped: nunca confía en un student_id del cliente.
  const path = `${deliverableId}/${user.id}/${crypto.randomUUID()}-${safeName(filename)}`;

  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("deliverable upload-url error", error);
    return NextResponse.json({ error: "No se pudo iniciar la subida" }, { status: 500 });
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
