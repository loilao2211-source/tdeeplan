// TDEEJS/vip.js
import * as Core from "./core.js?v=11";
const { state, saveUserData, getMacroPercent, calcMacros, auth } = Core;
import {
  buildMealPlanByDayVIP,
  defaultChoices,
  exerciseYoutubeLinks,
  foodDB
} from "./data.js";
const ALLOW_EARLY_NEXT_WEEK = true;
const YT_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="14" height="10" viewBox="0 0 24 17" aria-hidden="true" style="vertical-align:middle">
  <path fill="#FF0033" d="M23.5 3.5a4 4 0 0 0-2.8-2.8C18.8 0 12 0 12 0S5.2 0 3.3.7A4 4 0 0 0 .5 3.5C0 5.4 0 8.5 0 8.5s0 3.1.5 5a4 4 0 0 0 2.8 2.8C5.2 17 12 17 12 17s6.8 0 8.7-.7a4 4 0 0 0 2.8-2.8c.5-1.9.5-5 .5-5s0-3.1-.5-5Z"/>
  <path fill="#fff" d="M9.5 12.1V4.9L15.6 8.5 9.5 12.1Z"/>
</svg>`.trim();

function normalizeWorkoutOrderVIP(workout, DAYS = ["Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy","Chủ Nhật"]) {
  if (!Array.isArray(workout)) return new Array(7).fill(null);
  const idxMap = {
    "Thứ Hai":0,"Thứ Ba":1,"Thứ Tư":2,"Thứ Năm":3,"Thứ Sáu":4,"Thứ Bảy":5,"Chủ Nhật":6,
    "Mon":0,"Tue":1,"Wed":2,"Thu":3,"Fri":4,"Sat":5,"Sun":6
  };
  const out = new Array(7).fill(null);
  for (const item of workout) {
    const name = (item?.weekday || "").trim();
    const i = idxMap[name];
    if (i != null && out[i] == null) out[i] = { ...item };
  }
  let j = 0;
  for (let i = 0; i < 7; i++) {
    if (!out[i]) {
      while (j < workout.length && workout[j] == null) j++;
      out[i] = workout[j] ? { ...workout[j] } : {};
      j++;
    }
    if (out[i]) out[i].weekday = DAYS[i]; // ép nhãn hiển thị đúng thứ
  }
  return out;
}
function addYoutubeIconsInline(html) {
  if (!html) return "";
  const parts = html.split(/<br\s*\/?>/i).map(line => {
    const m = line.match(/^\s*-\s*([^:]+)(:.*)?$/);
    if (!m) return line;
    const name = m[1].trim();
    const rest = m[2] || "";
    const url  = exerciseYoutubeLinks?.[name];
    if (!url) return line;
    const a = `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;vertical-align:middle;margin-left:6px;line-height:0">${YT_ICON}</a>`;
    return `- ${name} ${a}${rest}`;
  });
  return parts.join("<br>");
}

