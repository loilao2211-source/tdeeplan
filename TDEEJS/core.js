// core.js 
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

// ====== Firebase config (giữ nguyên của bạn) ======
const firebaseConfig = {
  apiKey: "AIzaSyAwWrLqVa9rKzL-k9vNdLa3HxPMPG31nYY",
  authDomain: "tdee-meal-workuot.firebaseapp.com",
  projectId: "tdee-meal-workuot",
  storageBucket: "tdee-meal-workuot.firebasestorage.app",
  messagingSenderId: "735783479491",
  appId: "1:735783479491:web:68c8cbbe09fb55db9a76",
  measurementId: "G-GVZNKCHYHS"
};
const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export const authReady = (async () => {
  try { await setPersistence(auth, browserLocalPersistence); } catch (e) { console.warn(e); }
})();


export const ADS_TOGGLE = false ; // bật = true, tắt = false
export const SALE_ON = true;       // ⬅ bật/tắt sale ở đây (true=SALE)
export const SALE_PERCENT = 50;    // % giảm



// ====== App state ======
export const state = {
  currentUser: null,
  userData: null,
  isVIP: false,
  isAdmin: false,
  tempCalc: null, // lưu tạm BMR/TDEE khi user chưa login
};
export const adminEmails = ["loilao2211@gmail.com"];

const VIP_UPDATE_LIMIT = 5;
const VIP_UPDATE_WHITELIST = new Set([
  "loilao2211@gmail.com",
  "loilao2211gmail.com" // phòng gõ thiếu '@'
]);


// Ngày theo 0h Việt Nam (YYYY-MM-DD)
export const dateKeyVN = (d) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);

// Giữ lại hàm hôm nay, tái dùng dateKeyVN
export const todayKeyVN = () => dateKeyVN(new Date());

// ✅ Chỉ một bản DUY NHẤT
export function canUseVipUpdateToday(email, data = {}) {
  if (!email) return false;
  // Admin hoặc whitelist: không giới hạn
  if (adminEmails.includes(email) || VIP_UPDATE_WHITELIST.has(email)) return true;

  const log = Array.isArray(data.vipUpdateLog) ? data.vipUpdateLog : [];
  const kLocal = todayKeyVN();
  const kUTC   = new Date().toISOString().slice(0, 10); // tương thích log cũ trong ngày chuyển đổi
  const todayCount = log.filter(s => s === kLocal || s === kUTC).length;
  return todayCount < VIP_UPDATE_LIMIT;
}

export function recordVipUpdate(data = {}) {
  const kLocal = todayKeyVN();
  if (!Array.isArray(data.vipUpdateLog)) data.vipUpdateLog = [];
  data.vipUpdateLog.push(kLocal);
}


// ====== Auth helpers ======
export async function loginWithGoogle(forceChoose = true) {
  const provider = new GoogleAuthProvider();
  if (forceChoose) provider.setCustomParameters({ prompt: "select_account" });
  const { user } = await signInWithPopup(auth, provider);
  return user;
}

