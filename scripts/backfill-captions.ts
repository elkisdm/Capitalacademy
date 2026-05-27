import Mux from "@mux/mux-node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const scriptDir = new URL(".", import.meta.url).pathname;
const envPath = resolve(scriptDir, "..", ".env");
try {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

async function main() {
  const tokenId = process.env.MUX_TOKEN_ID!;
  const tokenSecret = process.env.MUX_TOKEN_SECRET!;
  const mux = new Mux({ tokenId, tokenSecret });
  const authHeader =
    "Basic " + Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: lessons, error } = await supabase
    .from("lessons")
    .select("id, title, mux_asset_id, mux_playback_id, mux_track_id")
    .not("mux_asset_id", "is", null)
    .is("mux_track_id", null);

  if (error) {
    console.error("Error fetching lessons:", error.message);
    process.exit(1);
  }

  if (!lessons || lessons.length === 0) {
    console.log("No hay lecciones sin subtítulos para procesar.");
    return;
  }

  console.log(`Encontradas ${lessons.length} lecciones sin subtítulos.\n`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const lesson of lessons) {
    const assetId = lesson.mux_asset_id as string;
    const playbackId = lesson.mux_playback_id as string;
    console.log(`[${lesson.title}] asset=${assetId}`);

    try {
      const asset = await mux.video.assets.retrieve(assetId);

      const existingSubtitle = asset.tracks?.find(
        (t) => t.type === "text" && t.text_type === "subtitles",
      );

      if (existingSubtitle) {
        console.log(
          `  → Ya tiene subtítulos (track=${existingSubtitle.id}), actualizando DB...`,
        );
        await supabase
          .from("lessons")
          .update({ mux_track_id: existingSubtitle.id })
          .eq("id", lesson.id);

        if (playbackId && existingSubtitle.id) {
          await fetchAndStoreTranscript(
            supabase,
            lesson.id,
            playbackId,
            existingSubtitle.id,
          );
        }
        skipped++;
        continue;
      }

      const audioTrack = asset.tracks?.find((t) => t.type === "audio");
      if (!audioTrack) {
        console.log("  ✗ No tiene audio track, saltando...");
        failed++;
        continue;
      }

      console.log(
        `  → Audio track: ${audioTrack.id}. Solicitando generación de subtítulos...`,
      );

      const res = await fetch(
        `https://api.mux.com/video/v1/assets/${assetId}/tracks/${audioTrack.id}/generate-subtitles`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            generated_subtitles: [
              { language_code: "es", name: "Español CC" },
            ],
          }),
        },
      );

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`${res.status} ${errorBody}`);
      }

      const data = await res.json();
      const newTrack = data.data?.find?.(
        (t: { type: string; text_type: string }) =>
          t.type === "text" && t.text_type === "subtitles",
      );

      if (newTrack) {
        console.log(
          `  → Track creado: ${newTrack.id} (status: ${newTrack.status})`,
        );
        await supabase
          .from("lessons")
          .update({ mux_track_id: newTrack.id })
          .eq("id", lesson.id);
      } else {
        console.log(
          "  → Solicitud enviada. El webhook guardará el track cuando esté listo.",
        );
      }

      success++;
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ Error: ${msg}`);
      failed++;
    }
  }

  console.log(`\n--- Resultado ---`);
  console.log(`Subtítulos solicitados: ${success}`);
  console.log(`Ya existentes (actualizados): ${skipped}`);
  console.log(`Errores: ${failed}`);
  console.log(
    `\nLos subtítulos tardan ~0.1x la duración del video en generarse.`,
  );
  console.log(
    `El webhook video.asset.track.ready guardará el transcript automáticamente.`,
  );
}

async function fetchAndStoreTranscript(
  supabase: SupabaseClient,
  lessonId: string,
  playbackId: string,
  trackId: string,
) {
  try {
    const [txtRes, vttRes] = await Promise.all([
      fetch(`https://stream.mux.com/${playbackId}/text/${trackId}.txt`),
      fetch(`https://stream.mux.com/${playbackId}/text/${trackId}.vtt`),
    ]);

    if (!txtRes.ok || !vttRes.ok) {
      console.log(
        "  → Transcript no disponible aún (esperando procesamiento)",
      );
      return;
    }

    const [contentText, contentVtt] = await Promise.all([
      txtRes.text(),
      vttRes.text(),
    ]);

    await supabase.from("lesson_transcripts").upsert(
      {
        lesson_id: lessonId,
        content_text: contentText,
        content_vtt: contentVtt,
        language: "es",
        status: "ready",
        generated_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id,language" },
    );

    console.log(
      `  → Transcript guardado (${contentText.length} chars texto, ${contentVtt.length} chars VTT)`,
    );
  } catch (err) {
    console.log(
      `  → No se pudo obtener transcript: ${err instanceof Error ? err.message : err}`,
    );
  }
}

main().catch(console.error);