export function initVIP() {
  const show = (id, v) => { const el = document.getElementById(id); if (el && el.style) el.style.display = v; };
  show("vipSupport", "");
  show("exportPDF", "");

  // Ẩn nút mời VIP (đã có ⭐)
  const vipBtn = document.getElementById("becomeVIPBtn");
  if (vipBtn) vipBtn.style.display = "none";

  // ⭐ đặt trước email
  const candidates = [
    document.getElementById("userEmailBtn"),
    document.querySelector(".user-email-pill")
  ].filter(Boolean);
  if (!candidates.length && state.currentUser) {
    const all = Array.from(document.querySelectorAll("button, a, span, div"));
    const found = all.find(el => el.textContent?.trim() === state.currentUser);
    if (found) candidates.push(found);
  }
  const emailPill = candidates[0];
  if (emailPill) {
    emailPill.innerHTML = `⭐ ${state.currentUser || ""}`;
    emailPill.title = "Tài khoản VIP";
  }

  // --- Xuất PDF (ổn định nhiều lần bấm) ---
  const pdfBtn = document.getElementById("exportPDF");
if (pdfBtn && !pdfBtn.dataset._wiredPdf) {
  pdfBtn.addEventListener("click", async () => {
    try {
      const data = state.userData || {};
      const html = buildVipPdfHtml(data);

      const host = document.createElement("div");
      host.id = "__pdfHost";
      host.style.cssText = [
        "position:fixed","top:0","left:0","width:794px","max-width:100%",
        "background:#fff","opacity:0","pointer-events:none","z-index:-1"
      ].join(";");
      host.innerHTML = html;
      document.body.appendChild(host);

      const target = host.querySelector("#vipPdf") || host;

      await window.html2pdf()
        .set({
          margin: 8,
          filename: `tdee-vip-week-${data.weekNum || 1}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["avoid-all", "css", "legacy"] }
        })
        .from(target)
        .save();

      host.remove();
    } catch (err) {
      console.error("Export PDF failed:", err);
      alert("Xuất PDF gặp lỗi, vui lòng thử lại.");
    }
  }, { passive: true });

  pdfBtn.dataset._wiredPdf = "1";
}

  // --- Nút "Cập nhật tiến độ" (VIP) — gắn 1 lần ---
  let upd = document.getElementById("btnVipUpdate");
  if (!upd) {
    const after = document.getElementById("exportPDF");
    upd = document.createElement("button");
    upd.id = "btnVipUpdate";
    upd.type = "button";
    upd.className = "ml-2 px-3 py-2 rounded bg-amber-500 text-white hover:bg-amber-600 shadow";
    upd.textContent = "Cập nhật tiến độ";
    (after?.parentNode || document.getElementById("toolbar") || document.body)
      .insertBefore(upd, after ? after.nextSibling : null);
  }
  if (!upd.dataset._wiredUpd) {
    upd.addEventListener("click", () => {
      if (typeof window.startVipUpdate === "function") {
        window.startVipUpdate();
      } else {
        alert("Không tìm thấy hàm startVipUpdate.");
      }
    });
    upd.dataset._wiredUpd = "1";
  }
}




function exportVipPdf(data) {
  const wrap = document.createElement("div");
  wrap.innerHTML = buildVipPdfHtml(data);
  document.body.appendChild(wrap);
  const opt = {
    margin: 8,
    filename: "tdee_meal_workout_week.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };
  html2pdf().set(opt).from(wrap).save().then(() => wrap.remove());
}



function buildVipPdfHtml(data) {
  const mealCount = Number(data?.mealCount || 3);
  const macros7   = data?.macrosArr || [];
   const picks = (data?.selectedFoods &&
               ['carb','protein','veg'].some(k => Array.isArray(data.selectedFoods[k])))
               ? data.selectedFoods
               : null;

  // builder cho VIP; nếu chưa có thì fallback sang builder thường
  const mealplan7 =
   (Array.isArray(data.mealplan) && data.mealplan.length === 7)
     ? data.mealplan                                  // bám đúng cái đang hiển thị
     : (typeof buildMealPlanByDayVIP === 'function'   // fallback nếu chưa có
         ? buildMealPlanByDayVIP(macros7, mealCount, picks)
         : buildMealPlanByDay(macros7, mealCount));

  const days = ['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật'];
  const tr   = data?.tdeeResult || {};
  const num  = (x, d=0) => (x==null ? '--' : Number(x).toFixed(d));

  // 👇 thay cho cleanMealHtml()
  const tidy = html => (html || '')
    .replace(/ class="[^"]*"/g, '')
    .replace(/<h3[^>]*>.*?<\/h3>/is, '');

  const card = i => {
    const mealHtml = tidy(mealplan7?.[i]);
    const woRaw    = data?.workout?.[i]?.content || '';

    // 👇 nếu có addYoutubeIconsInline thì dùng, không thì để nguyên
    const woHtml   = (typeof addYoutubeIconsInline === 'function')
      ? addYoutubeIconsInline(woRaw)
      : woRaw;

    return `
      <div class="card">
        <div class="title">${days[i]}</div>
        <div class="meal">${mealHtml}</div>
        <div class="wo">
          <div style="font-weight:600;margin-bottom:4px;">Lịch tập ${days[i]}</div>
          ${woHtml}
        </div>
      </div>`;
  };

  return `
    <style>
      #vipPdf{ width:730px; margin:0 auto; font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#111; font-size:12px; }
      .header{ text-align:center; margin-bottom:10px; }
      .titlebar{ font-weight:800; color:#1e3a8a; font-size:16px; margin-bottom:6px; }
      .summary{ background:#f1f5ff; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px;
                display:grid; grid-template-columns:1fr 1fr; gap:6px 14px; break-inside:avoid; }
      .summary b{ color:#0f172a } .summary .calo{ color:#16a34a; font-weight:700 }
      .page{ page-break-after:always; } .page:last-child{ page-break-after:auto; }
      .grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px 12px; }
      .card{ border:1px solid #e5e7eb; border-radius:12px; padding:10px; background:#fff; break-inside:avoid; }
      .title{ font-weight:700; color:#0f172a; margin-bottom:6px; }
      .meal{ background:#f9fafb; border-radius:10px; padding:8px; }
      .wo{   background:#eef6ff; border-radius:10px; padding:8px; margin-top:6px; }
    </style>

    <div id="vipPdf">
      <div class="header">
        <div class="titlebar">
          TDEE, Meal & Workout Planner — Tuần ${data?.weekNum || 1}${state.currentUser ? ` • ${state.currentUser}` : ''}
        </div>
        <div class="summary">
          <div><b>BMR:</b> ${num(tr.BMR)} kcal</div>
          <div><b>TDEE:</b> ${num(tr.TDEE)} kcal/ngày</div>
          <div><b>Calo mục tiêu (ngày tập):</b> <span class="calo">${num(tr.Calo)} kcal</span></div>
          <div><b>Macro/ngày tập:</b> Protein: ${num(tr.Protein)}g • Carb: ${num(tr.Carb)}g • Fat: ${num(tr.Fat)}g</div>
        </div>
      </div>

      <div class="page"><div class="grid">${[0,1,2,3].map(card).join('')}</div></div>
      <div class="page"><div class="grid">${[4,5,6].map(card).join('')}</div></div>
    </div>`;
}

export function renderDayPlannerVIP(data, openDay = null) {
  // Ẩn form, hiện app
  document.getElementById('tdeeForm')?.classList.add('hidden');
  document.getElementById('btnTDEE')?.classList.add('hidden');
  document.getElementById('btnPlan')?.classList.add('hidden');
  document.getElementById('mainApp')?.classList.remove('hidden');

  const planEl = document.getElementById('planContent');
  if (!planEl) return;

  const days = ['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật'];
data.workout = normalizeWorkoutOrderVIP(data.workout || [], days);
  // --- NEW: tính "hôm nay" tương đối so với tuần đang lưu ---
  const start  = new Date(data.weekStartDate || new Date());
  start.setHours(0,0,0,0);
  const today  = new Date(); today.setHours(0,0,0,0);

  const diffDays = Math.floor((today - start) / 86400000); // số ngày đã trôi trong tuần
  const relIdx   = ((diffDays % 7) + 7) % 7 + 1;           // 1..7 (Mon..Sun)

  // Ưu tiên: openDay (nếu truyền) → __vipActiveDay (lần mở gần nhất) → relIdx (hôm nay)
  let currentOpenDay = Math.min(7, Math.max(1, openDay ?? data.__vipActiveDay ?? relIdx));
  data.__vipActiveDay = currentOpenDay;

  const completed = Array.isArray(data.completed) ? data.completed.slice() : [];
  const completedSet = new Set(completed);

  planEl.innerHTML = `
    <div class="flex items-center justify-center gap-3 mb-2">
      <span id="weekLabel" class="text-sm px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
        Tuần ${data.weekNum || 1}
      </span>
    </div>
    <div id="dayNav"></div>
    <div id="dayBody" class="space-y-3"></div>
  `;

  function renderNav(active1) {
    let nav = '<div class="flex gap-2 mb-3 justify-center">';
    for (let i = 1; i <= 7; i++) {
      const label = data.workout?.[i-1]?.weekday || days[i-1];
      const cls = i === active1 ? 'bg-blue-700 text-white' : 'bg-slate-100';
      nav += `<button data-day="${i}" class="px-3 py-1 rounded ${cls}">${label}</button>`;
    }
    nav += '</div>';
    document.getElementById('dayNav').innerHTML = nav;
    document.querySelectorAll('#dayNav [data-day]').forEach(b => {
      b.onclick = () => {
        const d = +b.dataset.day;
        data.__vipActiveDay = d;
        showDay(d);
      };
    });
  }

  function canTickDay(i) {
    if (completedSet.has(i)) { alert(`Ngày ${days[i-1]} đã được tích.`); return false; }
    return true;
  }

 async function markComplete(i) {
  if (!canTickDay(i)) return;

  data.completed = Array.from(new Set([...(data.completed || []), i]));
  if (!Array.isArray(data.completedDates)) data.completedDates = [];
  data.completedDates.push(new Date().toISOString());

  // đảm bảo có email trong state để saveUserData không lỗi
  if (!state.currentUser && auth?.currentUser?.email) {
    state.currentUser = auth.currentUser.email;
  }
  if (!state.currentUser) { alert("Vui lòng đăng nhập lại để lưu tiến độ."); return; }

  await saveUserData(data);
  state.userData = data;

  // nhảy sang ngày gần nhất chưa tick
  let next = i;
  for (let step = 1; step <= 7; step++) {
    const cand = ((i - 1 + step) % 7) + 1;
    if (!data.completed.includes(cand)) { next = cand; break; }
  }
  renderDayPlannerVIP(data, next);
}

function showDay(i) {
  currentOpenDay = i;
  const idx = i - 1;

  // VIP: build theo mealCount + picks, cân kcal/bữa
const mealCount = Number(data.mealCount || 3);

const goal   = data?.profile?.goal || "maintain";
const tr     = data?.tdeeResult || {};
const gender = data?.profile?.gender || 'male';

const { train: trainingCalo, rest: restingCalo } = Core.computeTargets({
  BMR: Number(tr.BMR || 0),
  TDEE: Number(tr.TDEE || 0),
  goal, gender
});

const macros7 = (data.workout || []).map((w) => {
  const rest = !!w?.rest;
  const calo = rest ? restingCalo : trainingCalo;
  return calcMacros(calo, getMacroPercent(goal, rest));
});

data.macrosArr = macros7;

const picks = (data.selectedFoods && Object.keys(data.selectedFoods).length) ? data.selectedFoods : null;
const mealplan7 = buildMealPlanByDayVIP(macros7, mealCount, picks);
data.mealplan   = mealplan7;

  const mealHtml  = mealplan7?.[idx] || "";
  const woHtml    = addYoutubeIconsInline(data.workout?.[idx]?.content || "");
  const isDone    = completedSet.has(i);

  renderNav(i);

  const controlsHTML = `
    <div class="flex items-center gap-2 text-sm">
      <label class="font-semibold">Số bữa/ngày:</label>
      <select id="mealCountSelect" class="rounded p-1 border">
        <option value="3">3 bữa/ngày</option>
        <option value="4">4 bữa/ngày</option>
        <option value="5">5 bữa/ngày</option>
      </select>
    </div>
  `;

  const actionHTML = isDone
    ? '<span class="text-green-700 font-semibold">✔️ Đã hoàn thành</span>'
    : '<button id="btnTick" class="px-3 py-1 bg-blue-600 text-white rounded">Tích hoàn thành ngày này</button>';

  const all7Done = (data.completed || []).length >= 7;
  const nextWeekHTML = all7Done
    ? `<div class="text-center mt-4">
         <button id="btnNextWeek" class="px-4 py-2 bg-emerald-600 text-white rounded">Lịch tập tuần mới</button>
       </div>` : ``;

  document.getElementById("dayBody").innerHTML = `
    <div class="bg-slate-50 p-4 rounded-xl">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-xl font-bold text-blue-800">Thực đơn ${days[idx]}</h2>
        ${controlsHTML}
      </div>
      ${mealHtml}
    </div>
    <div class="bg-blue-50 p-4 rounded-xl">
      <h2 class="text-xl font-bold text-blue-800 mb-2">Lịch tập ${days[idx]}</h2>
      ${woHtml}
    </div>
    <div class="text-center mt-2">${actionHTML}</div>
    ${nextWeekHTML}
  `;

  const sel = document.getElementById("mealCountSelect");
  if (sel) sel.value = String(mealCount);

  document.getElementById("btnTick")?.addEventListener("click", () => markComplete(i));

  document.getElementById("btnNextWeek")?.addEventListener("click", async () => {
    const d = new Date(); d.setHours(0,0,0,0);
    const dowIdx   = ((d.getDay() + 6) % 7) + 1;
    const nextMon  = new Date(d); nextMon.setDate(d.getDate() + (8 - dowIdx));
    const newWeekNum = (data.weekNum || 1) + 1;

    data.weekStartDate  = nextMon.toISOString();
    data.weekNum        = newWeekNum;
    data.completed      = [];
    data.completedDates = [];

    const base = Array.isArray(data.workoutBase) ? data.workoutBase : data.workout;
    data.workout = (newWeekNum % 2 === 0) ? transformWorkoutToEven(base) : base;

    await saveUserData(data);
    state.userData = data;
    renderDayPlannerVIP(data, 1);
  });

  sel?.addEventListener("change", async () => {
  const cnt   = +document.getElementById("mealCountSelect").value || 3;
  data.mealCount = cnt;
  const macros7 = Array.isArray(data.macrosArr) ? data.macrosArr : [];
  const picks   = (data.selectedFoods && Object.keys(data.selectedFoods).length) ? data.selectedFoods : null;
  data.mealplan = buildMealPlanByDayVIP(macros7, cnt, picks);    
  await saveUserData(data);
  state.userData = data;
  renderDayPlannerVIP(data, i);
});
}

showDay(currentOpenDay);
}



function linkifyExercise(name) {
  const title = name.replace(/:.+$/, "").trim(); // bỏ phần " : 4x12..."
  const url   = exerciseYoutubeLinks?.[title] || null;
  if (!url) return `- ${name}`;
  return `- ${name} <a href="${url}" target="_blank" rel="noopener" title="Xem video" style="text-decoration:none">📺</a>`;
}





// ==== Tuần chẵn: giữ compound, đổi isolate (cho VIP) ====
const KEEP_COMPOUND = new Set([
  "Bench Press","Overhead Press","Incline Dumbbell Press","Barbell Row",
  "Deadlift","Lat Pulldown","Pull-up","Squat","Romanian Deadlift","Leg Press","Plank"
]);
const ISOLATE_SWAP = new Map([
  ["Incline Dumbbell Press","Dumbbell Flyes"],
  ["Triceps Pushdown","Overhead Cable Extension"],
  ["Lateral Raise","Cable Lateral Raise"],
  ["Face Pull","Rear Delt Fly"],
  ["Biceps Curl","Hammer Curl"],
  ["Leg Extension","Leg Extension (Single-Leg)"],
  ["Calf Raise","Seated Calf Raise"],
  ["Dumbbell Curl","Hammer Curl"],
  ["Triceps Dip","Skull Crusher"]
]);
const PULL_EVEN_TEMPLATE = [
  "Deadlift: 3x8 @80% 1RM",
  "Face Pull: 4x12",
  "Rear Delt Fly: 4x12",
  "Chest Supported Row: 4x12",
  "Hammer Curl: 4x12"
];
function transformWorkoutToEven(oddWorkoutArr) {
  if (!Array.isArray(oddWorkoutArr)) return oddWorkoutArr;
  return oddWorkoutArr.map(d => {
    if (d?.rest) return d;
    const split = d?.split || "";
    const steps = (split === "Cardio/Core") ? 8000 : 5000;

    if (split === "Pull") {
      const lines = PULL_EVEN_TEMPLATE.map(s => `- ${s}`).join("<br>");
      return {
        ...d,
        content: `<b>${d.weekday} - ${split}:</b><br>${lines}<br>` +
                 `<span style="color:#28a745"><b>Khuyến nghị:</b> ${steps.toLocaleString()} steps/ngày</span>`
      };
    }
    const html  = d?.content || "";
    const lines = html.split(/<br\s*\/?>/i).map(line => {
      const m = line.match(/^\s*-\s*([^:]+)(:.*)?$/);
      if (!m) return line;
      const name = m[1].trim();
      const rest = m[2] || "";
      if (KEEP_COMPOUND.has(name)) return line;
      const to = ISOLATE_SWAP.get(name);
      return to ? `- ${to}${rest}` : line;
    });
    return { ...d, content: lines.join("<br>") };
  });
}


function buildPdfNode(data) {
  // Lấy số bữa đang chọn + mealplan 7 ngày (ưu tiên plan đã render sẵn để khớp 100%)
  const mealCount = Number(data.mealCount || 3);
  const macros7   = data.macrosArr || [];
  const mealplan7 = (Array.isArray(data.mealplan) && data.mealplan.length === 7)
    ? data.mealplan
    : buildMealPlanByDay(macros7, mealCount);

  const days = ['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật'];

  const { BMR=0, TDEE=0, Calo=0, Protein=0, Carb=0, Fat=0 } = data.tdeeResult || {};

  const wrap = document.createElement('div');
  wrap.id = 'pdfRoot';
  wrap.style.cssText = `
    font-family: system-ui, Roboto, Arial, sans-serif;
    color:#111;background:#fff;padding:18px;max-width:980px;margin:0 auto;
  `;
  wrap.innerHTML = `
    <style>
      .pdf-head { margin-bottom:12px; text-align:center; }
      .pdf-title { font-size:18px; font-weight:800; color:#1f4cd6; margin:0 0 8px; }
      .pdf-sub { font-size:12px; color:#334155; }
      .kpi-box {
        background:#f8fafc; border:1px solid #e5e7eb; border-radius:12px;
        padding:10px 12px; margin:12px 0 16px;
      }
      .kpi-grid {
        display:grid; grid-template-columns: repeat(3,1fr); gap:8px;
      }
      .kpi {
        background:#fff; border:1px solid #e5e7eb; border-radius:10px;
        padding:8px 10px; text-align:center;
      }
      .kpi b { display:block; color:#0f172a; font-size:11px; }
      .kpi .val { font-weight:800; font-size:14px; margin-top:2px }
      .macro { grid-column: span 3; text-align:center; font-size:12px; }
      .macro b { color:#0f172a }
      .note { margin-top:6px; font-size:11px; color:#64748b }
      .grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
      .day-card { border:1px solid #e5e7eb; border-radius:14px; padding:12px; background:#fff; break-inside: avoid; }
      .day-title { font-weight:700; color:#0f3ea2; margin-bottom:6px; }
      .meal { background:#f9fafb; border-radius:10px; padding:8px; }
      .workout { background:#eef6ff; border-radius:10px; padding:8px; margin-top:6px; }
      .page-break { page-break-after: always; }
      @media print { .day-card { break-inside: avoid; } }
    </style>

    <div class="pdf-head">
      <div class="pdf-title">TDEE, Meal & Workout Planner — Tuần ${data.weekNum || 1}</div>
      <div class="pdf-sub">${state.currentUser || ''} • Bữa/ngày: ${mealCount}</div>
    </div>

    <div class="kpi-box">
      <div class="kpi-grid">
        <div class="kpi"><b>BMR</b><div class="val">${Math.round(BMR)} kcal</div></div>
        <div class="kpi"><b>TDEE</b><div class="val">${Math.round(TDEE)} kcal</div></div>
        <div class="kpi"><b>Calo mục tiêu (ngày tập)</b><div class="val">${Math.round(Calo)} kcal</div></div>
        <div class="macro">
          <b>Macro/ngày tập:</b>
          Protein ${Math.round(Protein)}g • Carb ${Math.round(Carb)}g • Fat ${Math.round(Fat)}g
        </div>
      </div>
      <div class="note">(*) Ngày nghỉ: calo, carb, fat thấp hơn; protein ưu tiên giữ cơ.</div>
    </div>
  `;

  // 7 thẻ ngày – 2 cột, gọn, không vỡ form
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (let i = 0; i < 7; i++) {
    const card = document.createElement('div');
    card.className = 'day-card';
    card.innerHTML = `
      <div class="day-title">${days[i]}</div>
      <div class="meal">${mealplan7?.[i] || ''}</div>
      <div class="workout">${addYoutubeIconsInline(data.workout?.[i]?.content || '')}</div>
    `;
    grid.appendChild(card);
  }
  wrap.appendChild(grid);

  // (Tùy bạn: nếu muốn tách 4 ngày đầu/trang 1, 3 ngày sau/trang 2 thì có thể chèn .page-break ở giữa)
  return wrap;
}

