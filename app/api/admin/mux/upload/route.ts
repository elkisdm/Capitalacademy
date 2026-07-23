import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMuxClient } from "@/lib/mux/client";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

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

  let upload;
  try {
    upload = await mux.video.uploads.create({
      new_asset_settings: {
        playback_policy: [
          process.env.MUX_SIGNING_KEY_ID ? "signed" : "public",
        ],
        // `encoding_tier: "baseline"` quedó deprecado en @mux/mux-node v14.
        video_quality: "basic",
        // Rendition MP4 estática para el fallback progresivo del player cuando
        // HLS no está disponible. Sin esto los assets nacen con
        // static_renditions: "none" y la URL .mp4 devuelve 404.
        static_renditions: [{ resolution: "highest" }],
        input: [
          {
            generated_subtitles: [
              {
                language_code: "es",
                name: "Español CC",
              },
            ],
          },
        ],
      },
      cors_origin: req.headers.get("origin") ?? "*",
    });
  } catch (err) {
    console.error("Mux uploads.create failed", err);
    return NextResponse.json(
      { error: "No se pudo iniciar la subida a Mux. Intenta de nuevo." },
      { status: 502 },
    );
  }

  // Limpia cualquier error previo: esta es una subida nueva para la lección.
  const { data: linked, error: linkError } = await supabase
    .from("lessons")
    .update({ mux_upload_id: upload.id, mux_error: null })
    .eq("id", lessonId)
    .select("id");

  if (linkError || !linked?.length) {
    console.error("No se pudo guardar mux_upload_id", {
      lessonId,
      uploadId: upload.id,
      linkError,
    });
    return NextResponse.json(
      { error: "No se pudo enlazar la subida con la lección. Intenta de nuevo." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    uploadUrl: upload.url,
    uploadId: upload.id,
  });
}
