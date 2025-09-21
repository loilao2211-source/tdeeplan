// scripts/fix-duplicates-by-hash.mjs
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { load } from "cheerio";
import sharp from "sharp";
import dotenv from "dotenv";
dotenv.config();

// Polyfill fetch (Node < 18)
if (typeof fetch === "undefined") {
  const { default: fetchFn } = await import("node-fetch");
  global.fetch = fetchFn;
}

const PEXELS_KEY = process.env.PEXELS_API_KEY;
if (!PEXELS_KEY) {
  console.error("⚠️ Missing PEXELS_API_KEY in .env");
  process.exit(1);
}

// ---- CONFIG ----
const ROOT = "HTML";
const GYM = path.join(ROOT, "gym");
const ASSETS = path.join(ROOT, "assets");

// Bộ chọn ảnh rộng: lần lượt thử, cái nào có thì dùng
const IMG_SELECTORS = [
  "article img",
  "main img",
  ".post img",
  ".entry-content img",
  ".content img",
  ".container img",
  "img",
];

const TOPIC_MAP = [
  { test: /lợi ích.*cardio|cardio\b/i, q: "cardio running jogging cycling heart rate outdoor" },
  { test: /lợi ích.*weight|weight training|tập tạ|kháng lực|strength/i, q: "strength training dumbbell barbell squat bench press" },
  { test: /so sánh|vs|comparison/i, q: "cardio vs strength gym comparison people training" },
  { test: /kết hợp|tối ưu|combine/i, q: "cross training combine cardio and weights gym" },
  { test: /tổng kết|summary|kết luận/i, q: "fitness healthy lifestyle summary gym" },
];

function log(...args) { console.log(...args); }
function slugify(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function* walk(dir) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    const s = fs.statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (p.endsWith(".html")) yield p;
  }
}
function hashOfFile(p) {
  try {
    const buf = fs.readFileSync(p);
    return crypto.createHash("sha1").update(buf).digest("hex");
  } catch { return null; }
}
async function pexelsSearch(q, page = 1, perPage = 24) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}`;
  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
  return res.json();
}
async function downloadToWebp(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf).webp({ quality: 82 }).toFile(outPath);
  return crypto.createHash("sha1").update(fs.readFileSync(outPath)).digest("hex");
}
function nearestHeading($, $img) {
  const fig = $img.closest("figure");
  const cap = fig.find("figcaption").text().trim();
  if (cap) return cap;
  const h = $img.prevAll("h2,h3,h4").first().text().trim();
  if (h) return h;
  return ($img.attr("alt") || "").trim();
}
function topicQuery(context) {
  for (const m of TOPIC_MAP) if (m.test.test(context)) return m.q;
  return "fitness gym training workout";
}

fs.mkdirSync(ASSETS, { recursive: true });

log("▶ Start fix-duplicates-by-hash at", new Date().toISOString());
let pagesChanged = 0;

for (const file of walk(GYM)) {
  const html = fs.readFileSync(file, "utf8");
  const $ = load(html);

  // Chọn selector đầu tiên thực sự có ảnh
  let selector = IMG_SELECTORS.find(sel => $(sel).length > 0) || "img";
  const $imgs = $(selector);
  log(`• ${file} → found ${$imgs.length} images (selector: "${selector}")`);

  if ($imgs.length === 0) continue;

  // Thu hash từng ảnh, tìm nhóm trùng
  const firstOfHash = new Map(); // hash -> index
  const toReplace = [];
  $imgs.each((i, el) => {
    const $img = $(el);
    const src = $img.attr("src") || "";
    if (!src) return;
    const abs = path.resolve(path.dirname(file), src);
    const h = hashOfFile(abs);
    if (!h) return;
    if (!firstOfHash.has(h)) firstOfHash.set(h, i);
    else toReplace.push({ i, $img, src, hash: h });
  });

  if (!toReplace.length) {
    log(`  ⮡ No duplicate hashes → skip.`);
    continue;
  }

  log(`  ⮡ Duplicates: ${toReplace.length} image(s). Replacing…`);

  const tasks = toReplace.map(({ i, $img }) => (async () => {
    const ctx = nearestHeading($, $img);
    const q = topicQuery(ctx);

    let picked = false;
    for (let page = 1; page <= 6 && !picked; page++) {
      const data = await pexelsSearch(q, page, 24);
      for (const p of data.photos || []) {
        const url = p.src?.large2x || p.src?.large || p.src?.original;
        if (!url) continue;

        const outName = `${slugify(path.basename(file, ".html"))}-${i}-pexels-${p.id}.webp`;
        const outPath = path.join(ASSETS, outName);
        const newHash = await downloadToWebp(url, outPath);

        // khác hash với TẤT CẢ ảnh đã thấy trong trang?
        if (!firstOfHash.has(newHash)) {
          firstOfHash.set(newHash, i); // ghi nhận hash mới
          const rel = path.relative(path.dirname(file), outPath).replace(/\\/g, "/");
          $img.attr("src", rel);
          if (!($img.attr("alt") || "").trim()) $img.attr("alt", q);
          picked = true;
          log(`    ✔ img#${i} ← ${q} (pexels ${p.id})`);
          break;
        } else {
          try { fs.unlinkSync(outPath); } catch {}
        }
      }
    }
    if (!picked) log(`    ✖ img#${i} (no distinct image found for "${q}")`);
  })());

  await Promise.all(tasks);

  fs.writeFileSync(file, $.html(), "utf8");
  log(`  ⮡ Saved ${file}`);
  pagesChanged++;
}

log(`\nDone. Pages modified: ${pagesChanged}.`);
