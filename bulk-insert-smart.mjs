import fs from "fs";
import path from "path";
import { load } from "cheerio";

/* ===== FLAGS ===== */
const FORCE  = process.argv.includes("--force");
const USE_ABS = process.argv.includes("--abs");

/* ===== PATHS ===== */
const ROOT   = "HTML";
const GYM    = path.join(ROOT, "gym");
const ASSETS = path.join(ROOT, "assets");

/* ===== CONFIG ===== */
// 1 ảnh được phép xuất hiện tối đa N lần trên TOÀN SITE
const MAX_GLOBAL_REUSE = 4;

// Loại các ảnh phong cảnh không hợp nội dung tập gym
const SCENERY = /(bridge|lake|river|mountain|scenery|landscape|forest|sea|beach|nature)/i;

/* ===== HELPERS ===== */
// Bỏ dấu TV + lowercase để match từ khoá chắc hơn
const VI_DIACRITICS =
  { á:"a",à:"a",ả:"a",ã:"a",ạ:"a",ă:"a",ắ:"a",ằ:"a",ẳ:"a",ẵ:"a",ặ:"a",â:"a",ấ:"a",ầ:"a",ẩ:"a",ẫ:"a",ậ:"a",
    é:"e",è:"e",ẻ:"e",ẽ:"e",ẹ:"e",ê:"e",ế:"e",ề:"e",ể:"e",ễ:"e",ệ:"e",
    í:"i",ì:"i",ỉ:"i",ĩ:"i",ị:"i",
    ó:"o",ò:"o",ỏ:"o",õ:"o",ọ:"o",ô:"o",ố:"o",ồ:"o",ổ:"o",ỗ:"o",ộ:"o",ơ:"o",ớ:"o",ờ:"o",ở:"o",ỡ:"o",ợ:"o",
    ú:"u",ù:"u",ủ:"u",ũ:"u",ụ:"u",ư:"u",ứ:"u",ừ:"u",ử:"u",ữ:"u",ự:"u",
    ý:"y",ỳ:"y",ỷ:"y",ỹ:"y",ỵ:"y",
    đ:"d",
  };
function normalize(s="") {
  return s.toLowerCase().replace(/[áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ]/g,
    ch => VI_DIACRITICS[ch] || ch
  );
}

/* ===== TOPIC MAP ===== */
const TOPICS = [
  { dir: "cardio", kws: [
    /cardio|tim mach|chay( bo)?|dap xe|nhay day|hiit|tabata|treadmill|elliptical|run|jog/
  ]},
  { dir: "strength", kws: [
    /weight|ta\b|khang luc|suc manh|barbell|dumbbell|compound|squat|deadlift|bench|overload|powerlifting/
  ]},
  { dir: "flexibility", kws: [
    /gian co|flexibility|stretch|mobility|yoga|pilates|deo dai/
  ]},
  { dir: "recovery", kws: [
    /nghi\b|ngu\b|phuc hoi|recovery|doms|foam|massage|rest day|chan thuong/
  ]},
  { dir: "nutrition", kws: [
    /dinh duong|calo|calorie|macro|protein|whey|an\b|bua\b|thuc don|meal|diet|carb|fat|pre-?workout|post-?workout|truoc buoi|sau buoi/
  ]},
  { dir: "schedule", kws: [
    /lich|ke hoach|plan|checklist|bang|table|mau|template|split|routine/
  ]},
  { dir: "equipment", kws: [
    /thiet bi|may tap|may da nang|equipment|machine|rack|cable/
  ]},
  { dir: "generic", kws: [
    /the duc|the hinh|fitness|gym|suc khoe|workout|training/
  ]},
];

/* ===== OVERRIDES BY FILENAME ===== */
const FILE_OVERRIDES = [
  { re: /whey|protein|supplement|dinh-?duong|calo|calorie|macro|thuc-?don|an-truoc|an-sau|pre-?workout|post-?workout/, topicDir: "nutrition" },
  { re: /lich|schedule|plan|checklist|table|mau-?lich|routine|split/,                                               topicDir: "schedule" },
  { re: /stretch|gian|mobility|yoga|flex/,                                                                          topicDir: "flexibility" },
  { re: /equipment|may|thiet-?bi|machine|rack|cable/,                                                                topicDir: "equipment" },
];

/* ===== UTILS ===== */
function* walkHtmlFiles(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) yield* walkHtmlFiles(p);
    else if (p.endsWith(".html")) yield p;
  }
}

function listImagesIn(dir) {
  const absDir = path.resolve(ASSETS, dir);
  if (!fs.existsSync(absDir)) return [];
  return fs.readdirSync(absDir)
    .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
    .filter(f => !SCENERY.test(f))            // loại tên ảnh kiểu phong cảnh
    .map(f => path.join(dir, f));             // trả về đường dẫn dưới assets
}

function buildPool() {
  const map = new Map();
  for (const { dir } of TOPICS) map.set(dir, listImagesIn(dir));
  return map;
}

