#!/usr/bin/env node
/**
 * Convierte todos los PNG de public/imagery a WebP con cwebp.
 * Reduce ~85% el peso manteniendo calidad imperceptible.
 *
 * Uso: node scripts/optimize-images.mjs
 *
 * Requiere: cwebp (brew install webp)
 */
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIRS = [resolve(ROOT, "public/imagery")];

let totalBefore = 0;
let totalAfter = 0;

for (const dir of DIRS) {
  const files = readdirSync(dir).filter((f) => extname(f).toLowerCase() === ".png");
  if (!files.length) {
    console.log(`(no PNGs en ${dir})`);
    continue;
  }
  console.log(`\n${dir}`);
  for (const f of files) {
    const src = resolve(dir, f);
    const dst = resolve(dir, `${basename(f, ".png")}.webp`);
    const sizeBefore = statSync(src).size;
    try {
      execSync(`cwebp -quiet -q 88 -m 6 "${src}" -o "${dst}"`);
      const sizeAfter = statSync(dst).size;
      totalBefore += sizeBefore;
      totalAfter += sizeAfter;
      const reduction = ((1 - sizeAfter / sizeBefore) * 100).toFixed(1);
      console.log(
        `  ✓ ${f.padEnd(28)} ${(sizeBefore / 1024).toFixed(0).padStart(5)} KB → ${(sizeAfter / 1024).toFixed(0).padStart(4)} KB  (-${reduction}%)`,
      );
      unlinkSync(src);
    } catch (err) {
      console.error(`  ✘ ${f}: ${err.message}`);
    }
  }
}

if (totalBefore > 0) {
  const total = ((1 - totalAfter / totalBefore) * 100).toFixed(1);
  console.log(
    `\nTotal: ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024 / 1024).toFixed(2)} MB (-${total}%)`,
  );
}
