// app.js
import { onAuthStateChanged, signOut } from "firebase/auth";
import { SALE_ON, SALE_PERCENT } from "./core.js?v=11";
import * as Core from "./core.js?v=11";

const {
  auth, state, refreshToolbar,
  getUserData, saveUserData,
  calculateBMR, getActivityFactor, getMacroPercent, calcMacros, renderTdeeResult,
  readForm, handleLogin, maybeShowAd, adminEmails, dateKeyVN,
  canUseVipUpdateToday, recordVipUpdate
} = Core;
await Core.authReady;
// Convert Firestore Timestamp/date/number -> milliseconds
function tsToMs(ts){
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  const p = Date.parse(ts);
  return isNaN(p) ? 0 : p;
}

// ===== SALE TOGGLE =====
window.SALE_ON       = true;   // bật/tắt sale
window.SALE_PERCENT  = 50;     // % giảm
window.SALE_LIST     = 1000000; // giá niêm yết
window.SALE_DAYS     = 30;     // số ngày VIP cho gói này




import {
  buildMealPlanByDay,
  exerciseDb, exerciseYoutubeLinks, foodDB
} from "./data.js";


console.log("[app] boot");

// nạp vip.js khi cần (lazy)
let vipMod = null;
async function useVIP() {
  if (!vipMod) {
    // CHỈ dùng một path duy nhất, không ?v=1 để tránh tạo 2 module khác nhau
    const m = await import('./vip.js');
    // Hỗ trợ cả named export lẫn default export
    vipMod = m && m.default ? m.default : m;
  }
  return vipMod;
}

/* ========= TDEE / Macro engine (g/kg) ========= */
const GOAL_PRESETS = {
  'giam-mo':            { p: 2.0, f: 0.9 },
  'tang-co-giam-mo':    { p: 2.0, f: 0.9 },
  'giu-can-giam-mo':    { p: 2.0, f: 0.8 },
  'giu-can-tang-co':    { p: 1.7, f: 1.0 },
  'tang-can-tang-co':   { p: 1.7, f: 1.1 },
  'giam-can-tang-co':   { p: 2.3, f: 0.9 },
};
function pickCalories(tdee, bmr, goalKey) {
  switch (goalKey) {
    case 'giam-mo':
    case 'tang-co-giam-mo':
    case 'giam-can-tang-co': {
      const cut500 = tdee - 500, cut300 = tdee - 300;
      const target = (cut500 < bmr) ? cut300 : cut500;
      return Math.max(target, bmr);
    }
    case 'tang-can-tang-co': return Math.round(tdee * 1.10);
    case 'giu-can-giam-mo':
    case 'giu-can-tang-co':
    default: return Math.round(tdee);
  }
}
function macrosFromPreset(weightKg, calories, preset) {
  const P = Math.round(weightKg * preset.p);
  const F = Math.round(weightKg * preset.f);
  const kcalPF = P*4 + F*9;
  let C = Math.round((calories - kcalPF) / 4);
  if (C < 0) { // hạ fat tối thiểu 0.6 g/kg rồi tính lại carb
    const fMin = Math.round(weightKg * 0.6);
    const kcalPF2 = P*4 + fMin*9;
    C = Math.max(0, Math.round((calories - kcalPF2) / 4));
    return { protein: P, carbs: C, fat: fMin, calories: P*4 + C*4 + fMin*9 };
  }
  return { protein: P, carbs: C, fat: F, calories: P*4 + C*4 + F*9 };
}
function splitMeals(m, meals){
  const even = g => Math.max(0, Math.round(g / meals));
  const p = even(m.protein), c = even(m.carbs), f = even(m.fat);
  const k = p*4 + c*4 + f*9;
  return Array.from({length: meals}, () => ({ protein:p, carbs:c, fat:f, calories:k }));
}
function buildTargets({ weight, tdee, bmr, goalKey, meals = 3 }) {
  const preset   = GOAL_PRESETS[goalKey] || GOAL_PRESETS['giam-mo'];
  const calTrain = pickCalories(tdee, bmr, goalKey);
  const train    = macrosFromPreset(weight, calTrain, preset);

  const calRest  = Math.max(bmr, calTrain - 150);
  const needDrop = Math.max(0, train.calories - calRest);
  const dropC    = Math.round(needDrop / 4);
  const rest     = {
    protein: train.protein,
    fat:     train.fat,
    carbs:   Math.max(0, train.carbs - dropC),
    calories: calRest
  };
  return {
    train: { ...train, meals, perMeal: splitMeals(train, meals) },
    rest:  { ...rest,  meals, perMeal: splitMeals(rest,  meals) }
  };
}
function mapGoalFromUI(goal, sub) {
  // goal: "maintain" | "lose" | "gain"; sub: "hypertrophy" | "fatloss" (mặc định 'hypertrophy')
  const g = (goal||'').toLowerCase(), s = (sub||'').toLowerCase();
  if (g==='gain'     && s==='hypertrophy') return 'tang-can-tang-co';
  if (g==='lose'     && s==='hypertrophy') return 'giam-can-tang-co';
  if (g==='lose'     && s==='fatloss')     return 'giam-mo';
  if (g==='maintain' && s==='hypertrophy') return 'giu-can-tang-co';
  if (g==='maintain' && s==='fatloss')     return 'giu-can-giam-mo';
  if (g==='lose')  return 'giam-mo';
  if (g==='gain')  return 'tang-can-tang-co';
  if (g==='maintain') return 'giu-can-tang-co';
  return 'giam-mo';
}




function hideVipUI() {
  const show = (id, v) => { const el = document.getElementById(id); if (el && el.style) el.style.display = v; };
  show("vipSupport", "none");   // ẩn icon Facebook cho đến khi có plan
  show("exportPDF", "none");
  show("becomeVIPBtn", "none");
  show("updateProgressBtn", "none");
  show("btnVipUpdate", "none"); 
}

function sanitizeFreeUserData(u) {
  // Free không dùng lựa chọn món chi tiết
  if (u && u.selectedFoods) delete u.selectedFoods;

  // Free vẫn giữ số bữa người dùng đã chọn (nếu có), mặc định 3
  const macros7 = (u && u.macrosArr) ? u.macrosArr : [];
  const mealCount = Number(u?.mealCount || 3);

  // rebuild mealplan theo macros đã tính sẵn
  u.mealplan = buildMealPlanByDay(macros7, mealCount);
  return u;
}

(() => {
  const html = document.documentElement;
  if (!html.hasAttribute('data-mode')) html.setAttribute('data-mode', 'landing');
  window.enterLandingMode  = () => html.setAttribute('data-mode', 'landing');
  window.enterPlannerMode  = () => html.setAttribute('data-mode', 'planner');
})();


