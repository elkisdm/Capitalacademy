import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/auth";
import { uuidLike } from "@/lib/utils/zod";
import { DELIVERABLES_BUCKET, resolveDeliverableUrls } from "@/lib/deliverables/storage";
import { extensionAllowed } from "@/lib/deliverables/file-types";
import { sendDeliverableReceivedEmail } from "@/lib/email/deliverable-received";

export const runtime = "nodejs";

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
  const { data: listed, error: listError } = await admin.storage
    .from(DELIVERABLES_BUCKET)
    .list(dir, { search: name });
  if (listError) {
    console.error("[deliverables] error al listar Storage", listError);
    return NextResponse.json(
      { error: "No se pudo verificar el archivo, reintenta en unos segundos" },
      { status: 503 },
    );
  }
  const obj = listed?.find((f) => f.name === name);
  if (!obj) {
    return NextResponse.json({ error: "El archivo no se encontró en Storage" }, { status: 422 });
  }

  const { data: deliverable } = await admin
    .from("deliverables")
    .select("title, program_id, allow_multiple, max_file_size_bytes, allowed_file_types")
    .eq("id", deliverableId)
    .single();
  if (!deliverable) {
    return NextResponse.json({ error: "Entregable no encontrado" }, { status: 404 });
  }

  // El tamaño y tipo ya se validan en upload-url, pero un cliente puede
  // llamar este POST directo saltándose esa ruta: se revalida acá. Se
  // prefiere el tamaño REAL del objeto en Storage (uploadedSize) sobre el
  // declarado por el cliente (fileSizeBytes): este último es bypassable
  // (un POST directo puede declarar 1 byte para un archivo real de 500MB).
  const uploadedSize = typeof obj.metadata?.size === "number" ? obj.metadata.size : null;
  const effectiveSize = uploadedSize ?? fileSizeBytes;
  if (effectiveSize != null && effectiveSize > deliverable.max_file_size_bytes) {
    return NextResponse.json(
      { error: "El archivo supera el tamaño máximo permitido" },
      { status: 422 },
    );
  }
  // La extensión se valida tanto sobre el filename de display (client-supplied)
  // como sobre el nombre real del objeto subido a Storage (`name`), para que
  // un cliente no declare un filename con extensión permitida mientras el
  // archivo real subido tiene otra.
  if (
    !extensionAllowed(filename, deliverable.allowed_file_types) ||
    !extensionAllowed(name, deliverable.allowed_file_types)
  ) {
    return NextResponse.json(
      { error: "Tipo de archivo no permitido para este entregable" },
      { status: 422 },
    );
  }

  // Insert con cliente de usuario: la RLS refuerza propiedad + ventana como
  // segunda barrera (la primera ya se validó en upload-url).
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("deliverable_submissions")
    .insert({
      deliverable_id: deliverableId,
      student_id: user.id,
      storage_path: storagePath,
      filename,
      content_type: contentType ?? null,
      file_size_bytes: effectiveSize,
    })
    .select()
    .single();

  if (error) {
    console.error("deliverable submission insert error", error);
    if (error.code === "42501") {
      return NextResponse.json({ error: "La ventana de entrega está cerrada" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al guardar la entrega" }, { status: 500 });
  }

  // Si no admite múltiples archivos, se colapsa cualquier otra fila del par
  // (deliverable_id, student_id) tras el insert exitoso: así la RLS que
  // gatea la ventana (opens_at/due_at) en el insert también protege el
  // borrado, en vez de ejecutarse antes con service-role y destruir una
  // entrega on-time por fuera de la ventana. No hay unique constraint sobre
  // (deliverable_id, student_id), así que dos POST concurrentes del mismo
  // alumno pueden insertar ambos antes de que cualquiera borre: borrar
  // "todas menos la mía" en ambas corridas dejaría CERO filas (A borra B, B
  // borra A). Por eso se borra solo lo ESTRICTAMENTE más viejo que `created`
  // (uploaded_at, con desempate determinista por id), así siempre sobrevive
  // exactamente una fila — la más nueva — sin importar el orden de llegada.
  if (!deliverable.allow_multiple) {
    const { data: pairRows } = await admin
      .from("deliverable_submissions")
      .select("id, storage_path, uploaded_at")
      .eq("deliverable_id", deliverableId)
      .eq("student_id", user.id)
      .neq("id", created.id);
    const stale = (pairRows ?? []).filter(
      (p) =>
        p.uploaded_at < created.uploaded_at ||
        (p.uploaded_at === created.uploaded_at && p.id < created.id),
    );
    if (stale.length > 0) {
      const staleIds = stale.map((p) => p.id);
      const stalePaths = stale.map((p) => p.storage_path);
      await admin.storage.from(DELIVERABLES_BUCKET).remove(stalePaths);
      await admin.from("deliverable_submissions").delete().in("id", staleIds);
    }
  }

  // Correo de confirmación: no debe romper la respuesta de subida si Resend
  // falla (mismo criterio de tolerancia a fallos que el resto de los senders).
  try {
    const [{ data: profile, error: profileError }, { data: program }] = await Promise.all([
      admin.from("profiles").select("full_name, email").eq("id", user.id).single(),
      admin.from("programs").select("name").eq("id", deliverable.program_id).single(),
    ]);
    if (profile?.email) {
      const result = await sendDeliverableReceivedEmail({
        to: profile.email,
        studentName: profile.full_name ?? "",
        deliverableTitle: deliverable.title,
        programName: program?.name,
        fileName: filename,
        submittedAt: created.uploaded_at,
      });
      if (!result.success) {
        console.error("deliverable received email error", result.error);
      }
    } else {
      console.error("deliverable received email skipped: sin email de perfil", user.id, profileError);
    }
  } catch (err) {
    console.error("deliverable received email exception", err);
  }

  const [withUrl] = await resolveDeliverableUrls([created]);
  return NextResponse.json(withUrl, { status: 201 });
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
  if (!id || !uuidLike.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 422 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliverable_submissions")
    .delete()
    .eq("id", id)
    .select("id, storage_path");

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
