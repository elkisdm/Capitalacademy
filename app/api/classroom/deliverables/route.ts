import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/auth";
import { uuidLike } from "@/lib/utils/zod";
import { DELIVERABLES_BUCKET } from "@/lib/deliverables/storage";

export const runtime = "nodejs";

// `deliverables`/`deliverable_submissions` aún no están en el Database
// generado (migración 0053 no aplicada a prod). Provisional: `as never` +
// tipos locales, mismo patrón que las rutas API de entregables.
type DeliverableRow = { allow_multiple: boolean };
type SubmissionPathRow = { id: string; storage_path: string };

const createSchema = z.object({
  deliverableId: uuidLike,
  storagePath: z.string().trim().min(1, "storagePath es requerido"),
  filename: z.string().trim().min(1, "filename es requerido").max(255),
  fileSizeBytes: z.number().int().positive().optional(),
  contentType: z.string().trim().max(200).optional(),
});

// ---------------------------------------------------------------------------
// POST  /api/classroom/deliverables
//   Persiste la fila de una entrega apuntando al archivo ya subido a Storage.
// ---------------------------------------------------------------------------

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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const { deliverableId, storagePath, filename, fileSizeBytes, contentType } = parsed.data;

  // El path debe pertenecer a este entregable y a este alumno.
  if (!storagePath.startsWith(`${deliverableId}/${user.id}/`)) {
    return NextResponse.json({ error: "storagePath no corresponde a esta entrega" }, { status: 422 });
  }

  const admin = createAdminClient();

  const slash = storagePath.lastIndexOf("/");
  const dir = storagePath.slice(0, slash);
  const name = storagePath.slice(slash + 1);
  const { data: listed } = await admin.storage.from(DELIVERABLES_BUCKET).list(dir, { search: name });
  const obj = listed?.find((f) => f.name === name);
  if (!obj) {
    return NextResponse.json({ error: "El archivo no se encontró en Storage" }, { status: 422 });
  }

  const { data: deliverable } = await admin
    .from("deliverables" as never)
    .select("allow_multiple")
    .eq("id", deliverableId)
    .single<DeliverableRow>();
  if (!deliverable) {
    return NextResponse.json({ error: "Entregable no encontrado" }, { status: 404 });
  }

  // Si no admite múltiples archivos, se reemplazará la entrega previa, pero
  // solo tras un insert exitoso: así la RLS que gatea la ventana (opens_at/
  // due_at) en el insert también protege el borrado, en vez de ejecutarse
  // antes con service-role y destruir una entrega on-time por fuera de la
  // ventana.
  let previous: SubmissionPathRow[] | null = null;
  if (!deliverable.allow_multiple) {
    const { data } = await admin
      .from("deliverable_submissions" as never)
      .select("id, storage_path")
      .eq("deliverable_id", deliverableId)
      .eq("student_id", user.id)
      .overrideTypes<SubmissionPathRow[]>();
    previous = data;
  }

  // Insert con cliente de usuario: la RLS refuerza propiedad + ventana como
  // segunda barrera (la primera ya se validó en upload-url).
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("deliverable_submissions" as never)
    .insert({
      deliverable_id: deliverableId,
      student_id: user.id,
      storage_path: storagePath,
      filename,
      content_type: contentType ?? null,
      file_size_bytes:
        fileSizeBytes ?? (typeof obj.metadata?.size === "number" ? obj.metadata.size : null),
    } as never)
    .select()
    .single();

  if (error) {
    console.error("deliverable submission insert error", error);
    if (error.code === "42501") {
      return NextResponse.json({ error: "La ventana de entrega está cerrada" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al guardar la entrega" }, { status: 500 });
  }

  if (previous && previous.length > 0) {
    const previousIds = previous.map((p) => p.id);
    const previousPaths = previous.map((p) => p.storage_path);
    await admin.storage.from(DELIVERABLES_BUCKET).remove(previousPaths);
    await admin.from("deliverable_submissions" as never).delete().in("id", previousIds);
  }

  return NextResponse.json(created, { status: 201 });
}

// ---------------------------------------------------------------------------
// DELETE  /api/classroom/deliverables?id=xxx
//   Borra un archivo propio (RLS gatea propiedad + ventana).
// ---------------------------------------------------------------------------

export async function DELETE(req: Request) {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id es requerido" }, { status: 422 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliverable_submissions" as never)
    .delete()
    .eq("id", id)
    .select("id, storage_path")
    .overrideTypes<SubmissionPathRow[]>();

  if (error) {
    console.error("deliverable submission delete error", error);
    return NextResponse.json({ error: "Error al eliminar la entrega" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Entrega no encontrada" }, { status: 404 });
  }

  const storagePath = data[0]?.storage_path;
  if (storagePath) {
    const { error: removeError } = await createAdminClient()
      .storage.from(DELIVERABLES_BUCKET)
      .remove([storagePath]);
    if (removeError) {
      console.error("deliverable storage remove error", removeError);
    }
  }

  return NextResponse.json({ deleted: true });
}