(() => {
  const html = document.documentElement;
  if (!html.hasAttribute('data-mode')) html.setAttribute('data-mode', 'landing');

  function moveTdeeIntoPlanner(){
    const tdee = document.getElementById('tdeeResult');
    const main = document.getElementById('mainApp');
    if (tdee && main && tdee.parentElement !== main) {
      main.insertBefore(tdee, main.firstChild);   // đặt summary lên đầu card
      tdee.style.marginBottom = '8px';
    }
  }
  function restoreTdeeToForm(){
    const tdee = document.getElementById('tdeeResult');
    const formBox = document.querySelector('#formSection .bg-glass') || document.getElementById('formSection');
    if (tdee && formBox && tdee.parentElement !== formBox) {
      formBox.appendChild(tdee);
    }
  }

  window.enterLandingMode = () => {
    html.setAttribute('data-mode', 'landing');
    restoreTdeeToForm();
  };
  window.enterPlannerMode = () => {
    html.setAttribute('data-mode', 'planner');
    moveTdeeIntoPlanner();
    // ẩn ngay nếu CSS chưa kịp apply
    ['introSection','featuresRow','howBox'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.style.display='none';
    });
    document.getElementById('mainApp')?.scrollIntoView({behavior:'instant', block:'start'});
  };
})();
let __booting = true;

onAuthStateChanged(auth, async (user) => {
  const form    = document.getElementById("tdeeForm");
  const btnTDEE = document.getElementById("btnTDEE");
  const btnPlan = document.getElementById("btnPlan");
  const mainApp = document.getElementById("mainApp");
  const tdeeBox = document.getElementById("tdeeResult");

  // ----- CHƯA ĐĂNG NHẬP -> reset UI rồi RETURN -----
  if (!user) {
    state.currentUser = null;
    state.userData    = null;
    state.isVIP       = false;

    form?.classList.remove("hidden");
    btnTDEE?.classList.remove("hidden");
    if (btnPlan) btnPlan.style.display = "none";
    mainApp?.classList.add("hidden");
    if (tdeeBox) tdeeBox.innerHTML = "";
    hideVipUI?.();
    refreshToolbar();
    window.enterLandingMode?.();
    return;
  }

  // ----- ĐÃ ĐĂNG NHẬP -----
  const email = (user.email || "").toLowerCase();       // ✅ lowercase
  state.currentUser = email;
  state.isAdmin = !!adminEmails?.includes?.(email);

  // ⚠️ QUAN TRỌNG: đừng fallback {} — cần biết rõ có/không có doc
  const data = await getUserData(email);

  // Không có tài liệu người dùng -> mở form trắng và RETURN
  if (!data) {
    state.userData = null;
    state.isVIP    = false;

    // UI: về form, ẩn app
        if (!state.__pendingCreate) {
      showForm({ clearPlanner: true, clearTDEE: false, resetFields: true });
    }
    hideVipUI?.();
    refreshToolbar();
    window.enterLandingMode?.();
    return;
  }

  // Có dữ liệu -> tiếp tục render
 state.userData = data;

// Nếu chưa có dữ liệu => form trắng + return sớm
if (!data || (!data.mealplan && !data.workout && !data.tdeeResult)) {
  showForm({ clearPlanner:true, clearTDEE:false, resetFields:true });
  refreshToolbar();
  return;
}

  // VIP: ưu tiên vipExpireAt (timestamp) rồi fallback isVIP
  const vipRaw  = data.vipExpireAt;
  const vipDate = vipRaw?.toDate ? vipRaw.toDate() : (vipRaw ? new Date(vipRaw) : null);
  state.isVIP   = vipDate ? (vipDate.getTime() > Date.now()) : !!data.isVIP;

  // Summary
  renderTdeeResult(data.tdeeResult || {});

  // Planner
  if (state.isVIP) {
    const mod = await useVIP();
    mod?.initVIP?.();
    mod?.renderDayPlannerVIP?.(data);
  } else {
    // free: tái tạo mealplan từ macros + số bữa
    state.userData = sanitizeFreeUserData({ ...state.userData });
    renderDayPlanner(state.userData);
  }

  // Mở app UI
  mainApp?.classList.remove("hidden");
  window.enterPlannerMode?.();
  requestAnimationFrame(() => window.enterPlannerMode?.());
  refreshToolbar();
  showSupportIconsNow?.();
});

window.addEventListener("load", () => { __booting = false; });


function showSupportIconsNow() {
  // Chỉ bật khi đã có giáo án
  const hasPlan = !!(state.userData && state.userData.mealplan);
  if (!hasPlan) return;

  const vipBtn = document.getElementById("becomeVIPBtn");
  const vipFB  = document.getElementById("vipSupport");
  const pdfBtn = document.getElementById("exportPDF");

  if (vipFB)  vipFB.style.display  = "";
  if (vipBtn) vipBtn.style.display = state.isVIP ? "none" : "";
  if (pdfBtn) pdfBtn.style.display = state.isVIP ? "" : "none";
}

function buildWorkoutAndMacroByDay({ workoutDays, subGoal, goal }, tdee) {
  const weekdays = ["Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy","Chủ Nhật"];

  // Lấy HÔM NAY (Mon=0..Sun=6) và xoay nhãn ngày bắt đầu từ hôm nay
  const daysFixed = weekdays.slice();

  // Ép số buổi về số nguyên chắc chắn
  const sessions = Number(workoutDays) || 5;

  // Pattern 7 ngày ('' = off/cardio-core)
  const patternMap = {
    1: ['Fullbody', '', '', '', '', '', ''],
    2: ['Fullbody', '', '', 'Fullbody', '', '', ''],
    3: ['Push', '', 'Pull', '', 'Leg', '', ''],
    4: ['Upper', '', 'Lower', 'Upper', '', 'Lower', ''],
    // ⭐ 5 buổi: hôm nay là Push, sau đó Pull → Leg → Upper → Off → Lower → Off
    5: ['Push','Pull','Leg','Upper','','Lower',''],
    6: ['Push','Pull','Leg','Push','Pull','Leg',''],
    7: ['Push','Pull','Leg','Push','Pull','Leg','Core & Cardio']
  };
  const pattern = patternMap[sessions] || patternMap[5];

  const workout = [];
  const macrosArr = [];

  for (let j = 0; j < 7; j++) {
    const weekday = daysFixed[j];                    
    const splitRaw = pattern[j];                // Bài tương ứng vị trí j
    const rest = !splitRaw;
    const daySplit = splitRaw || "Cardio/Core";

    // Bài tập gợi ý
    const exList  = (exerciseDb && exerciseDb[daySplit]) ? exerciseDb[daySplit] : [];
    const exLines = exList.length
      ? exList.map(x => `- ${x}`).join("<br>")
      : "Cardio nhẹ / core / hoặc nghỉ";

    const steps = rest ? 8000 : 5000;

    const content = `
      <b>${weekday} - ${daySplit}:</b><br>
      ${exLines}<br>
      <span style="color:#28a745"><b>Khuyến nghị:</b> ${steps.toLocaleString()} steps/ngày</span>
    `;

    // Macro theo ngày tập/nghỉ
    const macroPercent = getMacroPercent(goal, rest);
    let calo = tdee + (goal === "gain" ? 500 : goal === "lose" ? -500 : 0);
    if (rest) calo -= (goal === "gain" || goal === "maintain" ? 200 : 300);

    macrosArr.push(calcMacros(calo, macroPercent));
    workout.push({ day: j + 1, rest, weekday, split: daySplit, content });
  }

  return { workout, macrosArr };
}



