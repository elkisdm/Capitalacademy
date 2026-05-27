/**
 * link-mux-to-lessons.ts
 *
 * Asocia los assets de Mux a las lecciones en Supabase.
 * Lee los assets de Mux, los matchea por nombre (passthrough) con las lecciones,
 * y actualiza mux_asset_id, mux_playback_id, video_duration_seconds, thumbnail_url.
 *
 * Uso: npx tsx scripts/link-mux-to-lessons.ts
 */

import Mux from "@mux/mux-node";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  try {
    const scriptDir = new URL(".", import.meta.url).pathname;
    const envPath = resolve(scriptDir, "..", ".env");
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
}
loadEnv();

// Mapeo: nombre del asset en Mux (passthrough) → título de la lección en Supabase
// El script intenta matchear automáticamente, pero puedes definir un mapeo manual aquí
const MANUAL_MAP: Record<string, string> = {
  // "MasterClass Sandra": "d0000000-0000-0000-0000-000000000005",
};

async function main() {
  const mux = new Mux({
    tokenId: process.env.MUX_TOKEN_ID!,
    tokenSecret: process.env.MUX_TOKEN_SECRET!,
  });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  console.log("🔍 Leyendo assets de Mux...\n");

  const readyAssets: Array<{
    id: string;
    playbackId: string;
    duration: number;
    passthrough: string;
  }> = [];

  const assets = await mux.video.assets.list();
  for await (const asset of assets) {
    if (asset.status === "ready" && asset.passthrough) {
      const playbackId = asset.playback_ids?.[0]?.id;
      if (playbackId) {
        readyAssets.push({
          id: asset.id,
          playbackId,
          duration: Math.round(asset.duration ?? 0),
          passthrough: asset.passthrough,
        });
      }
    }
  }

  if (readyAssets.length === 0) {
    console.log("⏳ No hay assets listos (status=ready) en Mux.");
    console.log("   Espera a que terminen de procesar y corre el script de nuevo.");
    return;
  }

  console.log(`📦 ${readyAssets.length} assets listos en Mux:\n`);
  readyAssets.forEach((a) => {
    const min = Math.floor(a.duration / 60);
    const sec = a.duration % 60;
    console.log(`   ${a.passthrough} — ${min}:${String(sec).padStart(2, "0")} — ${a.id}`);
  });

  console.log("\n🔗 Buscando lecciones en Supabase...\n");

  const { data: lessons, error } = await supabase
    .from("lessons")
    .select("id, title, mux_asset_id")
    .order("position", { ascending: true });

  if (error || !lessons) {
    console.error("❌ Error al leer lecciones:", error);
    return;
  }

  let linked = 0;
  let skipped = 0;

  for (const asset of readyAssets) {
    // Check manual map first
    if (MANUAL_MAP[asset.passthrough]) {
      const lessonId = MANUAL_MAP[asset.passthrough];
      const lesson = lessons.find((l) => l.id === lessonId);
      if (lesson) {
        await linkAsset(supabase as any, lesson, asset);
        linked++;
        continue;
      }
    }

    // Auto-match: busca la lección cuyo título contiene el passthrough o viceversa
    const normalizedPassthrough = asset.passthrough.toLowerCase().replace(/[^a-záéíóúñ\s]/g, "").trim();
    const matchedLesson = lessons.find((l) => {
      const normalizedTitle = l.title.toLowerCase().replace(/[^a-záéíóúñ\s]/g, "").trim();
      return normalizedTitle.includes(normalizedPassthrough) ||
        normalizedPassthrough.includes(normalizedTitle);
    });

    if (matchedLesson) {
      if (matchedLesson.mux_asset_id === asset.id) {
        console.log(`   ⏭️  ${asset.passthrough} → ya vinculado a "${matchedLesson.title}"`);
        skipped++;
        continue;
      }
      await linkAsset(supabase as any, matchedLesson, asset);
      linked++;
    } else {
      console.log(`   ⚠️  ${asset.passthrough} → no se encontró lección matching`);
      console.log(`       Agrega un mapeo manual en MANUAL_MAP si el nombre no coincide.`);
    }
  }

  console.log(`\n✅ ${linked} assets vinculados, ${skipped} ya estaban vinculados.`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function linkAsset(
  supabase: any,
  lesson: { id: string; title: string },
  asset: { id: string; playbackId: string; duration: number; passthrough: string },
) {
  const thumbnailUrl = `https://image.mux.com/${asset.playbackId}/thumbnail.webp`;

  const { error } = await supabase
    .from("lessons")
    .update({
      mux_asset_id: asset.id,
      mux_playback_id: asset.playbackId,
      video_duration_seconds: asset.duration,
      thumbnail_url: thumbnailUrl,
    })
    .eq("id", lesson.id);

  if (error) {
    console.log(`   ❌ Error vinculando ${asset.passthrough}: ${error.message}`);
  } else {
    const min = Math.floor(asset.duration / 60);
    const sec = asset.duration % 60;
    console.log(`   ✅ ${asset.passthrough} → "${lesson.title}" (${min}:${String(sec).padStart(2, "0")})`);
  }
}

main().catch(console.error);
