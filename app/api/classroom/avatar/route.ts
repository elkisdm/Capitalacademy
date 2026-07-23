import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
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

  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    console.error("Avatar upload error:", uploadError);
    return NextResponse.json(
      { error: "Error al subir la imagen" },
      { status: 500 },
    );
  }

  const { data: urlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(path);

  const avatarUrl = `${urlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);

  if (updateError) {
    console.error("Profile avatar_url update error:", updateError);
    const { error: rollbackError } = await supabase.storage
      .from("avatars")
      .remove([path]);
    if (rollbackError) {
      console.error("Avatar storage rollback error:", rollbackError);
    }
    return NextResponse.json(
      { error: "Imagen subida pero no se pudo actualizar el perfil" },
      { status: 500 },
    );
  }

  return NextResponse.json({ avatar_url: avatarUrl });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: files } = await supabase.storage
    .from("avatars")
    .list(user.id);

  if (files && files.length > 0) {
    const { error: removeError } = await supabase.storage
      .from("avatars")
      .remove(files.map((f) => `${user.id}/${f.name}`));

    if (removeError) {
      console.error("Avatar remove error:", removeError);
      return NextResponse.json(
        { error: "No se pudo eliminar la imagen" },
        { status: 500 },
      );
    }
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id);

  if (updateError) {
    console.error("Profile avatar_url clear error:", updateError);
    return NextResponse.json(
      { error: "No se pudo actualizar el perfil" },
      { status: 500 },
    );
  }

  return NextResponse.json({ avatar_url: null });
}
