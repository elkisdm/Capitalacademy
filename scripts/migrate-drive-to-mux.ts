/**
 * migrate-drive-to-mux.ts
 *
 * Migra videos de Google Drive a Mux usando ingesta por URL.
 *
 * Prerequisitos:
 *   1. MUX_TOKEN_ID y MUX_TOKEN_SECRET configurados en .env
 *   2. Cada video compartido como "Cualquier persona con el link" en Drive
 *
 * Uso:
 *   npx tsx scripts/migrate-drive-to-mux.ts
 *
 * El script:
 *   1. Convierte links de Drive a URLs de descarga directa
 *   2. Llama a Mux API para crear un asset desde cada URL
 *   3. Mux descarga el video directamente desde Google (no pasa por tu máquina)
 *   4. Imprime los asset IDs para que los asocies a las lecciones
 */

import Mux from "@mux/mux-node";
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
  } catch { /* .env not found, rely on process.env */ }
}
loadEnv();

// ============================================================================
// CONFIGURA TUS VIDEOS AQUÍ
// Pega el link de Drive de cada clase y el nombre para identificarla.
// El link puede ser cualquier formato de Drive:
//   - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
//   - https://drive.google.com/open?id=FILE_ID
// ============================================================================
const VIDEOS = [
  {
    name: "MasterClass Gonzalez",
    driveLink: "https://drive.google.com/file/d/1WdtQEs-F2hbHTfh2GxSIf_ejsNpO2ZoD/view?usp=sharing",
    sizeGb: "6.5 GB",
  },
  {
    name: "MasterClass Magner",
    driveLink: "https://drive.google.com/file/d/1BRIU2tUv01SOc5l9f46rUrKk_GDDXQkL/view?usp=drive_link",
    sizeGb: "8.1 GB",
  },
  {
    name: "MasterClass Matamala",
    driveLink: "https://drive.google.com/file/d/12ZfVi8rTY1p-N-8hlUwHTK-Zmx8eC4vi/view?usp=drive_link",
    sizeGb: "5.5 GB",
  },
  {
    name: "MasterClass Raul Cortez",
    driveLink: "https://drive.google.com/file/d/1bHl_ex6aKMDvpeN8-I3djQdYQooJDMll/view?usp=drive_link",
    sizeGb: "10.4 GB",
  },
  {
    name: "MasterClass Sandra",
    driveLink: "https://drive.google.com/file/d/1D0A_NCeXCgSCCWYgLWzrY2sdAmJbqLCe/view?usp=drive_link",
    sizeGb: "4.3 GB",
  },
];

// ============================================================================
// NO TOCAR A PARTIR DE AQUÍ
// ============================================================================

function extractDriveFileId(link: string): string {
  // https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  const match1 = link.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1) return match1[1];

  // https://drive.google.com/open?id=FILE_ID
  const match2 = link.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2) return match2[1];

  throw new Error(`No se pudo extraer el ID del link: ${link}`);
}

function driveDirectDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
}

async function main() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    console.error("❌ MUX_TOKEN_ID y MUX_TOKEN_SECRET son requeridos en .env");
    console.error("   Crea un token en https://dashboard.mux.com/settings/access-tokens");
    process.exit(1);
  }

  const mux = new Mux({ tokenId, tokenSecret });

  console.log("🚀 Iniciando migración Drive → Mux\n");
  console.log(`   ${VIDEOS.length} videos a migrar\n`);

  const results: Array<{ name: string; assetId: string; playbackId: string }> = [];

  for (const video of VIDEOS) {
    try {
      const fileId = extractDriveFileId(video.driveLink);
      const downloadUrl = driveDirectDownloadUrl(fileId);

      console.log(`📤 ${video.name}`);
      console.log(`   Drive ID: ${fileId}`);
      console.log(`   URL: ${downloadUrl}`);

      const asset = await mux.video.assets.create({
        inputs: [{ url: downloadUrl }],
        playback_policies: ["public"],
        encoding_tier: "baseline",
        passthrough: video.name,
      });

      const playbackId = asset.playback_ids?.[0]?.id ?? "sin-playback-id";

      console.log(`   ✅ Asset creado: ${asset.id}`);
      console.log(`   📺 Playback ID: ${playbackId}`);
      console.log(`   ⏳ Estado: ${asset.status} (Mux está descargando y procesando...)\n`);

      results.push({
        name: video.name,
        assetId: asset.id,
        playbackId,
      });
    } catch (err) {
      console.error(`   ❌ Error: ${err instanceof Error ? err.message : err}\n`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📋 RESUMEN — Copia estos IDs para actualizar las lecciones");
  console.log("=".repeat(60) + "\n");

  for (const r of results) {
    console.log(`${r.name}`);
    console.log(`  asset_id:    ${r.assetId}`);
    console.log(`  playback_id: ${r.playbackId}`);
    console.log();
  }

  console.log("⏳ Los videos se están procesando en Mux (2-10 min por video).");
  console.log("   Revisa el estado en https://dashboard.mux.com/video/assets");
  console.log("\n💡 Siguiente paso: asociar cada asset a su lección en la base de datos.");
  console.log("   Puedes hacerlo desde el panel admin (/admin/lessons) o con SQL:\n");
  console.log("   UPDATE lessons SET");
  console.log("     mux_asset_id = 'ASSET_ID',");
  console.log("     mux_playback_id = 'PLAYBACK_ID',");
  console.log("     video_duration_seconds = DURACION");
  console.log("   WHERE id = 'LESSON_UUID';");
}

main().catch(console.error);
