import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSessionStaff } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

const RESOURCE_BUCKET = "lesson-resources";
const MAX_SIZE = 50 * 1024 * 1024;

const typeSchema = z.enum(["pdf", "link", "template", "document", "other"]);

const httpUrlSchema = z
  .string()
  .trim()
  .url("url debe ser una URL válida")
  // Solo http(s): evita esquemas peligrosos (javascript:, data:) que el
  // alumno abriría como enlace (XSS almacenado).
  .refine(
    (value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "url debe usar protocolo http o https" },
  );

// Link externo (url) O archivo subido (storagePath); `source` discrimina.
const createResourceSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("link"),
    sessionId: z.string().trim().min(1, "sessionId es requerido"),
    title: z.string().trim().min(1, "title es requerido"),
    type: typeSchema,
    url: httpUrlSchema,
  }),
  z.object({
    source: z.literal("file"),
    sessionId: z.string().trim().min(1, "sessionId es requerido"),
    title: z.string().trim().min(1, "title es requerido"),
    type: typeSchema,
    storagePath: z.string().trim().min(1, "storagePath es requerido"),
    fileSizeBytes: z.number().int().positive().max(MAX_SIZE).optional(),
  }),
]);

export async function POST(req: Request) {
  const supabase = await createClient();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = createResourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const input = parsed.data;
  const { sessionId, title, type } = input;

  const staff = await requireSessionStaff(sessionId);
  if ("error" in staff) return staff.error;
  const user = staff.user;

  // Para archivos subidos: el path debe pertenecer a esta sesión y el objeto
  // debe existir en Storage (evita filas huérfanas o referenciar otro archivo).
  let storagePath: string | null = null;
  let fileSizeBytes: number | null = null;
  if (input.source === "file") {
    if (!input.storagePath.startsWith(`s/${sessionId}/`)) {
      return NextResponse.json(
        { error: "storagePath no corresponde a la sesión" },
        { status: 422 },
      );
    }
    const admin = createAdminClient();
    const slash = input.storagePath.lastIndexOf("/");
    const dir = input.storagePath.slice(0, slash);
    const name = input.storagePath.slice(slash + 1);
    const { data: listed } = await admin.storage
      .from(RESOURCE_BUCKET)
      .list(dir, { search: name });
    const obj = listed?.find((f) => f.name === name);
    if (!obj) {
      return NextResponse.json(
        { error: "El archivo no se encontró en Storage" },
        { status: 422 },
      );
    }
    storagePath = input.storagePath;
    fileSizeBytes =
      input.fileSizeBytes ??
      (typeof obj.metadata?.size === "number" ? obj.metadata.size : null);
  }

  const { data: maxPos } = await supabase
    .from("session_resources")
    .select("position")
    .eq("session_id", sessionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxPos?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("session_resources")
    .insert({
      session_id: sessionId,
      title,
      type,
      url: input.source === "link" ? input.url : null,
      storage_path: storagePath,
      file_size_bytes: fileSizeBytes,
      position: nextPosition,
      created_by: user.id,
    })
    .select("id, session_id, title, type, url, storage_path, file_size_bytes, position")
    .single();

  if (error) {
    console.error("session resource insert error", error);
    // 42501 = insufficient_privilege: rechazo de RLS. No lo enmascaramos como
    // 500 para no ocultar un problema de autorización.
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "No autorizado para crear recurso" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Error al crear recurso" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id es requerido" }, { status: 422 });
  }

  // Resuelve la sesión del recurso por service-role: el DELETE solo recibe
  // `id`, así que el gate por-sesión necesita el session_id antes de autorizar.
  const { data: resource } = await createAdminClient()
    .from("session_resources")
    .select("session_id")
    .eq("id", id)
    .maybeSingle();
  if (!resource) {
    return NextResponse.json({ error: "Recurso no encontrado" }, { status: 404 });
  }

  const staff = await requireSessionStaff(resource.session_id);
  if ("error" in staff) return staff.error;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("session_resources")
    .delete()
    .eq("id", id)
    .select("id, storage_path");

  if (error) {
    console.error("session resource delete error", error);
    return NextResponse.json({ error: "Error al eliminar recurso" }, { status: 500 });
  }

  // Si no se borró nada (id inexistente u oculto por RLS), el array viene vacío.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Recurso no encontrado" }, { status: 404 });
  }

  // Si era un archivo subido, elimina el objeto de Storage (no dejar huérfanos).
  const storagePath = data[0]?.storage_path;
  if (storagePath) {
    const { error: removeError } = await createAdminClient()
      .storage.from(RESOURCE_BUCKET)
      .remove([storagePath]);
    if (removeError) {
      console.error("session resource storage remove error", removeError);
    }
  }

  return NextResponse.json({ deleted: true });
}