// ===== Firestore =====
export async function getUserData(email){
  const key = (email || "").toLowerCase();          // ✅
  if (!key) return null;
  const snap = await getDoc(doc(db, "users", key));
  return snap.exists() ? snap.data() : null;
}
// ====== Công thức tính ======
export function getActivityFactor(workoutDays){
  if (workoutDays<=2) return 1.2;
  if (workoutDays==3) return 1.375;
  if (workoutDays==4) return 1.55;
  if (workoutDays==5) return 1.7;
  if (workoutDays==6) return 1.8;
  return 1.9;
}
export function calculateBMR({gender, weight, height, age, bodyFat}) {
  if (!isNaN(bodyFat) && bodyFat > 0 && bodyFat < 60) {
    const leanMass = weight * (1 - bodyFat / 100);
    return 370 + (21.6 * leanMass);
  }
  if (gender === "male") return 10 * weight + 6.25 * height - 5 * age + 5;
  return 10 * weight + 6.25 * height - 5 * age - 161;
}
export function getMacroPercent(goal, restDay) {
  if (goal == "gain" && !restDay) return { p: 0.32, f: 0.25, c: 0.43 };
  if (goal == "gain" && restDay)  return { p: 0.35, f: 0.27, c: 0.38 };
  if (goal == "lose" && !restDay) return { p: 0.45, f: 0.22, c: 0.33 };
  if (goal == "lose" && restDay)  return { p: 0.48, f: 0.25, c: 0.27 };
  if (goal == "maintain" && !restDay) return { p: 0.3, f: 0.27, c: 0.43 };
  if (goal == "maintain" && restDay)  return { p: 0.33, f: 0.30, c: 0.37 };
  return { p: 0.3, f: 0.3, c: 0.4 };
}
export function calcMacros(calories, macro) {
  return {
    protein: (calories * macro.p / 4),
    fat:     (calories * macro.f / 9),
    carb:    (calories * macro.c / 4)
  };
}

export async function saveUserData(userData) {
  if (!state.currentUser) throw new Error("saveUserData: missing state.currentUser");
  try {
    await setDoc(doc(db, "users", state.currentUser), userData, { merge: true });
    state.userData = { ...(state.userData||{}), ...userData };
    if ('isVIP' in userData) state.isVIP = !!userData.isVIP;
  } catch (e) {
    console.error('[saveUserData] Firestore write denied:', e);
    throw e;
  }
}
// ==== SAFE TARGET CALORIES (chỉ bật khi cắt mỡ mà < BMR) ====
export const SAFE_DEFICIT = 0.20;     // 15–25%
export const REST_ADJ_SAFE = 150;     // lệch ngày nghỉ 100–200
export const MIN_FLOOR_MALE = 1500;
export const MIN_FLOOR_FEMALE = 1200;

export function computeTargets({ BMR = 0, TDEE = 0, goal = "maintain", gender = "male" } = {}) {
  const bmr  = Number(BMR)  || 0;
  const tdee = Number(TDEE) || 0;

  // ngày tập
  let train;
  if (goal === "lose") {
    // cắt 20% TDEE nhưng KHÔNG thấp hơn BMR
    train = Math.max(bmr, Math.round(tdee * 0.80));
  } else if (goal === "gain") {
    train = Math.round(tdee + 500);     // giữ logic cũ cho tăng cân
  } else {
    train = Math.round(tdee);           // maintain
  }

  // ngày nghỉ: lose -300, còn lại -200; không thấp hơn BMR
  const restDelta = (goal === "lose") ? 300 : 200;
  let rest = train - restDelta;
  if (rest < bmr) rest = bmr;

  return { train, rest, restDelta };
}



export function renderTdeeResult(result) {
  const box = document.getElementById('tdeeResult');
  if (!box) return;

  const BMR    = Number(result.BMR || 0);
  const TDEE   = Number(result.TDEE || 0);
  const goal   = result.goal   || state?.userData?.profile?.goal   || 'maintain';
  const gender = result.gender || state?.userData?.profile?.gender || 'male';

  // ưu tiên giá trị được lưu; thiếu thì tự tính từ computeTargets
  let train = Number(result.Calo || 0);
  let rest  = Number(result.CaloRest || 0);
  if (!train || !rest) {
    const t = computeTargets({ BMR, TDEE, goal, gender });
    if (!train) train = t.train;
    if (!rest)  rest  = t.rest;
  }

  box.innerHTML = `
    <div class="p-4 bg-blue-50 rounded-xl mb-2">
      <b>BMR:</b> ${BMR ? BMR.toFixed(0) : "--"} kcal &nbsp;
      <b>TDEE:</b> ${TDEE ? TDEE.toFixed(0) : "--"} kcal/ngày<br>
      <b>Calo mục tiêu (ngày tập):</b>
        <span class="text-green-700 font-bold">${train ? train.toFixed(0) : "--"} kcal</span><br>
      <b>Calo ngày nghỉ:</b> ${rest ? rest.toFixed(0) : "--"} kcal<br>
      <b>Macro/ngày tập:</b>
      Protein: ${result.Protein?.toFixed?.(0) || "--"}g,
      Carb: ${result.Carb?.toFixed?.(0) || "--"}g,
      Fat: ${result.Fat?.toFixed?.(0) || "--"}g
      <div class="text-xs text-gray-600 mt-1">(*) Ngày nghỉ hạ calo nhưng không thấp hơn BMR.</div>
    </div>`;
}


