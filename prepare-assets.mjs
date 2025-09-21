import fs from "fs";
import path from "path";
import fg from "fast-glob";
import sharp from "sharp";
import crypto from "crypto";

// ===== cấu hình =====
const ROOT = "HTML";
const ASSETS = path.join(ROOT, "assets");
const INBOX_ROOT = path.join(ASSETS, "_inbox");

// dùng: node scripts/prepare-assets.mjs cardio --max=1600 --quality=82 --start=1
const TOPIC = process.argv[2];
const MAX_W = +(process.argv.find(a=>a.startsWith("--max="))?.split("=")[1] || 1600);
const QUALITY = +(process.argv.find(a=>a.startsWith("--quality="))?.split("=")[1] || 82);
const START = +(process.argv.find(a=>a.startsWith("--start="))?.split("=")[1] || 1);

if (!TOPIC) {
  console.error("Usage: node scripts/prepare-assets.mjs <topic> [--max=1600] [--quality=82] [--start=1]");
  process.exit(1);
}

const SRC = path.join(INBOX_ROOT, TOPIC);
const OUT = path.join(ASSETS, TOPIC);

fs.mkdirSync(SRC, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const exts = ["jpg","jpeg","png","webp","jfif"];
const hash = buf => crypto.createHash("sha1").update(buf).digest("hex");

(async () => {
  const files = await fg(exts.map(e => `${SRC}/**/*.${e}`), { dot:false });
  if (!files.length) {
    console.log(`No input images in ${SRC}. Put your downloaded images there.`);
    return;
  }

  const existed = await fg(`${OUT}/${TOPIC}-*.{jpg,png,webp}`);
  let idx = Math.max(
    START,
    ...existed
      .map(p => path.basename(p).match(new RegExp(`^${TOPIC}-(\\d+)\\.`))?.[1])
      .filter(Boolean)
      .map(Number)
  );
  if (!Number.isFinite(idx) || idx < 1) idx = START;

  const seen = new Set();
  let saved = 0, skipped = 0;

  for (const f of files) {
    try {
      const input = await sharp(f).rotate();
      const meta = await input.metadata();
      if (!meta.width || !meta.height) { console.log(`× skip (no dimension): ${f}`); skipped++; continue; }
      if (meta.width < 400 || meta.height < 300) { console.log(`× skip (too small): ${f}`); skipped++; continue; }

      const jpgBuf = await input
        .resize({ width: MAX_W, withoutEnlargement: true })
        .toFormat("jpeg", { quality: QUALITY, mozjpeg: true })
        .toBuffer();

      const h = hash(jpgBuf);
      if (seen.has(h)) { console.log(`• dup content: ${f}`); skipped++; continue; }
      seen.add(h);

      const jpgName = `${TOPIC}-${idx}.jpg`;
      const webpName = `${TOPIC}-${idx}.webp`;
      fs.writeFileSync(path.join(OUT, jpgName), jpgBuf);
      const webpBuf = await sharp(jpgBuf).toFormat("webp", { quality: QUALITY }).toBuffer();
      fs.writeFileSync(path.join(OUT, webpName), webpBuf);

      console.log(`✓ ${path.basename(f)} -> ${TOPIC}-${idx}.{jpg,webp}`);
      idx++; saved++;
    } catch (e) {
      console.log(`! error: ${f} -> ${e.message}`); skipped++;
    }
  }

  console.log(`\nDone. Saved: ${saved}, Skipped: ${skipped}. Output: ${OUT}`);
})();
