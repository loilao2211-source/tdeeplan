// scripts/list-imgs.mjs
import fs from "fs";
import path from "path";

const POSTS_DIR = "HTML/gym";
const ASSETS_DIR = "HTML/assets";

const htmlFiles = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith(".html"));
let total = 0, present = [], missing = [];

for (const f of htmlFiles) {
  const html = fs.readFileSync(path.join(POSTS_DIR, f), "utf8");
  const re = /<img[^>]*\ssrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const src = m[1].trim();
    if (!/assets\//i.test(src)) continue;
    total++;
    const name = src.replace(/^.*assets\//i, "").split(/[?#]/)[0];
    const ok = fs.existsSync(path.join(ASSETS_DIR, name));
    (ok ? present : missing).push(name);
  }
}

const uniq = a => [...new Set(a)];
console.log("📄 HTML files:", htmlFiles.length);
console.log("🖼️ <img> dùng assets/:", total);
console.log("✅ Đã có:", uniq(present).length);
console.log("❗ Thiếu :", uniq(missing).length);
console.log("\n--- MISSING ---");
uniq(missing).forEach(x => console.log(x));
