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

  const upload = await mux.video.uploads.create({
    new_asset_settings: {
      playback_policy: [
        process.env.MUX_SIGNING_KEY_ID ? "signed" : "public",
      ],
      encoding_tier: "baseline",
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

  await supabase
    .from("lessons")
    .update({ mux_upload_id: upload.id })
    .eq("id", lessonId);

  return NextResponse.json({
    uploadUrl: upload.url,
    uploadId: upload.id,
  });
}