function nearestContext($, $img) {
  const cap = $img.closest("figure").find("figcaption").text().trim();
  if (cap) return cap;
  const h = $img.prevAll("h2,h3,h4,h5").first().text().trim();
  if (h) return h;
  const alt = ($img.attr("alt") || "").trim();
  return alt;
}

function detectTopic(context, fileBaseNoExt) {
  // ép theo tên file trước
  for (const ov of FILE_OVERRIDES) if (ov.re.test(normalize(fileBaseNoExt))) return ov.topicDir;
  // sau đó theo context
  const ctx = normalize(context);
  for (const t of TOPICS) if (t.kws.some(re => re.test(ctx))) return t.dir;
  return "generic";
}

// Resolve src hiện tại về đường dẫn hệ thống để kiểm tra tồn tại
function resolveCurrentOnDisk(htmlFilePath, currentSrc) {
  if (!currentSrc) return null;
  // Dùng /HTML/assets/... → ánh xạ sang thư mục thực
  if (currentSrc.startsWith("/HTML/assets/")) {
    const rel = currentSrc.replace("/HTML/assets/", "");
    return path.resolve(ASSETS, rel);
  }
  // Đường dẫn tương đối so với file HTML
  return path.resolve(path.dirname(htmlFilePath), currentSrc);
}

function toSrc(relUnderAssets, htmlFileDir) {
  const absTarget = path.join(ASSETS, relUnderAssets);
  if (USE_ABS) return "/HTML/assets/" + relUnderAssets.replace(/\\/g, "/");
  return path.relative(htmlFileDir, absTarget).replace(/\\/g, "/");
}

/* ===== REUSE CONTROL ===== */
// rel (under assets) -> count used site-wide
const reuseCount = new Map();
function canUse(rel)           { return (reuseCount.get(rel) || 0) < MAX_GLOBAL_REUSE; }
function markUsed(rel)         { reuseCount.set(rel, (reuseCount.get(rel) || 0) + 1); }
function pickFromArray(arr, usedInPage) {
  let pick = arr.find(rel => canUse(rel) && !usedInPage.has(rel));
  if (pick) return pick;
  // thiếu thì cho tái dùng (nhưng vẫn không trùng ngay trong trang)
  pick = arr.find(rel => !usedInPage.has(rel));
  return pick || null;
}
function pickNext(pool, topic, usedInPage) {
  let arr = pool.get(topic) || [];
  let pick = pickFromArray(arr, usedInPage);
  if (pick) return pick;

  arr = pool.get("generic") || [];
  pick = pickFromArray(arr, usedInPage);
  if (pick) return pick;

  for (const [dir, a] of pool.entries()) {
    if (dir === topic || dir === "generic") continue;
    pick = pickFromArray(a, usedInPage);
    if (pick) return pick;
  }
  return null;
}

/* ===== MAIN ===== */
const pool = buildPool();
console.log("POOL STATS:");
for (const [dir, arr] of pool.entries()) {
  const abs = path.resolve(ASSETS, dir);
  console.log(`  ${dir.padEnd(10)} -> ${String(arr.length).padStart(3)} files @ ${abs}`);
}

let pagesChanged = 0;

for (const file of walkHtmlFiles(GYM)) {
  const html = fs.readFileSync(file, "utf8");
  const $ = load(html);

  const $imgs = $("article img, main img, .post img, .entry-content img, .content img, .container img, img");
  if ($imgs.length === 0) { console.log(`• ${file}: no <img>`); continue; }

  const usedInPage = new Set();
  let changed = 0;

  const fileBase = path.basename(file);
  const fileBaseNoExt = path.basename(file, ".html");

  $imgs.each((i, el) => {
    const $img = $(el);
    const currentSrc = $img.attr("src") || "";
    const absCurrent = resolveCurrentOnDisk(file, currentSrc);

    // Nếu ảnh hiện tại đã tồn tại trên đĩa và không --force → giữ nguyên
    if (!FORCE && currentSrc && absCurrent && fs.existsSync(absCurrent)) return;

    const ctx = (nearestContext($, $img) + " " + fileBaseNoExt).trim();
    const topic = detectTopic(ctx, fileBaseNoExt);

    const rel = pickNext(pool, topic, usedInPage);
    if (!rel) { console.log(`  ! ${fileBase} img#${i}: topic="${topic}" -> pool EMPTY`); return; }

    const src = toSrc(rel, path.dirname(file));
    $img.attr("src", src);
    if (!($img.attr("alt") || "").trim()) $img.attr("alt", ctx);
    $img.attr("loading", "lazy");

    usedInPage.add(rel);
    markUsed(rel);
    changed++;

    console.log(`  -> ${fileBase} img#${i}: topic=${topic} pick=${rel}`);
  });

  if (changed > 0) {
    fs.writeFileSync(file, $.html(), "utf8");
    console.log(`✔ ${file}: updated ${changed} image(s).`);
    pagesChanged++;
  } else {
    console.log(`• ${file}: no changes.`);
  }
}

console.log(`\nDone. Pages modified: ${pagesChanged}.`);
