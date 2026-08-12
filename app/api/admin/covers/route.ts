import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Target = "module" | "lesson" | "session";

const TARGET_TABLE = {
  module: "program_modules",
  lesson: "lessons",
  session: "class_sessions",
} as const;

function isTarget(value: unknown): value is Target {
  return value === "module" || value === "lesson" || value === "session";
}

function targetTable(target: Target) {
  return TARGET_TABLE[target];
}

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const target = formData.get("target");
  const id = formData.get("id") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
  }

  if (!isTarget(target)) {
    return NextResponse.json({ error: "target inválido" }, { status: 400 });
  }

  if (!id || !uuidLike.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Formato no permitido. Usa JPG, PNG o WebP." },
      { status: 422 },
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "La imagen no puede superar 2 MB." },
      { status: 422 },
    );
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from(targetTable(target))
    .select("id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  }

  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${target}/${id}/cover.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("covers")
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    console.error("Cover upload error:", uploadError);
    return NextResponse.json(
      { error: "Error al subir la imagen" },
      { status: 500 },
    );
  }

  // Limpia covers de otras extensiones (ej. jpg -> png) para no dejar huérfanos.
  const { data: staleFiles } = await supabase.storage.from("covers").list(`${target}/${id}`);
  const stalePaths = (staleFiles ?? [])
    .filter((f) => f.name !== `cover.${ext}`)
    .map((f) => `${target}/${id}/${f.name}`);
  if (stalePaths.length > 0) {
    await supabase.storage.from("covers").remove(stalePaths);
  }

  const { data: urlData } = supabase.storage.from("covers").getPublicUrl(path);
  const coverUrl = `${urlData.publicUrl}?v=${Date.now()}`;

  const { data: updated, error: updateError } = await supabase
    .from(targetTable(target))
    .update({ cover_image_url: coverUrl })
    .eq("id", id)
    .select("id");

  if (updateError || !updated || updated.length === 0) {
    console.error("cover_image_url update error:", updateError);
    return NextResponse.json(
      { error: "Imagen subida pero no se pudo actualizar el registro" },
      { status: 500 },
    );
  }

  return NextResponse.json({ cover_image_url: coverUrl });
}

export async function DELETE(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const target = searchParams.get("target");
  const id = searchParams.get("id");

  if (!isTarget(target)) {
    return NextResponse.json({ error: "target inválido" }, { status: 400 });
  }

  // El mismo `uuidLike` del POST: un id arbitrario acá se convierte en prefijo
  // de list/remove sobre el bucket, y en un 22P02 (500) en el update de abajo.
  if (!id || !uuidLike.safeParse(id).success) {
    return NextResponse.json({ error: "id es requerido" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: files } = await supabase.storage.from("covers").list(`${target}/${id}`);

  if (files && files.length > 0) {
    await supabase.storage
      .from("covers")
      .remove(files.map((f) => `${target}/${id}/${f.name}`));
  }

  const { data: updated, error: updateError } = await supabase
    .from(targetTable(target))
    .update({ cover_image_url: null })
    .eq("id", id)
    .select("id");

  if (updateError || !updated || updated.length === 0) {
    console.error("cover_image_url update error:", updateError);
    return NextResponse.json(
      { error: "Error al quitar la portada" },
      { status: 500 },
    );
  }

  return NextResponse.json({ cover_image_url: null });
}