export function refreshToolbar() {
  const loginBtn = document.getElementById("btnLoginGoogle");
  const vipBtn   = document.getElementById("becomeVIPBtn");
  const vipFB    = document.getElementById("vipSupport");
  const pdfBtn   = document.getElementById("exportPDF");
  const updBtn   = document.getElementById("updateProgressBtn");

  const isLogged = !!state.currentUser;
  const hasPlan  = !!(state.userData && state.userData.mealplan);
  const isVIP    = Boolean(state.userData?.isVIP || state.isVIP);

  // Ẩn mặc định
  [vipBtn, vipFB, pdfBtn, updBtn].forEach(el => { if (el) el.style.display = "none"; });

  if (!isLogged) {
    if (loginBtn) loginBtn.textContent = "🔑 Đăng nhập với Google";
    return;
  }

  // email pill (⭐ nếu VIP)
  const emailText = (isVIP ? "⭐ " : "") + (state.currentUser || "");
  if (loginBtn) loginBtn.textContent = emailText;
  document.querySelectorAll('[data-email-pill]').forEach(el => el.textContent = emailText);

  // Khi đã có giáo án
  if (hasPlan) {
    if (vipFB)  vipFB.style.display  = "";
    if (!isVIP && vipBtn) vipBtn.style.display = "";   // mời VIP
    if (isVIP && pdfBtn) pdfBtn.style.display = "";    // VIP mới được Export PDF
    if (isVIP && updBtn) updBtn.style.display = "";    // VIP mới có Cập nhật tiến độ
  }
}

export function maybeShowAd(day1Based) {
  if (!ADS_TOGGLE) return;
  if (day1Based >= 4) {
    const box = document.getElementById("adsBox");
    if (box) {
      box.innerHTML = `
        <div class="p-4 bg-amber-50 border border-amber-200 rounded-xl shadow-sm">
          <!-- Đặt mã quảng cáo của bạn ở đây -->
          <div class="text-sm text-amber-800">Quảng cáo</div>
        </div>`;
      box.style.display = "";
      setTimeout(() => (box.style.display = "none"), 4000); // tự ẩn sau 4s
    }
  }
}

export function readForm() {
  return {
    gender:      document.getElementById("gender").value,
    age:         +document.getElementById("age").value,
    height:      +document.getElementById("height").value,
    weight:      +document.getElementById("weight").value,
    bodyFat:     parseFloat(document.getElementById("bodyFat").value || 0),
    workoutDays: +document.getElementById("workoutDays").value,
    goal:        document.getElementById("goal").value,
    subGoal:     document.getElementById("subGoal").value
  };
}


export async function handleLogin(forceChoose = true) {
  const provider = new GoogleAuthProvider();
  if (forceChoose) provider.setCustomParameters({ prompt: "select_account" });

  const { user } = await signInWithPopup(auth, provider);

  // ✅ chỉ set email lowercase + refresh UI nhẹ
  state.currentUser = (user.email || "").toLowerCase();
  refreshToolbar?.();

  // ❌ không getUserData, không set state.userData ở đây
  // để onAuthStateChanged lo toàn bộ luồng render/fetch
  return user;
}