// ==== YouTube icon đỏ, gắn cùng dòng ====
function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
const YT_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="10" viewBox="0 0 24 17" aria-hidden="true">
    <path fill="#FF0033" d="M23.5 3.5a4 4 0 0 0-2.8-2.8C18.8 0 12 0 12 0S5.2 0 3.3.7A4 4 0 0 0 .5 3.5C0 5.4 0 8.5 0 8.5s0 3.1.5 5a4 4 0 0 0 2.8 2.8C5.2 17 12 17 12 17s6.8 0 8.7-.7a4 4 0 0 0 2.8-2.8c.5-1.9.5-5 .5-5s0-3.1-.5-5Z"/><path fill="#fff" d="M9.5 12.1V4.9L15.6 8.5 9.5 12.1Z"/></svg>`;
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

// ==== Tuần chẵn: giữ compound, đổi isolate ====
// Các bài COMPOUND để giữ nguyên
const KEEP_COMPOUND = new Set([
  "Bench Press","Overhead Press","Incline Dumbbell Press","Barbell Row",
  "Deadlift","Lat Pulldown","Pull-up","Squat","Romanian Deadlift","Leg Press","Plank"
]);
// Map isolate -> isolate khác (giữ reps/set)
const ISOLATE_SWAP = new Map([
  ["Incline Dumbbell Press", "Dumbbell Flyes"],   // coi như phụ (đổi nhẹ)
  ["Triceps Pushdown", "Overhead Cable Extension"],
  ["Lateral Raise", "Cable Lateral Raise"],
  ["Face Pull", "Rear Delt Fly"],
  ["Biceps Curl", "Hammer Curl"],
  ["Leg Extension", "Leg Extension (Single-Leg)"],
  ["Calf Raise", "Seated Calf Raise"],
  ["Dumbbell Curl", "Hammer Curl"],
  ["Triceps Dip", "Skull Crusher"]
]);

// Pull (tuần chẵn) theo mẫu bạn đưa: đổi cả thứ tự
const PULL_EVEN_TEMPLATE = [
  "Deadlift: 3x8 @80% 1RM",
  "Face Pull: 4x12",
  "Rear Delt Fly: 4x12",
  "Chest Supported Row: 4x12",
  "Hammer Curl: 4x12"
];

function transformWorkoutToEven(oddWorkoutArr) {
  if (!Array.isArray(oddWorkoutArr)) return oddWorkoutArr;
  return oddWorkoutArr.map((d) => {
    if (d?.rest) return d;
    const split = d?.split || "";
    const steps = (split === "Cardio/Core") ? 8000 : 5000;

    // 1) SPLIT = PULL => dùng template mới (thay cả thứ tự)
    if (split === "Pull") {
      const lines = PULL_EVEN_TEMPLATE.map(s => `- ${s}`).join("<br>");
      return {
        ...d,
        content:
          `<b>${d.weekday} - ${split}:</b><br>${lines}<br>` +
          `<span style="color:#28a745"><b>Khuyến nghị:</b> ${steps.toLocaleString()} steps/ngày</span>`
      };
    }

    // 2) Các split khác: giữ thứ tự, chỉ đổi isolate theo map
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



function getActiveDayOfThisWeek(data) {
  const today = new Date(); today.setHours(0,0,0,0);
  const ws = data?.weekStartDate ? new Date(data.weekStartDate) : getMonday(today);
  ws.setHours(0,0,0,0);
  let n = Math.floor((today - ws) / 86400000) + 1; // 1..7
  if (n < 1) n = 1; if (n > 7) n = 7;
  return n;
}



// Helper: lấy Thứ Hai của tuần chứa ngày d
function getMonday(d) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  const dow = (x.getDay() + 6) % 7; // Mon=0..Sun=6
  x.setDate(x.getDate() - dow);
  return x;
}

function renderDayPlanner(data) {
  window.renderDayPlanner = renderDayPlanner;

  // ===== Helpers: key ngày theo giờ VN =====
  const _fmtVN = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const dateKeyVN = (d) => _fmtVN.format(d instanceof Date ? d : new Date(d)); // 'YYYY-MM-DD'

  // Ẩn form – hiện app
  document.getElementById("tdeeForm")?.classList.add("hidden");
  document.getElementById("btnTDEE")?.classList.add("hidden");
  document.getElementById("btnPlan")?.classList.add("hidden");
  document.getElementById("mainApp")?.classList.remove("hidden");

  const planEl = document.getElementById("planContent");
  if (!planEl) return;

  const DAYS = ["Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy","Chủ Nhật"];
  const workoutNorm = normalizeWorkoutOrder(data.workout || [], DAYS);

  // --- Chuỗi 7-stage theo số buổi/tuần (để "trượt buổi") ---
  const sessions = Number(data?.profile?.workoutDays || 5);
  const STAGES = {
    1: ['Fullbody','','','','','',''],
    2: ['Fullbody','','','Fullbody','','',''],
    3: ['Push','','Pull','','Leg','',''],
    4: ['Upper','','Lower','Upper','','Lower',''],
    5: ['Push','Pull','Leg','Upper','','Lower',''],
    6: ['Push','Pull','Leg','Push','Pull','Leg',''],
    7: ['Push','Pull','Leg','Push','Pull','Leg','Cardio/Core']
  };
  const stageSeq = STAGES[sessions] || STAGES[5];

  // --- Tính macro chuẩn 7 ngày theo workout gốc (giữ như cũ) ---
const tr = data?.tdeeResult || {};
const macrosFix = (workoutNorm || []).map(d => {
  if (d?.rest) {
    return {
      protein: Number(tr.RestProtein ?? tr.Protein ?? 0),
      carb:    Number(tr.RestCarb    ?? 0),
      fat:     Number(tr.RestFat     ?? tr.Fat ?? 0)
    };
  }
  return {
    protein: Number(tr.Protein ?? 0),
    carb:    Number(tr.Carb    ?? 0),
    fat:     Number(tr.Fat     ?? 0)
  };
});
data.macrosArr = macrosFix;
data.workout   = workoutNorm;

  // ==== Tuần hiện tại & progress theo "date key" (giờ VN) ====
const now = new Date(); now.setHours(0,0,0,0);
const todayIdx = ((now.getDay() + 6) % 7) + 1; // 1..7 (Mon..Sun)

// Monday của TUẦN NÀY (0h VN)
const monday = new Date(now);
monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
monday.setHours(0,0,0,0);

// key 'YYYY-MM-DD' cho 7 ngày tuần này (theo Asia/Ho_Chi_Minh)
const weekKeys = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(monday); d.setDate(monday.getDate() + i);
  return dateKeyVN(d);
});

// Các ngày đã tích trong tuần này (key VN)
const completedDates = Array.isArray(data.completedDates) ? data.completedDates : [];
const completedKeysThisWeek = completedDates
  .map(s => dateKeyVN(s))        // ISO -> key VN
  .filter(k => weekKeys.includes(k));

const doneKeySet = new Set(completedKeysThisWeek);

// SỐ NGÀY ĐÃ TÍCH TRƯỚC HÔM NAY (không tính hôm nay)
const todayKey = dateKeyVN(now);
const doneBeforeToday = completedKeysThisWeek.filter(k => k < todayKey).length;

// Stage HÔM NAY phải dựa trên doneBeforeToday
const stageTodayPlanned = stageSeq[Math.min(6, doneBeforeToday)] || '';


  // Helper: render workout theo split + icon YouTube
  function buildContentForSplit(weekday, split) {
    const daySplit = split || "Cardio/Core";
    const exList  = (exerciseDb && exerciseDb[daySplit]) ? exerciseDb[daySplit] : [];
    const exLines = exList.length ? exList.map(x => `- ${x}`).join("<br>") : "Cardio nhẹ / core / hoặc nghỉ";
    const steps   = (daySplit === "Cardio/Core") ? 8000 : 5000;
    const raw = `<b>${weekday} - ${daySplit}:</b><br>${exLines}<br>
                 <span style="color:#28a745"><b>Khuyến nghị:</b> ${steps.toLocaleString()} steps/ngày</span>`;
    return addYoutubeIconsInline(raw);
  }

  // Helper: buổi đã tập ở ngày d (1..7) dựa vào số ngày đã tick tới ngày đó
  function stageAtDay(d) {
    const idx = d - 1;
    const doneUpToD = weekKeys.slice(0, idx + 1).filter(k => doneKeySet.has(k)).length;
    if (doneUpToD <= 0) return null;                // chưa tích ngày này
    return stageSeq[doneUpToD - 1] || '';           // buổi đã tập ở ngày d
  }

  // UI khung
  const order = [1,2,3,4,5,6,7];

  planEl.innerHTML = `
    <div class="flex items-center justify-center gap-3 mb-2">
      <span id="weekLabel" class="text-sm px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
        Tuần ${data.weekNum || 1}
      </span>
    </div>
    <div id="dayNav"></div>
    <div id="dayBody" class="space-y-3"></div>
  `;

  // Chỉ mở HÔM NAY và các ngày ĐÃ tick; các ngày trước chưa tick -> disable
  function isDoneThisWeek(d) {
    const k = weekKeys[d-1];
    return doneKeySet.has(k);
  }

  function renderNav(activeDay) {
    let nav = '<div class="flex gap-2 mb-3 justify-center">';
    for (const d of order) {
      const label = workoutNorm?.[d-1]?.weekday || DAYS[d-1];
      const canOpen = (d === todayIdx) || isDoneThisWeek(d);
      if (canOpen) {
        const cls = d === activeDay ? 'bg-blue-700 text-white' : 'bg-slate-100';
        nav += `<button data-day="${d}" class="px-3 py-1 rounded ${cls}">${label}</button>`;
      } else {
        nav += `<button class="px-3 py-1 bg-slate-200 text-slate-400 rounded cursor-not-allowed" disabled>${label}</button>`;
      }
    }
    nav += '</div>';
    document.getElementById("dayNav").innerHTML = nav;
    document.querySelectorAll('#dayNav [data-day]').forEach(b=>{
      b.onclick = () => { const d = +b.dataset.day; data.__activeDay = d; showDay(d); };
    });
  }

  function canTickDay(d) {
    if (d !== todayIdx) { alert("Chỉ được tích NGÀY HÔM NAY."); return false; }
    const k = weekKeys[d-1];
    if (doneKeySet.has(k)) { alert("Ngày này của tuần này đã được tích."); return false; }
    return true;
  }

  async function markComplete(d) {
    if (!canTickDay(d)) return;

    const k = weekKeys[d-1];
    if (!Array.isArray(data.completedDates)) data.completedDates = [];
    data.completedDates.push(new Date().toISOString());
    doneKeySet.add(k);

    // legacy 1..7 vẫn giữ cho tương thích
    data.completed = Array.from(new Set([...(data.completed || []), d]));

    await saveUserData(data);
    state.userData = data;

    alert("✅ Hoàn thành hôm nay!");
    showDay(d); // không nhảy ngày
  }

  function showDay(d) {
  data.__activeDay = d;
  const idxR = d - 1;

  renderNav(d); // render tabs trước

  const dayName = (workoutNorm?.[idxR]?.weekday) || DAYS[idxR] || `Ngày ${d}`;
  const isDone  = isDoneThisWeek(d);
  const count   = Number(data.mealCount || 3);

  let mealHtml = "";
  let woHtml   = "";

  try {
    // Nếu chưa có macrosArr 7 ngày thì build lại từ trainingCalo/restingCalo
    const ensureMacros7 = () => {
  if (Array.isArray(data.macrosArr) && data.macrosArr.length === 7) return data.macrosArr;
  const tr = data?.tdeeResult || {};
  const arr = (workoutNorm || []).map(day => {
    if (day?.rest) {
      return {
        protein: Number(tr.RestProtein ?? tr.Protein ?? 0),
        carb:    Number(tr.RestCarb    ?? 0),
        fat:     Number(tr.RestFat     ?? tr.Fat ?? 0)
      };
    }
    return { protein: Number(tr.Protein||0), carb: Number(tr.Carb||0), fat: Number(tr.Fat||0) };
  });
  data.macrosArr = arr;
  return arr;
};

    if (d === todayIdx) {
      // ===== HÔM NAY: trượt theo buổi đang tới =====
      const split   = stageTodayPlanned;
      const isRest  = (!split || split === "Cardio/Core");
      const caloNow = isRest ? restingCalo : trainingCalo;
      const macNow  = isRest
  ? { protein: Number(tr.RestProtein ?? tr.Protein ?? 0),
      carb:    Number(tr.RestCarb    ?? 0),
      fat:     Number(tr.RestFat     ?? tr.Fat ?? 0) }
  : { protein: Number(tr.Protein ?? 0),
      carb:    Number(tr.Carb    ?? 0),
      fat:     Number(tr.Fat     ?? 0) };


      // MEAL hôm nay (build từ 1 bộ macro)
      const flagsToday = Array(7).fill(!isRest);
      const plan7 = buildMealPlanByDay(macNow, count, flagsToday);

      mealHtml = Array.isArray(plan7) ? (plan7[idxR] || plan7[0] || "") : "";

      // WORKOUT hôm nay
      woHtml   = buildContentForSplit(dayName, split);

    } else if (isDone) {
      // ===== NGÀY ĐÃ TÍCH: tái dựng đúng buổi đã tập =====
      const splitDone = stageAtDay(d) || "Cardio/Core";
      const wasRest = (!splitDone || splitDone === "Cardio/Core");
      const caloDone  = wasRest ? restingCalo : trainingCalo;
      const macDone = wasRest
  ? { protein: Number(tr.RestProtein ?? tr.Protein ?? 0),
      carb:    Number(tr.RestCarb    ?? 0),
      fat:     Number(tr.RestFat     ?? tr.Fat ?? 0) }
  : { protein: Number(tr.Protein ?? 0),
      carb:    Number(tr.Carb    ?? 0),
      fat:     Number(tr.Fat     ?? 0) };
      const flagsDone = Array(7).fill(!wasRest);
      const planDone = buildMealPlanByDay(macDone, count, flagsDone);


      mealHtml = Array.isArray(planDone) ? (planDone[idxR] || planDone[0] || "") : "";
      woHtml   = buildContentForSplit(dayName, splitDone);

    } else {
      // ===== NGÀY CHƯA TÍCH: hiển thị theo lịch gốc trong tuần =====
      const macros7 = ensureMacros7();
const trainFlags = (workoutNorm || []).map(day => !day?.rest);
data.mealplan = buildMealPlanByDay(macros7, count, trainFlags);
      mealHtml = data.mealplan?.[idxR] || "";

      const woRaw = workoutNorm?.[idxR]?.content || "";
      woHtml = addYoutubeIconsInline(woRaw);
    }
  } catch (err) {
    console.error("[showDay] render error:", err);
  }

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

  const actionHTML =
    (d !== todayIdx)
      ? (isDone
          ? '<span class="text-green-700 font-semibold">✔️ Đã hoàn thành</span>'
          : '<span class="text-slate-400">Bạn đã bỏ lỡ và chưa tích ngày tập này — hãy tập bù nhé</span>')
      : (isDone
          ? '<span class="text-green-700 font-semibold">✔️ Đã hoàn thành</span>'
          : '<button id="btnTick" class="px-3 py-1 bg-blue-600 text-white rounded">Tích hoàn thành ngày này</button>');

  const all7Done = weekKeys.every(k => doneKeySet.has(k));
  const nextWeekHTML = all7Done
    ? `<div class="text-center mt-4">
         <button id="btnNextWeek" class="px-4 py-2 bg-emerald-600 text-white rounded">Lịch tập tuần mới</button>
       </div>` : ``;

  document.getElementById("dayBody").innerHTML = `
    <div class="bg-slate-50 p-4 rounded-xl">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-xl font-bold text-blue-800">Thực đơn ${dayName}</h2>
        ${controlsHTML}
      </div>
      ${mealHtml || '<div class="text-slate-400">Chưa có thực đơn.</div>'}
    </div>
    <div class="bg-blue-50 p-4 rounded-xl">
      <h2 class="text-xl font-bold text-blue-800 mb-2">Lịch tập ${dayName}</h2>
      ${woHtml || '<div class="text-slate-400">Chưa có lịch tập.</div>'}
    </div>
    <div class="text-center mt-2">${actionHTML}</div>
    ${d===todayIdx && !isDone ? '<div class="text-center mt-2 text-emerald-700 font-semibold">Hãy hoàn thành lịch tập hôm nay, ngày mai nội dung sẽ trượt sang buổi kế tiếp.</div>' : ''}
    ${nextWeekHTML}
    <div id="adsBox" class="ads" style="display:none"></div>
  `;

  // events
  const sel = document.getElementById("mealCountSelect");
  if (sel) sel.value = String(count);
  sel?.addEventListener("change", async () => {
    const newCount = +sel.value || 3;
    data.mealCount = newCount;

    // build lại macros nếu thiếu
    const macros7 = (Array.isArray(data.macrosArr) && data.macrosArr.length === 7)
   ? data.macrosArr
   : (workoutNorm || []).map(day => {
       const rest = !!day?.rest;
       const calo = rest ? restingCalo : trainingCalo;
       return calcMacros(calo, getMacroPercent(goal, rest));
     });
 const trainFlags = (workoutNorm || []).map(day => !day?.rest); // true = ngày tập
 data.mealplan = buildMealPlanByDay(macros7, newCount, trainFlags);
    await saveUserData(data);
    state.userData = data;
    showDay(d);
  });



    document.getElementById("btnTick")?.addEventListener("click", () => markComplete(d));

    document.getElementById("btnNextWeek")?.addEventListener("click", async () => {
      const dowIdx  = ((now.getDay() + 6) % 7) + 1;
      const nextMon = new Date(now); nextMon.setDate(now.getDate() + (8 - dowIdx));
      const newWeekNum = (data.weekNum || 1) + 1;

      data.weekStartDate  = nextMon.toISOString();
      data.weekNum        = newWeekNum;
      data.completed      = [];
      data.completedDates = [];

      const base = Array.isArray(data.workoutBase)
        ? normalizeWorkoutOrder(data.workoutBase, DAYS)
        : workoutNorm;
      data.workout = (newWeekNum % 2 === 0) ? transformWorkoutToEven(base) : base;

      await saveUserData(data);
      state.userData = data;
      refreshToolbar();
      renderDayPlanner(data);
    });

    // Ads (if enabled)
    maybeShowAd(d);
  }

  // Lần đầu: nếu có nhớ tab trước thì mở tab đó; không thì mở HÔM NAY
  const openDay = data.__activeDay ?? todayIdx;
  showDay(openDay);
}


function normalizeWorkoutOrder(workout, DAYS = ["Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy","Chủ Nhật"]) {
  if (!Array.isArray(workout)) return new Array(7).fill(null);

  const idxMap = {
    "Thứ Hai":0,"Thứ Ba":1,"Thứ Tư":2,"Thứ Năm":3,"Thứ Sáu":4,"Thứ Bảy":5,"Chủ Nhật":6,
    "Mon":0,"Tue":1,"Wed":2,"Thu":3,"Fri":4,"Sat":5,"Sun":6
  };

  const out = new Array(7).fill(null);
  // đặt đúng chỗ theo weekday nếu khớp
  for (const item of workout) {
    const name = (item?.weekday || "").trim();
    const i = idxMap[name];
    if (i != null && out[i] == null) out[i] = { ...item };
  }
  // chỗ trống thì lấp theo thứ tự còn lại của mảng gốc
  let j = 0;
  for (let i = 0; i < 7; i++) {
    if (!out[i]) {
      while (j < workout.length && workout[j] == null) j++;
      out[i] = workout[j] ? { ...workout[j] } : {};
      j++;
    }
    if (out[i]) out[i].weekday = DAYS[i]; // chuẩn hoá nhãn hiển thị
  }
  return out;
}


function showOnlyPlanAfterLogin(userData) {
  // header
  const { BMR, TDEE, Calo, Protein, Carb, Fat } = userData.tdeeResult;
  const header = `
    <div class="bg-white p-4 rounded-lg shadow mb-6">
      <div class="grid grid-cols-3 gap-4 text-center">
        <div><b>BMR:</b> ${BMR.toFixed(1)}</div>
        <div><b>TDEE:</b> ${TDEE.toFixed(1)}</div>
        <div><b>Calo:</b> ${Calo.toFixed(1)}</div>
      </div>
      <div class="grid grid-cols-3 gap-4 text-center mt-2">
        <div><b>Protein:</b> ${Protein.toFixed(0)}g</div>
        <div><b>Carb:</b> ${Carb.toFixed(0)}g</div>
        <div><b>Fat:</b> ${Fat.toFixed(0)}g</div>
      </div>
    </div>`;
  // bảng tuần
  const days = ["Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy","Chủ Nhật"];
  const mealplan = userData.mealplan;
  const workout  = userData.workout;
  const thead = `<tr><th class="px-2 py-1 bg-gray-100 border"></th>${days.map(d=>`<th class="px-2 py-1 bg-gray-100 border">${d}</th>`).join("")}</tr>`;
  const menuRow = `<tr><td class="px-2 py-1 font-semibold bg-gray-100 border">Thực đơn</td>${mealplan.map(h=>`<td class="px-2 py-1 border align-top">${h}</td>`).join("")}</tr>`;
  const woRow   = `<tr><td class="px-2 py-1 font-semibold bg-gray-100 border">Lịch tập</td>${workout.map(w=>`<td class="px-2 py-1 border align-top">${w.content||""}</td>`).join("")}</tr>`;
  const table = `
    <div class="overflow-auto">
      <table class="min-w-full bg-white rounded-lg overflow-hidden shadow">
        <thead>${thead}</thead><tbody>${menuRow}${woRow}</tbody>
      </table>
    </div>`;
  document.getElementById("mainApp").classList.remove("hidden");
  document.getElementById("mainApp").innerHTML = header + table;
}
function handleTdee() {
  const info = readForm();
  if (!info.age || !info.height || !info.weight) { alert("Vui lòng nhập Tuổi, Chiều cao, Cân nặng"); return; }

  const BMR  = calculateBMR(info);
  const TDEE = BMR * getActivityFactor(info.workoutDays);

  const goalKey = mapGoalFromUI(info.goal, info.subGoal);
  const plan = buildTargets({ weight: info.weight, tdee: TDEE, bmr: BMR, goalKey, meals: 3 });

  renderTdeeResult({
    BMR, TDEE,
    Calo: plan.train.calories,
    CaloRest: plan.rest.calories,
    Protein: plan.train.protein,
    Carb:    plan.train.carbs,
    Fat:     plan.train.fat,
    goal: info.goal, gender: info.gender
  });

  const planBtn = document.getElementById("btnPlan");
  if (planBtn) planBtn.style.display = "inline-block";
}




async function handleCreatePlan(opts = {}) {
  const overwrite = !!opts.overwrite;

  if (!state.currentUser) await handleLogin();
  // Lưu form hiện tại trước khi login (đề phòng onAuthStateChanged reset UI)
  const infoBeforeLogin = readForm();
  if (!state.currentUser) {
    state.__pendingCreate = { info: infoBeforeLogin };
    await handleLogin();
  }
  if (!state.currentUser) return;

  const existing = await getUserData(state.currentUser);
  const isNew = !existing;

  if (existing?.mealplan && !overwrite && !state.isAdmin) {
    state.userData = existing;
    state.isVIP = !!existing.isVIP;
    if (state.isVIP) {
      const mod = await useVIP();
      mod?.initVIP?.(); mod?.renderDayPlannerVIP?.(existing);
    } else {
      renderDayPlanner(existing);
    }
    refreshToolbar(); showSupportIconsNow();
    return;
  }

  // ---- build plan mới

const info  = (state.__pendingCreate?.info) || readForm();
  const bmr   = calculateBMR(info);
  const tdee  = bmr * getActivityFactor(info.workoutDays);

  const goalKey = mapGoalFromUI(info.goal, info.subGoal);
  const plan    = buildTargets({ weight: info.weight, tdee, bmr, goalKey, meals: 3 });

  const { workout } = buildWorkoutAndMacroByDay(info, tdee);

  // helper: đổi {carbs→carb} cho data.js
  const toM = ({ protein, carbs, fat, calories }) => ({ protein, fat, carb: carbs, calories });

  // 7 ngày: train/rest theo ngày nghỉ
  const macrosArr = (workout || []).map(w => toM(w?.rest ? plan.rest : plan.train));
  const trainFlags = (workout || []).map(w => !w?.rest);
  // meal plan từ macro/ngày
  const mealplan   = buildMealPlanByDay(macrosArr, 3, trainFlags);

  // Monday của tuần này (giữ nguyên cách tính cũ nếu bạn muốn)
  const today = new Date(); today.setHours(0,0,0,0);
  const dowIdx = (today.getDay()+6)%7;
  const monday = new Date(today); monday.setDate(today.getDate()-dowIdx);

  const saveObj = {
    profile: info,
    workout, workoutBase: workout,
    mealplan, macrosArr,
    completed: [], completedDates: [],
    weekNum: 1, weekStartDate: monday.toISOString(),
    firstTickDate: null, lastProgressUpdate: null, progressUpdated: false,
    tdeeResult: {
      BMR: bmr, TDEE: tdee,
      Calo: plan.train.calories,
      CaloRest: plan.rest.calories,
      Protein: plan.train.protein,
      Carb:    plan.train.carbs,
      Fat:     plan.train.fat,
      goal: info.goal, gender: info.gender
    },
    // lưu để tái dựng về sau không cần % cũ
    planMacros: { train: toM(plan.train), rest: toM(plan.rest) }
  };

// --- REPLACE đến đây ---


  // ⭐️ Chỉ đính kèm field VIP khi ĐÃ có doc trước đó (để không vi phạm rule create)
  if (!isNew) {
    if ('isVIP' in (existing||{}))      saveObj.isVIP = !!existing.isVIP;
    if ('vipExpireAt' in (existing||{})) saveObj.vipExpireAt = existing.vipExpireAt;
  }

  // Nếu overwrite và VIP thì cộng log ngày
  if (overwrite && state.isVIP) {
    const prevLog = Array.isArray(existing?.vipUpdateLog)
      ? existing.vipUpdateLog.slice()
      : Array.isArray(state.userData?.vipUpdateLog)
        ? state.userData.vipUpdateLog.slice()
        : [];
    const d = new Date();
    const dkey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    saveObj.vipUpdateLog = [...prevLog, dkey];
  }

  try {
    await saveUserData(saveObj);           // <— bắt lỗi ghi
  } catch (e) {
    console.error('[handleCreatePlan] save failed', e);
    alert('Không thể lưu kế hoạch do quyền Firestore. Kiểm tra Security Rules (đặc biệt isVIP/vipExpireAt).');
    return;
  }

  state.userData = saveObj;
  state.isVIP    = !!saveObj.isVIP;

  renderTdeeResult(saveObj.tdeeResult);
  if (state.isVIP) {
    const mod = await useVIP();
    mod?.initVIP?.(); mod?.renderDayPlannerVIP?.(saveObj);
  } else {
    renderDayPlanner(saveObj);
  }
  refreshToolbar(); showSupportIconsNow();
  delete state.__pendingCreate;
}






export function showForm({ clearPlanner = true, clearTDEE = false, resetFields = false } = {}) {
  document.getElementById("tdeeForm")?.classList.remove("hidden");
  document.getElementById("btnTDEE")?.classList.remove("hidden");
  const planBtn = document.getElementById("btnPlan");
  if (planBtn) planBtn.style.display = "none";
  document.getElementById("mainApp")?.classList.add("hidden");

  if (clearPlanner) {
    const planContent   = document.getElementById("planContent");
    const mealContainer = document.getElementById("meal-plan-container");
    if (planContent)   planContent.innerHTML = "";
    if (mealContainer) mealContainer.innerHTML = "";
  }

  if (clearTDEE) {
    const tdeeBox = document.getElementById("tdeeResult");
    if (tdeeBox) tdeeBox.innerHTML = "";
  }

  if (resetFields) {
  const form = document.getElementById("tdeeForm");
  if (form) {
    Array.from(form.querySelectorAll("input")).forEach(i => (i.value = ""));
    document.getElementById("gender").value      = "male";
    document.getElementById("workoutDays").value = "1";
    document.getElementById("goal").value        = "maintain";
    document.getElementById("subGoal").value     = "hypertrophy";
  }
}
}



export function showApp() {
  document.getElementById("tdeeForm")?.classList.add("hidden");
  document.getElementById("btnTDEE")?.classList.add("hidden");
  document.getElementById("btnPlan")?.classList.add("hidden");
  document.getElementById("mainApp")?.classList.remove("hidden");
}

function hideFormShowApp() {
  document.getElementById("tdeeForm")?.classList.add("hidden");
  document.getElementById("btnTDEE")?.classList.add("hidden");
  document.getElementById("btnPlan")?.classList.add("hidden");
  document.getElementById("mainApp")?.classList.remove("hidden");
}

function resetUIForLoggedOut() {
  // show form – hide app
  document.getElementById("tdeeForm")?.classList.remove("hidden");
  document.getElementById("btnTDEE")?.classList.remove("hidden");
  document.getElementById("btnPlan")?.classList.remove("hidden");
  document.getElementById("mainApp")?.classList.add("hidden");

  // clear planner cũ nếu còn
  const plan = document.getElementById("planContent");
  if (plan) plan.innerHTML = "";

  // ẩn tất cả tiện ích ngoài login
  ["becomeVIPBtn","vipSupport","exportPDF","btnVipUpdate"].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

async function wire() {
  // A) trạng thái mới mở
  state.currentUser = null;
  state.userData    = null;
  state.isVIP       = false;
  state.isAdmin     = false;

  resetUIForLoggedOut();
  showForm({ clearPlanner:true, clearTDEE:true, resetFields:true });


  const $ = (id) => document.getElementById(id);

  $("btnLoginGoogle")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await handleLogin();
  }, { once:false });

  $("btnTDEE")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await handleTdee();
  }, { once:false });

  $("btnPlan")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const btn = e.currentTarget;
 if (btn?.dataset.mode === "vip-update") return;
    await handleCreatePlan();
  }, { once:false });

  // Ẩn nút Lập giáo án ban đầu
  const planBtn = $("btnPlan");
  if (planBtn) planBtn.style.display = "none";

  refreshToolbar();
  console.log("[app] listeners attached");
}

// Auto-run
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wire, { once:true });
} else {
  wire();
}


function normalizeUserData(data){
  if (data && !data.mealplan && data["meal plan"]) {
    data.mealplan = data["meal plan"]; // fallback nếu tài liệu cũ dùng key có dấu cách
  }
  return data;
}

(function ensureTranslateBtn(){
    if(!document.getElementById('btnTranslate')){
      const btn=document.createElement('button');
      btn.id='btnTranslate'; btn.className='pill pill-icon'; btn.title='Dịch trang';
      btn.innerHTML=`<svg class="gt-icon" viewBox="0 0 256 256" aria-hidden="true">
        <path fill="#4285F4" d="M0 32c0-17.673 14.327-32 32-32h96l32 96-32 96H32c-17.673 0-32-14.327-32-32z"/>
        <rect x="96" y="64" width="160" height="160" rx="24" fill="#E0E0E0"/></svg>`;
      document.getElementById('topbar')?.insertBefore(btn, document.getElementById('topbar').firstChild);

    }
  })();

  // Gắn click mở panel
  document.getElementById('btnTranslate')?.addEventListener('click', (e)=>{
    e.preventDefault(); e.stopPropagation();
    window.toggleTranslatePanel?.();
  });


function vnd(n){ return (Number(n)||0).toLocaleString('vi-VN') + 'đ'; }

const SALE_TAG_SVG = `
<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff4d4f"/><stop offset="1" stop-color="#ff2d6f"/>
    </linearGradient>
  </defs>
  <g>
    <path d="M10 10 h70 l15 20 -15 20 h-70 a8 8 0 0 1 -8 -8 v-24 a8 8 0 0 1 8 -8z" fill="url(#g)" />
    <circle cx="28" cy="30" r="6" fill="#ffe082" stroke="#fff" stroke-width="4"/>
    <text x="44" y="36" fill="#fff" font-weight="700" font-family="system-ui,Segoe UI,Arial" font-size="22">-50%</text>
  </g>
