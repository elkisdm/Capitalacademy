/**
 * Elimina assets con estado "errored" en Mux.
 * Uso: npx tsx scripts/cleanup-errored-mux-assets.ts
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
  } catch {}
}
loadEnv();

async function main() {
  const mux = new Mux({
    tokenId: process.env.MUX_TOKEN_ID!,
    tokenSecret: process.env.MUX_TOKEN_SECRET!,
  });

  console.log("🔍 Buscando assets con error...\n");

  const assets = await mux.video.assets.list();

  const errored = [];
  for await (const asset of assets) {
    if (asset.status === "errored") {
      errored.push(asset);
    }
  }

  if (errored.length === 0) {
    console.log("✅ No hay assets con error.");
    return;
  }

  console.log(`🗑️  Eliminando ${errored.length} assets con error:\n`);

  for (const asset of errored) {
    console.log(`   ${asset.id} (${asset.passthrough ?? "sin nombre"}) — ${asset.status}`);
    await mux.video.assets.delete(asset.id);
    console.log(`   ✅ Eliminado`);
  }

  console.log(`\n🧹 Limpieza completa.`);
}

main().catch(console.error);
