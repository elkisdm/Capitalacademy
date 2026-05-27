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
  const assets = await mux.video.assets.list();
  let count = 0;
  for await (const a of assets) {
    const dur = a.duration ? `${Math.floor(a.duration / 60)}:${String(Math.floor(a.duration % 60)).padStart(2, "0")}` : "—";
    console.log(`${a.status.padEnd(10)} | ${dur.padEnd(8)} | ${(a.passthrough ?? a.id).slice(0, 40)}`);
    count++;
  }
  if (count === 0) console.log("No hay assets en Mux.");
  else console.log(`\nTotal: ${count} assets`);
}
main().catch(console.error);
