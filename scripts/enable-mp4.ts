import Mux from "@mux/mux-node";
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
  const mux = new Mux({ tokenId: process.env.MUX_TOKEN_ID!, tokenSecret: process.env.MUX_TOKEN_SECRET! });

  console.log("🔍 Habilitando MP4 support en todos los assets...\n");

  const assets = await mux.video.assets.list();
  for await (const asset of assets) {
    if (asset.status !== "ready") {
      console.log(`⏭️  ${asset.passthrough ?? asset.id} — ${asset.status} (skip)`);
      continue;
    }

    try {
      await mux.video.assets.update(asset.id, { mp4_support: "standard" });
      console.log(`✅ ${asset.passthrough ?? asset.id} — MP4 habilitado`);
    } catch (err) {
      console.log(`❌ ${asset.passthrough ?? asset.id} — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("\n⏳ Mux está generando los MP4 estáticos (~2-5 min).");
  console.log("   Después podrás acceder al video como:");
  console.log("   https://stream.mux.com/{playbackId}/high.mp4");
  console.log("   https://stream.mux.com/{playbackId}/medium.mp4");
  console.log("   https://stream.mux.com/{playbackId}/low.mp4");
}

main().catch(console.error);