function ld_Gts() {
  // 1) Giữ nguyên icon/checkbox/panel bạn đã chèn
  const headIc = document.querySelector("#TextList000 > .headIc");
  if (headIc && !headIc.querySelector(".isGts")) {
    headIc.insertAdjacentHTML(
      "afterbegin",
      `<li class="isGts">
        <label aria-label="Translate" class="tIc bIc n" for="offGts">
          <svg class="line" viewBox="0 0 24 24">
            <path d="M.5 2v16c0 .8.7 1.5 1.5 1.5h15L10.5.5H2C1.2.5.5 1.2.5 2z"></path>
            <path d="M12 4.5h10c.8 0 1.5.7 1.5 1.5v16c0 .8-.7 1.5-1.5 1.5h-8.5l-1.5-4M17 19.5l-3.5 4M14.5 10.5h7M17.5 9.5v1"></path>
            <path d="M20 10.5c0 1.1-1.8 4.4-4 6m0-3.5c.5 1.3 4 4.5 4 4.5m-9.9-10C8.4 6 5.9 6.2 4.5 7.9s-1.2 4.2.4 5.6 4.2 1.2 5.6-.4c.6-.7 1-1.7 1-2.6h-4"></path>
          </svg>
        </label>
      </li>`
    );
  }

  if (!document.getElementById("offGts")) {
    document.getElementById("header-icon")?.insertAdjacentHTML(
      "beforeend",
      '<div class="cBkPs">' +
        '<input class="bkmI hidden" id="offGts" type="checkbox"/>' +
        '<div class="wBkm sl"><div class="bkmS fixLs">' +
          '<div class="bkmH fixH fixT" data-text="Google Translate">' +
            '<label aria-label="Close" class="c cl" for="offGts"></label>' +
          '</div>' +
          '<div id="gtsEl" class="gtsC">Loading...</div>' +
        '</div></div>' +
        '<label class="bkmCls" for="offGts"></label>' +
      '</div>'
    );
  }

  // 2) Tạo nút nổi đẹp (gtFab) – đây sẽ là nút bấm chính
  if (!document.getElementById("gtFab")) {
    const fab = document.createElement("button");
    fab.id = "gtFab";
    fab.type = "button";
    fab.title = "Translate";
    fab.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 3h10l3 8-3 8H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path>
        <path d="M14 5h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6.5l-1.5-4"></path>
        <path d="M18 14c-1 2-2.5 4-4 5.5M14 14c.6 1.3 4 4.5 4 4.5M7 7c-2 0-4 .5-5 2s-1.2 4.2.4 5.6S6.6 16.3 8 14.6c.6-.7 1-1.7 1-2.6H5"/>
      </svg>`;
    document.body.appendChild(fab);

    // bấm nút nổi -> mở/đóng panel (toggle checkbox)
    fab.addEventListener("click", () => {
      const cb = document.getElementById("offGts");
      if (!cb) return;
      cb.checked = !cb.checked;
      if (cb.checked) openPanelAndMount(); // mở -> mount nếu cần
    });
  }

  // 3) Ẩn UI mặc định Website Translator (không remove DOM)
  (function suppressGTE() {
    const css = `
      html,body{ top:0!important; }
      #goog-gt-tt,.goog-te-balloon-frame,
      .goog-te-banner-frame,.goog-te-banner-frame.skiptranslate{
        display:block!important;visibility:hidden!important;opacity:0!important;
        height:0!important;overflow:hidden!important;pointer-events:none!important;
      }
      .goog-text-highlight{ background:none!important; box-shadow:none!important; }
    `;
    if (!document.getElementById("gt-hide-default")) {
      const st = document.createElement("style");
      st.id = "gt-hide-default"; st.textContent = css;
      document.head.appendChild(st);
    }
  })();

  // 4) Mount Google Translate khi panel mở (đảm bảo container không display:none)
  let loaded = !!(window.google && window.google.translate);
  let mounted = !!document.querySelector("#gtsEl .goog-te-gadget");

  function allowTranslationNow(){
    const meta = document.querySelector('meta[name="google"][content="notranslate"]');
    if (meta) meta.remove();
    document.documentElement.removeAttribute("translate");
    document.documentElement.classList.remove("notranslate");
  }

  function loadScriptOnce(){
    return new Promise((resolve)=>{
      if (loaded) return resolve();
      window.googleTranslateElementInit = ()=>{ loaded = true; resolve(); };
      allowTranslationNow();
      const s = document.createElement("script");
      s.id = "gts-js";
      s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      s.async = true;
      s.onerror = ()=>{ setTimeout(()=>{ // retry nhẹ
        const s2 = document.createElement("script");
        s2.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
        s2.async = true; document.body.appendChild(s2);
      }, 1000); };
      document.body.appendChild(s);
    });
  }

  function setGoogTransCookie(from, to){
    const v = `/${from}/${to}`;
    document.cookie = `googtrans=${v};path=/`;
    const host = location.hostname;
    if (host.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      document.cookie = `googtrans=${v};path=/;domain=.${host.replace(/^www\./,"")}`;
    }
  }

  function wireOnChangeClose(pageLang){
    // sau khi render, lắng nghe thay đổi -> lưu cookie + đóng panel
    setTimeout(()=>{
      const combo = document.querySelector("#gtsEl select.goog-te-combo");
      if (combo && !combo.dataset.wired){
        combo.addEventListener("change", ()=>{
          setGoogTransCookie(pageLang, combo.value || "vi");
          const cb = document.getElementById("offGts");
          if (cb) cb.checked = false;          // đóng panel
          // giữ lại chỉ nút nổi #gtFab
        });
        combo.dataset.wired = "1";
      }
    }, 300);
  }

  async function openPanelAndMount(){
    if (mounted) return;
    await loadScriptOnce();
    const pageLang = (document.documentElement.lang || "vi").toLowerCase();
    new google.translate.TranslateElement({
      pageLanguage: pageLang,
      includedLanguages: "vi,en,ja,ko,zh-CN,zh-TW,th,fr,de,es,ru",
      layout: google.translate.TranslateElement.InlineLayout.VERTICAL,
      autoDisplay: false
    }, "gtsEl");
    mounted = true;
    wireOnChangeClose(pageLang);
  }

  // Nếu panel đã mở sẵn thì mount luôn
  const cb = document.getElementById("offGts");
  cb?.addEventListener("change", ()=>{ if (cb.checked) openPanelAndMount(); });
  if (cb && cb.checked) openPanelAndMount();
}

// auto-run
document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", ld_Gts, { once:true })
  : ld_Gts();

  (function replaceToolbarGtsIcon(){
  const lab = document.querySelector('#TextList000 .headIc .isGts label[for="offGts"]');
  if (!lab) return;
  lab.innerHTML = `
    <svg class="gt-badge" viewBox="0 0 256 256" aria-hidden="true">
      <path fill="#4285F4" d="M0 32c0-17.673 14.327-32 32-32h96l32 96-32 96H32c-17.673 0-32-14.327-32-32z"/>
      <rect x="96" y="64" width="160" height="160" rx="24" fill="#E0E0E0"/>
      <path fill="#fff" d="M88 120h-16v16h16v-16zm-24-24h16v16H64V96z"/>
      <path fill="#5F6368" d="M208 112v16h-44.5c-1.2 3.4-2.8 6.7-4.8 10.1 8.1 6.4 15.7 10.6 24.4 13.9l-6.1 14c-10.7-4-19.8-9.7-28.5-17-9.1 7.5-19.2 13.4-31.3 17.5l-5.6-14.3c10.4-3.2 19.2-8 27-14.1-4.3-5.8-7.8-12.5-10.5-20.1H112v-16h32.2c.6-3.1 1-6.4 1.2-9.9h16.1c-.2 3.6-.6 6.9-1.3 9.9H208z"/>
    </svg>`;
})();




// ĐÓNG PANEL NGAY SAU KHI CHỌN NGÔN NGỮ (chắc chắn, không phụ thuộc render lại)
(function autoCloseGtsPanel(){
  // Bắt ở capture phase để luôn nhận được trước khi Google re-render
  document.addEventListener('change', function(e){
    const el = e.target;
    if (!(el instanceof HTMLSelectElement)) return;
    if (!el.classList.contains('goog-te-combo')) return;

    // (tuỳ chọn) lưu cookie để lần sau giữ ngôn ngữ
    try{
      const from = (document.documentElement.lang || 'vi').toLowerCase();
      const to = el.value || 'vi';
      const v  = `/${from}/${to}`;
      document.cookie = `googtrans=${v};path=/`;
      const host = location.hostname;
      if (host.includes('.') && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        document.cookie = `googtrans=${v};path=/;domain=.${host.replace(/^www\./,'')}`;
      }
    }catch{}

    // Đóng panel và trả focus để dropdown native thu gọn
    const cb = document.getElementById('offGts');
    if (cb) cb.checked = false;
    try { el.blur(); } catch {}
    setTimeout(()=>{ // chốt thêm một nhịp cho iOS/Safari
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
    }, 60);
  }, true);

  // Dự phòng: nếu Google re-render gadget, vẫn đóng panel đúng cách
  const host = document.getElementById('gtsEl');
  if (host) {
    new MutationObserver(()=>{
      const combo = host.querySelector('select.goog-te-combo');
      if (combo && !combo.dataset._closeWired){
        combo.addEventListener('change', ()=> {
          const cb = document.getElementById('offGts');
          if (cb) cb.checked = false;
        });
        combo.dataset._closeWired = '1';
      }
    }).observe(host, { childList:true, subtree:true });
  }
})();

(function killTranslateGhosts(){
    const H = [
      'iframe.goog-te-banner-frame','#goog-gt-tt','.goog-te-balloon-frame',
      '.goog-te-spinner-pos','.goog-te-spinner-animation',
      '.VIpgJd-ZVi9od-l4eHX-hSRGPd','.VIpgJd-ZVi9od-aZ2wEe',
      '.VIpgJd-ZVi9od-ORHb-OEVmcd','.VIpgJd-ZVi9od-vH1Gmf-ibnC6b',
      '.VIpgJd-yAWNEb-VIpgJd-fmcmS','body > .skiptranslate'
    ].join(',');
    const nuke = ()=>{
      document.documentElement.style.top='0px';
      document.body.style.top='0px';
      document.querySelectorAll(H).forEach(el=>{
        try{
          el.style.setProperty('display','none','important');
          el.style.setProperty('visibility','hidden','important');
          el.style.setProperty('opacity','0','important');
        }catch{}
      });
    };
    nuke();
    new MutationObserver(nuke).observe(document.documentElement,{childList:true,subtree:true});
  })();


// ==== Helper: key theo ngày (YYYY-MM-DD) ====
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// ==== Lưu tiến độ ngày hôm nay vào users/<email>.progress.<key> ====
async function markDayDone() {
  try {
    const u = firebase.auth().currentUser;
    if (!u) { alert('Hãy đăng nhập trước nhé.'); return; }

    const email = (u.email || '').toLowerCase();      // quan trọng: dùng lowercase cho doc id
    const key = todayKey();

    const ref = firebase.firestore().collection('users').doc(email);
    // CHỈ ghi progress, merge để không đụng tới isVIP/vipExpireAt (rules sẽ cho phép)
    await ref.set({ progress: { [key]: true } }, { merge: true });

    const btn = document.getElementById('btnDone');
    if (btn) {
      btn.disabled = true;
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-success');
      btn.textContent = '✓ Đã hoàn thành';
    }
  } catch (e) {
    console.error(e);
    alert('Không lưu được tiến độ. Kiểm tra đăng nhập & quyền (rules) nhé.');
  }
}

// ==== Gắn click cho nút (sau khi DOM sẵn sàng) ====
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnDone');
  if (btn) btn.addEventListener('click', markDayDone);
});