</svg>`.trim();


window.showVipPopup = function () {
  const email = document.getElementById('vipUserEmail');
  if (email) email.textContent = (window.Core?.state?.currentUser) || '';

  const box = document.getElementById('vipPopup');
  if (!box) return;

  const btn = box.querySelector('button[onclick^="becomeVIP"]');
  if (btn) {
    const full = window.SALE_LIST;
    const pay  = window.SALE_ON ? Math.round(full*(100-window.SALE_PERCENT)/100) : full;

    // gắn class để CSS áp vào & dọn badge cũ (nếu re-open)
    btn.classList.add('vipCta');
    btn.querySelector('.sale-badge')?.remove();

    btn.innerHTML = window.SALE_ON
      ? `<s>${vnd(full)}</s> / <b>${vnd(pay)}</b>`
      : `${vnd(full)} / Tháng`;

    if (window.SALE_ON) {
      const tag = document.createElement('span');
      tag.className = 'sale-badge';
      tag.innerHTML = SALE_TAG_SVG;
      btn.appendChild(tag);            // << badge được bám & đẩy ra ngoài (CSS trên)
    }
  }

  box.style.display = 'flex';
};

window.closeVipPopup = function () {
  const box = document.getElementById('vipPopup');
  if (box) box.style.display = 'none';
};

// === OPEN VIP CHECKOUT (no client-side upgrade) ===

function priceAfterSale(amount) {
  return SALE_ON ? Math.round(amount * (100 - SALE_PERCENT) / 100) : amount;
}
const VIP_PAGE = 'vip.html';

// ONE TRUE VERSION
async function __goVipCheckout(amount = window.SALE_LIST) {
  // đảm bảo đã đăng nhập
  if (!state.currentUser) {
    await handleLogin();
    if (!state.currentUser) return;
  }

  const email = (state.currentUser || auth?.currentUser?.email || '').toLowerCase();
  if (!email) return;

  // tính tiền sale
  const pay  = window.SALE_ON ? Math.round(amount * (100 - window.SALE_PERCENT) / 100) : amount;
  const days = window.SALE_DAYS;

  // điều hướng sang vip.html kèm đủ tham số
  const url = `${VIP_PAGE}?plan=${amount}&pay=${pay}&days=${days}` +
              `&sale=${window.SALE_ON ? 1 : 0}&percent=${window.SALE_PERCENT}` +
              `&email=${encodeURIComponent(email)}`;
  location.href = url;
}

// gắn global đúng 1 lần
if (!('becomeVIP' in window)) {
  window.becomeVIP = __goVipCheckout;
  try { Object.defineProperty(window, 'becomeVIP', { writable: false, configurable: false }); } catch {}
}





window.startVipUpdate = async function () {
  if (!state.isVIP) {
    alert("Tính năng này chỉ dành cho hội viên VIP.");
    return;
  }
  if (!state.currentUser) {
    // phòng trường hợp mất phiên
    await handleLogin();
    if (!state.currentUser) return;
  }

  // ✅ Lấy dữ liệu mới nhất rồi kiểm tra giới hạn 5 lượt/ngày
  const latest = await getUserData(state.currentUser);
  state.userData = latest || state.userData || {};
  if (!canUseVipUpdateToday(state.currentUser, state.userData)) {
    alert("Bạn đã dùng hết 5 lượt cập nhật tiến độ hôm nay. Hãy thử lại vào ngày mai nhé!");
    return;
  }

  // Hiện form trắng để nhập lại
  showForm({ clearPlanner: false, clearTDEE: false, resetFields: true });

  // Bật các nút tính & lập giáo án
  const btnTDEE = document.getElementById("btnTDEE");
  const btnPlanOld = document.getElementById("btnPlan");
  btnTDEE?.classList.remove("hidden");

  if (btnPlanOld) {
    // reset mọi listener cũ + đánh dấu chế độ VIP update
    const btnPlan = btnPlanOld.cloneNode(true);        // giữ nguyên id/class
    btnPlanOld.replaceWith(btnPlan);
    btnPlan.style.display = "inline-block";
    btnPlan.dataset.mode = "vip-update";
    btnPlan.addEventListener("click", async (e) => {
      e.preventDefault();
      await handleCreatePlan({ overwrite: true });     // sẽ cộng dồn vipUpdateLog
    });
  }

  // Kéo tới form cho tiện nhập
  document.getElementById("tdeeForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
};


(() => {
  const root = document.documentElement;

  function setMode(mode) { root.setAttribute('data-mode', mode); }
  function enterLandingMode() { setMode('landing'); }
  function enterPlannerMode() { setMode('planner'); }

  window.enterLandingMode = enterLandingMode;
  window.enterPlannerMode = enterPlannerMode;

  if (!root.hasAttribute('data-mode')) setMode('landing');

  document.getElementById('btnPlan')?.addEventListener('click', () => {
    enterPlannerMode();
  });

  const targets = ['meal-plan-container', 'planContent']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  if (targets.length) {
    const obs = new MutationObserver(() => {
      const hasPlan = targets.some(n => n && n.textContent.trim().length > 0);
      if (hasPlan) enterPlannerMode();
    });
    targets.forEach(n => obs.observe(n, { childList: true, subtree: true }));
  }

  window.afterLoginLoadedPlan = function(planExists) {
    if (planExists) enterPlannerMode();
    else enterLandingMode();
  };
})();



(() => {
  const drawer = document.getElementById('menuDrawer');
  const panel  = drawer.querySelector('.drawer-panel');
  const btnHam = document.getElementById('hamburgerBtn');

  const open = () => { drawer.classList.add('open'); btnHam.setAttribute('aria-expanded','true'); };
  const close = () => { drawer.classList.remove('open'); btnHam.setAttribute('aria-expanded','false'); };

  btnHam.addEventListener('click', () => drawer.classList.contains('open') ? close() : open());
  drawer.querySelector('.drawer-backdrop').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  drawer.addEventListener('click', (e) => { if (!panel.contains(e.target) && e.target !== btnHam) close(); });

  // Proxy cho nút cập nhật tiến độ (nút thật nằm ở #updateProgressBtn)
  const realBtn  = document.getElementById('updateProgressBtn');
  const proxyBtn = document.getElementById('menuUpdateProgressProxy');

  function syncProgressBtnVisibility() {
    if (!realBtn) { proxyBtn.style.display = 'none'; return; }
    const visible = realBtn.offsetParent !== null && getComputedStyle(realBtn).display !== 'none';
    proxyBtn.style.display = visible ? '' : 'none';
  }
  if (proxyBtn) {
    proxyBtn.addEventListener('click', () => realBtn?.click());
    btnHam.addEventListener('click', () => setTimeout(syncProgressBtnVisibility, 0));
    if (realBtn) {
      const mo = new MutationObserver(syncProgressBtnVisibility);
      mo.observe(realBtn, { attributes: true, attributeFilter: ['style','class'] });
      syncProgressBtnVisibility();
    }
  }
})();

