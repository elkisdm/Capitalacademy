/**
 * upload-local-to-mux.ts
 *
 * Sube videos locales a Mux usando direct upload.
 * Usa https.request nativo para soportar archivos grandes (>4GB).
 *
 * Uso: npx tsx scripts/upload-local-to-mux.ts
 */

import Mux from "@mux/mux-node";
import { readFileSync, statSync, createReadStream } from "fs";
import { resolve, basename } from "path";
import https from "https";
import http from "http";
import { URL } from "url";

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

const VIDEO_DIR = resolve(process.env.HOME ?? "~", "Downloads", "optimized");

const SPECIFIC_FILES = [
  "MasterClass Sandra.mp4",
  "MasterClass Gonzalez.mp4",
  "MasterClass Matamala.mp4",
  "MasterClass Magner.mp4",
  "MasterClass Raul Cortez.mp4",
];

function formatBytes(bytes: number) {
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function uploadViaPut(uploadUrl: string, filePath: string, fileSize: number): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const parsed = new URL(uploadUrl);
    const mod = parsed.protocol === "https:" ? https : http;

    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": fileSize,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolveP();
          } else {
            rejectP(new Error(`Upload failed (${res.statusCode}): ${body}`));
          }
        });
      },
    );

    req.on("error", rejectP);

    const stream = createReadStream(filePath);
    let uploaded = 0;
    let lastLog = 0;

    stream.on("data", (chunk: string | Buffer) => {
      uploaded += chunk.length;
      const pct = Math.round((uploaded / fileSize) * 100);
      if (pct >= lastLog + 5) {
        process.stdout.write(`\r   Progreso: ${pct}% (${formatBytes(uploaded)} / ${formatBytes(fileSize)})`);
        lastLog = pct;
      }
    });

    stream.on("end", () => {
      process.stdout.write("\n");
    });

    stream.pipe(req);
  });
}

async function uploadFile(mux: Mux, filePath: string) {
  const fileName = basename(filePath);
  const stat = statSync(filePath);
  const displayName = fileName.replace(/-\d{3}\.mp4$/, ".mp4");

  console.log(`\n📤 ${displayName} (${formatBytes(stat.size)})`);

  const upload = await mux.video.uploads.create({
    new_asset_settings: {
      playback_policies: ["public"],
      encoding_tier: "baseline",
      passthrough: displayName.replace(".mp4", ""),
    },
    cors_origin: "*",
  });

  console.log(`   Upload ID: ${upload.id}`);
  console.log(`   Subiendo a Mux...`);

  const startTime = Date.now();

  await uploadViaPut(upload.url!, filePath, stat.size);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const speedMbps = ((stat.size / 1048576) / (Number(elapsed) || 1)).toFixed(1);
  console.log(`   ✅ Upload completado en ${elapsed}s (${speedMbps} MB/s)`);

  let asset = await mux.video.uploads.retrieve(upload.id);
  let attempts = 0;
  while (!asset.asset_id && attempts < 15) {
    await new Promise((r) => setTimeout(r, 3000));
    asset = await mux.video.uploads.retrieve(upload.id);
    attempts++;
    process.stdout.write(`\r   Esperando asset... (${attempts * 3}s)`);
  }
  process.stdout.write("\n");

  if (asset.asset_id) {
    const fullAsset = await mux.video.assets.retrieve(asset.asset_id);
    const playbackId = fullAsset.playback_ids?.[0]?.id ?? "pendiente";
    console.log(`   🎬 Asset ID:    ${asset.asset_id}`);
    console.log(`   📺 Playback ID: ${playbackId}`);
    console.log(`   ⏳ Estado: ${fullAsset.status}`);
    return { fileName: displayName, assetId: asset.asset_id, playbackId };
  }

  console.log(`   ⏳ Upload procesando — aparecerá en el dashboard de Mux`);
  return { fileName: displayName, assetId: "pendiente", playbackId: "pendiente" };
}

async function main() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    console.error("❌ MUX_TOKEN_ID y MUX_TOKEN_SECRET son requeridos en .env");
    process.exit(1);
  }

  const mux = new Mux({ tokenId, tokenSecret });

  const files = SPECIFIC_FILES
    .map((f) => resolve(VIDEO_DIR, f))
    .filter((f) => {
      try { statSync(f); return true; } catch { return false; }
    });

  if (files.length === 0) {
    console.error("❌ No se encontraron videos en " + VIDEO_DIR);
    console.error("   Archivos buscados:");
    SPECIFIC_FILES.forEach((f) => console.error("     - " + f));
    process.exit(1);
  }

  console.log(`🚀 Subiendo ${files.length} video(s) a Mux\n`);
  files.forEach((f) => {
    const stat = statSync(f);
    console.log(`   ${basename(f)} — ${formatBytes(stat.size)}`);
  });

  const results: Array<{ fileName: string; assetId: string; playbackId: string }> = [];

  for (const file of files) {
    try {
      const result = await uploadFile(mux, file);
      results.push(result);
    } catch (err) {
      console.error(`   ❌ Error: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📋 RESUMEN");
  console.log("=".repeat(60) + "\n");

  for (const r of results) {
    console.log(`${r.fileName}`);
    console.log(`  asset_id:    ${r.assetId}`);
    console.log(`  playback_id: ${r.playbackId}\n`);
  }

  console.log("⏳ Los videos se están procesando en Mux.");
  console.log("   Revisa en https://dashboard.mux.com/video/assets\n");
}

main().catch(console.error);
