/**
 * Generates all app icon assets from a single source: new-flame-icon.png
 *
 * Run: node apps/mobile/scripts/generate-assets.mjs
 *
 * Mobile outputs (apps/mobile/assets/):
 *   icon.png           — 1024x1024 (App Store / notification icon)
 *   adaptive-icon.png  — 1024x1024 (Android adaptive foreground, centered on transparent)
 *   favicon.png        — 48x48 (Expo web)
 *
 * Web outputs (apps/web/):
 *   app/favicon.ico              — multi-size ICO (16, 32, 48)
 *   app/icon1.png                — 96x96  (Next.js icon)
 *   app/apple-icon.png           — 180x180 (Apple touch icon)
 *   public/web-app-manifest-192x192.png  — PWA manifest
 *   public/web-app-manifest-512x512.png  — PWA manifest
 *
 * NOT touched: splash-logo.png, splash.png (white logo on dark bg — different asset)
 */
import sharp from "sharp";
import { writeFileSync, existsSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mobileAssets = join(__dirname, "../assets");
const webApp = join(__dirname, "../../../apps/web/app");
const webPublic = join(__dirname, "../../../apps/web/public");
const SOURCE = join(mobileAssets, "new-flame-icon.png");

function assertFile(path) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    console.error(`Error: source file not found: ${path}`);
    process.exit(1);
  }
}

function assertDir(path) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    console.error(`Error: output directory not found: ${path}`);
    process.exit(1);
  }
}

/**
 * Builds a valid ICO file from an array of { buffer, size } entries.
 * Each entry must supply the pixel dimension for its buffer so the ICO
 * directory metadata is always accurate, regardless of ordering or count.
 */
function buildIco(entries) {
  if (entries.length === 0) throw new Error("buildIco: at least one entry required");

  const count = entries.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let dataOffset = headerSize + dirEntrySize * count;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const offsets = [];
  for (const { buffer } of entries) {
    offsets.push(dataOffset);
    dataOffset += buffer.length;
  }

  const dirEntries = entries.map(({ buffer, size }, i) => {
    const dim = size < 256 ? size : 0;
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(dim, 0);
    entry.writeUInt8(dim, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offsets[i], 12);
    return entry;
  });

  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.buffer)]);
}

async function run() {
  assertFile(SOURCE);
  assertDir(mobileAssets);
  assertDir(webApp);
  assertDir(webPublic);

  console.log(`Source: ${SOURCE}\n`);

  // ── Mobile Assets ──

  await sharp(SOURCE)
    .resize(1024, 1024, { fit: "cover" })
    .png()
    .toFile(join(mobileAssets, "icon.png"));
  console.log("✓ mobile  icon.png (1024x1024)");

  const fgBuffer = await sharp(SOURCE)
    .resize(680, 680, { fit: "cover" })
    .png()
    .toBuffer();
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: fgBuffer, gravity: "center" }])
    .png()
    .toFile(join(mobileAssets, "adaptive-icon.png"));
  console.log("✓ mobile  adaptive-icon.png (1024x1024 transparent, icon centered)");

  await sharp(SOURCE)
    .resize(48, 48, { fit: "cover" })
    .png()
    .toFile(join(mobileAssets, "favicon.png"));
  console.log("✓ mobile  favicon.png (48x48)");

  // ── Web Assets ──

  await sharp(SOURCE)
    .resize(96, 96, { fit: "cover" })
    .png()
    .toFile(join(webApp, "icon1.png"));
  console.log("✓ web     icon1.png (96x96)");

  await sharp(SOURCE)
    .resize(180, 180, { fit: "cover" })
    .png()
    .toFile(join(webApp, "apple-icon.png"));
  console.log("✓ web     apple-icon.png (180x180)");

  await sharp(SOURCE)
    .resize(192, 192, { fit: "cover" })
    .png()
    .toFile(join(webPublic, "web-app-manifest-192x192.png"));
  console.log("✓ web     web-app-manifest-192x192.png");

  await sharp(SOURCE)
    .resize(512, 512, { fit: "cover" })
    .png()
    .toFile(join(webPublic, "web-app-manifest-512x512.png"));
  console.log("✓ web     web-app-manifest-512x512.png");

  const icoBuffer = buildIco([
    { buffer: await sharp(SOURCE).resize(16, 16, { fit: "cover" }).png().toBuffer(), size: 16 },
    { buffer: await sharp(SOURCE).resize(32, 32, { fit: "cover" }).png().toBuffer(), size: 32 },
    { buffer: await sharp(SOURCE).resize(48, 48, { fit: "cover" }).png().toBuffer(), size: 48 },
  ]);
  writeFileSync(join(webApp, "favicon.ico"), icoBuffer);
  console.log("✓ web     favicon.ico (16, 32, 48)");

  console.log("\nAll assets generated from new-flame-icon.png");
  console.log("Skipped: splash-logo.png, splash.png (white logo — different source)");
}

run().catch((err) => {
  console.error("Error generating assets:", err);
  process.exit(1);
});
