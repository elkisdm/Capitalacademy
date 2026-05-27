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
  const asset = await mux.video.assets.retrieve("rWjL9yiGpwBPBAuzo3N2SsK73uMaW1FEVW1AWL5v7CI");
  console.log(JSON.stringify({
    status: asset.status,
    playback_ids: asset.playback_ids,
    passthrough: asset.passthrough,
    resolution_tier: asset.resolution_tier,
    encoding_tier: asset.encoding_tier,
  }, null, 2));
}
main().catch(console.error);
