import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMuxClient } from "@/lib/mux/client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ops", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { lessonId } = body as { lessonId?: string };
  if (!lessonId) {
    return NextResponse.json(
      { error: "lessonId es requerido" },
      { status: 422 },
    );
  }

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, title")
    .eq("id", lessonId)
    .single();

  if (!lesson) {
    return NextResponse.json(
      { error: "Lección no encontrada" },
      { status: 404 },
    );
  }

  const mux = getMuxClient();

  const upload = await mux.video.uploads.create({
    new_asset_settings: {
      playback_policy: [
        process.env.MUX_SIGNING_KEY_ID ? "signed" : "public",
      ],
      encoding_tier: "baseline",
    },
    cors_origin: req.headers.get("origin") ?? "*",
  });

  await supabase
    .from("lessons")
    .update({ mux_upload_id: upload.id })
    .eq("id", lessonId);

  return NextResponse.json({
    uploadUrl: upload.url,
    uploadId: upload.id,
  });
}
