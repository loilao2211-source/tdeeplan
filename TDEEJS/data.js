// data.js

export const defaultChoices = {
  carb:    "rice",
  protein: "chickenThigh",
  veg:     "mangTay",
  oil:     "oil",
};

export const foodDB = {
  carb: {
    rice:        { label: "Cơm trắng",   carb: 28, kcal: 130 },
    sweetPotato: { label: "Khoai lang",  carb: 20, kcal:  86 },
    brownRice:   { label: "Gạo lứt",     carb: 23, kcal: 111 },
  },
  protein: {
    chickenBreast:      { label: "Ức gà",          protein: 31, fat: 3.6 },
    chickenThighFillet: { label: "Đùi gà phi lê",  protein: 23, fat: 6   },
    tilapia:            { label: "Cá điêu hồng",   protein: 26, fat: 3   },
    shrimp:             { label: "Tôm",            protein: 24, fat: 0.3 },
    tuna:               { label: "Cá ngừ",         protein: 29, fat: 1   },
    beefLean:           { label: "Thịt bò nạc",    protein: 26, fat: 10  },
    porkLean:           { label: "Thịt heo nạc",   protein: 27, fat: 7   },
    salmon:             { label: "Cá hồi",         protein: 20, fat: 13  },
  },
  veg: {
    rauMuongXao: { label: "Rau muống xào", carb: 5, kcal: 50 },
    bapCaiXao:   { label: "Bắp cải xào",   carb: 4, kcal: 40 },
    mangTay:     { label: "Măng tây",      carb: 4, kcal: 35 },
  },
  oil: { oil: { label: "Dầu", fat: 100, kcal: 900 } },
  snack: {
    wheyIso: { label: "Whey isolate", protein: 90, fat: 1, carb: 1, kcal: 370 },
    almond:  { label: "Hạnh nhân",    protein: 21, fat: 50, carb: 22, kcal: 579 },
    walnut:  { label: "Hạt óc chó",   protein: 15, fat: 65, carb: 14, kcal: 654 },
    yogurt:  { label: "Sữa chua",     protein: 3.6, fat: 3.0, carb: 4.7, kcal: 73 },
    banana:  { label: "Chuối",        protein: 1.1, fat: 0.3, carb: 23,  kcal: 96 },
    apple:   { label: "Táo",          protein: 0.3, fat: 0.2, carb: 14,  kcal: 52 }
  }
};



// Dùng cùng 1 công thức kcal ở mọi nơi:
// - Nếu food.kcal có sẵn (món đã nấu như cơm/khoai/rau) thì ưu tiên dùng
// - Nếu không, tính từ macro (P*4 + C*4 + F*9)
function kcalPer100(food) {
  const p = food?.protein ?? 0, c = food?.carb ?? 0, f = food?.fat ?? 0;
  return (p || c || f) ? (p*4 + c*4 + f*9) : (food?.kcal || 0);
}
function kcalOfFood(food, g){ return kcalPer100(food) * g / 100; }

function macrosOfFood(food, g){
  return {
    p: (food?.protein||0) * g / 100,
    c: (food?.carb||0)    * g / 100,
    f: (food?.fat||0)     * g / 100,
    k: kcalOfFood(food, g)
  };
}
const KCAL_TOL = 2;
const round5 = x => Math.max(0, Math.round(x/5)*5);

// ====== CẬP NHẬT: thêm exclude (món đã dùng trong ngày) & allowFatSlack ======
function pickProteinThatFits({ pMeal, fMeal, calTarget, vegK, minCarbK, baseId, cycle, exclude = [], allowFatSlack = 0 }) {
  const budget = calTarget - vegK - minCarbK; // kcal còn cho phần đạm (+dầu)
  const start  = Math.max(0, cycle.indexOf(baseId));
  const order  = [...cycle.slice(start), ...cycle.slice(0, start)]
                  .filter(id => !exclude.includes(id)); // ⬅ loại món đã dùng

  let best = null;

  for (const id of order) {
    const f = foodDB.protein[id]; if (!f) continue;
    const protPerG = (f.protein || 0) / 100;
    const fatPerG  = (f.fat     || 0) / 100;

    const gIdeal   = Math.round((pMeal / Math.max(0.1, f.protein)) * 100);
    const kcalPerG = ((f.protein||0)*4 + (f.fat||0)*9) / 100;
    const gByKcal  = Math.floor(budget / Math.max(0.1, kcalPerG));
    const gByFat   = fatPerG > 0 ? Math.floor((fMeal + allowFatSlack) / fatPerG) : gIdeal;

    const g = Math.max(0, Math.min(gIdeal, gByKcal, gByFat));
    if (!g) continue;

    const pAch = protPerG * g;
    const fat  = fatPerG  * g;
    const kcal = ((f.protein||0)*4 + (f.fat||0)*9) * g / 100;

    if (pAch >= pMeal - 0.5 && kcal <= budget + KCAL_TOL && fat <= fMeal + allowFatSlack + 0.5) {
      return { id, g, pAch, fatAch: fat, kcal };
    }
    if (!best || pAch > best.pAch) best = { id, g, pAch, fatAch: fat, kcal };
  }
  return best; // có thể < pMeal; snack sẽ bù nếu còn ngân sách kcal ngày
}


// Xoay vòng các combo snack hiển thị (không ghi gram/kcal)
const SNACK_COMBOS = [
  "Sữa chua + Chuối",
  "Táo + Hạnh nhân (vài hạt)",
  "Sữa chua + Táo",
  "Chuối + Óc chó (vài hạt)",
  "Sữa chua Hy Lạp + Việt quất",
  "Bánh mì đen + Bơ đậu phộng (mỏng)",
  "Phô mai + Bánh gạo",
  "Ngũ cốc không đường + Sữa tươi ít béo"
];

// Pool snack để “ước lượng” khi còn thừa kcal, nhưng CHỈ để tính chọn – không hiển thị gram
const SNACK_POOL = [
  { key: "banana", label: "Chuối",        kcal100: 96  },
  { key: "apple",  label: "Táo",          kcal100: 52  },
  { key: "yogurt", label: "Sữa chua",     kcal100: 73  },
  { key: "almond", label: "Hạnh nhân",    kcal100: 579 },
  { key: "walnut", label: "Óc chó",       kcal100: 654 },
];

// 1 khẩu phần ước lượng (để quyết định chọn cái nào khi còn thiếu kcal)
const SNACK_PORTION_KCAL = {
  banana: 100,   // ~1 quả nhỏ
  apple:  80,    // ~1 quả vừa
  yogurt: 73,    // 1 hộp 100g
  almond: 90,    // ~15g (vài hạt)
  walnut: 95     // ~15g (vài hạt)
};
// Map tên -> key dùng trong SNACK_PORTION_KCAL
const NAME_TO_KEY = {
  "Chuối": "banana",
  "Táo": "apple",
  "Sữa chua": "yogurt",
  "Hạnh nhân": "almond",
  "Óc chó": "walnut",
};

// Ước lượng kcal 1 label/combination dựa vào SNACK_PORTION_KCAL (nếu có)
function comboKcal(label){
  return label.split('+')
    .map(s => s.trim().replace(/\s*\(.*?\)/, "")) // bỏ "(vài hạt)" nếu có
    .map(name => NAME_TO_KEY[name] || "")
    .reduce((sum, key) => sum + (SNACK_PORTION_KCAL[key] || 0), 0);
}

// Vòng mảng để xoay vòng theo ngày
const rotate = (arr, n) => [...arr.slice(n % arr.length), ...arr.slice(0, n % arr.length)];

// Combo gợi ý
const PREWORKOUT_COMBOS = [
  "Chuối + Sữa chua",
  "Táo + Sữa chua",
  "Chuối + Ngũ cốc",     // nếu không có kcal preset vẫn OK, chỉ là nhãn
  "Táo + Hạnh nhân",
];

const RESTDAY_COMBOS = [
  "Sữa chua",
  "Táo",
  "Chuối",
  "Hạnh nhân (vài hạt)",
  "Óc chó (vài hạt)",
  "Sữa chua + Táo",
  "Táo + Hạnh nhân",
];


// ✅ HÀM MỚI: có isTrainingDay
function pickSnackLabel(dayIdx, kcalRemain = 0, isTrainingDay = null) {
  // Chọn pool theo ngày tập/nghỉ
  const basePool =
    isTrainingDay === true  ? PREWORKOUT_COMBOS :
    isTrainingDay === false ? RESTDAY_COMBOS   :
                               SNACK_COMBOS;

  // Không để "Chuối + Chuối"
  const noDup = s => !/\bChuối\b.*\bChuối\b/i.test(s);

  // Xoay vòng theo ngày để đỡ lặp
  let rot = rotate(basePool, dayIdx).filter(noDup);

  // Nếu còn rất ít kcal → ưu tiên combo nhẹ (1 món)
  if (kcalRemain <= 40) {
    const light = rot.find(s => s.indexOf('+') === -1) || rot[0];
    return light;
  }

  // Nếu đã có bảng kcal khẩu phần, cố gắng fit dưới kcalRemain
  const fit = rot.find(s => comboKcal(s) <= kcalRemain);
  if (fit) return fit;

  // Không có ước lượng kcal → trả item đầu theo xoay vòng
  return rot[0] || "Sữa chua";
}



function buildMealPlanCore({
  macrosInput,
  mealCount = 3,
  mode = "free",
  picks = null,
  trainFlags = null // ⬅️ mảng 7 phần tử: true = ngày tập, false = ngày nghỉ
}) {
  const macrosArr = Array.isArray(macrosInput) ? macrosInput : Array(7).fill(macrosInput);

  const defCarb = ["rice","brownRice","sweetPotato"];
  const defProt = [
    "chickenBreast","tilapia","shrimp","tuna",
    "chickenThighFillet","beefLean","porkLean","salmon"
  ];
  const defVeg  = ["mangTay","bapCaiXao","rauMuongXao"];

  const plan = [];

  for (let i = 0; i < 7; i++) {
    const m = macrosArr[i] || { protein:0, fat:0, carb:0 };

    const usedProt = new Set(); // ⬅ không lặp đạm trong ngày

    let sumP = 0, sumC = 0, sumF = 0, sumK = 0;
    const meals = [];

    for (let b = 1; b <= mealCount; b++) {
      const r = i + b - 1;

      const chooseId = (group, defaults) => {
        if (mode === "vip") {
          const v = picks?.[group];
          if (Array.isArray(v) && v.length) return v[r % v.length];
          if (typeof v === "string" && v)   return v;
        }
        return defaults[r % defaults.length];
      };

      const carbId = chooseId("carb",    defCarb);
      const protId = chooseId("protein", defProt);
      const vegId  = chooseId("veg",     defVeg);

      const carbFood = foodDB.carb[carbId]    || foodDB.carb.rice;
      const vegFood  = foodDB.veg[vegId]      || foodDB.veg.mangTay;

      const pMeal = (m.protein||0) / mealCount;
      const fMeal = (m.fat||0)     / mealCount;
      const cMeal = (m.carb||0)    / mealCount;
      const calTarget = Math.round(pMeal*4 + fMeal*9 + cMeal*4);

      const carbPer100 = Math.max(1, carbFood.carb||0);
      const cMinCarb   = Math.max(20, Math.round(0.5 * cMeal));
      const minCarbG   = Math.round((cMinCarb / carbPer100) * 100);
      const minCarbK   = kcalOfFood(carbFood, minCarbG);

      const vegG = 100, veg = macrosOfFood(vegFood, vegG);

      const protCycle = [
        "chickenBreast","tilapia","shrimp","tuna",
        "chickenThighFillet","beefLean","porkLean","salmon"
      ];

      // PASS 1: loại các món đã dùng trong ngày
      let pick = pickProteinThatFits({
        pMeal, fMeal, calTarget, vegK: veg.k, minCarbK,
        baseId: protId, cycle: protCycle, exclude: Array.from(usedProt)
      });
      // PASS 2: nếu không có lựa chọn khác, cho phép dùng lại (và nới fat nhẹ 1.5g)
      if (!pick) {
        pick = pickProteinThatFits({
          pMeal, fMeal, calTarget, vegK: veg.k, minCarbK,
          baseId: protId, cycle: protCycle, exclude: [], allowFatSlack: 1.5
        });
      }

      const protFood = foodDB.protein[pick.id];
      usedProt.add(pick.id); // ⬅ đánh dấu đã dùng

      let protG = pick.g;
      let pf    = { p: pick.pAch, c: 0, f: pick.fatAch, k: pick.kcal };

      // bắt đầu với carb = tối thiểu
      let carbG = minCarbG, carb = macrosOfFood(carbFood, carbG);

      // bù dầu để đạt fat
      let oilFatG  = 0;
      let kcalLeft = calTarget - (veg.k + pf.k + carb.k);
      const fatShort = Math.max(0, fMeal - pf.f);
      if (kcalLeft > 0 && fatShort > 0) {
        oilFatG  = Math.floor(Math.min(fatShort, kcalLeft/9));
        kcalLeft -= oilFatG * 9;
      }

      // đẩy carb gần mục tiêu
      const cGoalG = Math.round((cMeal / carbPer100) * 100);
      if (kcalLeft > 0 && carbG < cGoalG) {
        const kPer1gFood = Math.max(0.1, kcalPer100(carbFood) / 100);
        const add = Math.floor(Math.min(kcalLeft / Math.max(0.1,kPer1gFood), cGoalG - carbG));
        carbG += Math.max(0, add);
        carb = macrosOfFood(carbFood, carbG);
        kcalLeft = calTarget - (veg.k + pf.k + carb.k + oilFatG*9);
      }

      // tinh chỉnh kcal
      let kcalMeal = veg.k + pf.k + carb.k + oilFatG*9;
      let diff = Math.round(calTarget - kcalMeal);
      if (Math.abs(diff) > KCAL_TOL) {
        const kPer1gFood = Math.max(0.1, kcalPer100(carbFood) / 100);
        if (diff > 0) {
          const add = Math.floor(diff / Math.max(0.1, kPer1gFood));
          carbG += Math.max(0, add);
        } else {
          const drop = Math.ceil(Math.abs(diff) / Math.max(0.1, kPer1gFood));
          carbG = Math.max(minCarbG, carbG - drop);
        }
        carb = macrosOfFood(carbFood, carbG);
        kcalMeal = veg.k + pf.k + carb.k + oilFatG*9;
      }

      /* ========= (2) CHỐT Ở BỮA CUỐI: đảm bảo tổng ngày khớp kcal mục tiêu (±2) ========= */
      if (b === mealCount) {
        const kcalTargetDay = Math.round((m.protein||0)*4 + (m.fat||0)*9 + (m.carb||0)*4);
        const diffDay = Math.round(kcalTargetDay - (sumK + kcalMeal)); // dương = thiếu
        if (Math.abs(diffDay) > KCAL_TOL) {
          const kPer1gFood = Math.max(0.1, kcalPer100(carbFood) / 100); // kcal/gram carb
          let deltaG = Math.round(diffDay / kPer1gFood);                 // gram cần bù/giảm
          carbG = Math.max(minCarbG, carbG + deltaG);
          carb  = macrosOfFood(carbFood, carbG);
          kcalMeal = veg.k + pf.k + carb.k + oilFatG*9;
        }
      }
      /* ===================================================================================== */

      const oilTxt = oilFatG > 0 ? ` + ${(foodDB.oil?.oil?.label)||"Dầu"} ${oilFatG}g` : "";
      meals.push(
        `<b>Bữa ${b}:</b> ${carbFood.label} ${carbG}g + ${protFood.label} ${protG}g + ${vegFood.label} ${vegG}g${oilTxt}
         <span style="color:#6b7280">(${Math.round(kcalMeal)} kcal)</span>`
      );

      sumP += pf.p + carb.p + veg.p;
      sumC += carb.c + veg.c;
      sumF += pf.f + oilFatG + veg.f;
      sumK += kcalMeal;
    }

    /* ===== BỮA PHỤ – ĐA DẠNG, KHÔNG GRAM/KCAL, NGÀY TẬP THÌ GHI “(ăn trước tập)” ===== */
const isTrainDay = Array.isArray(trainFlags) ? !!trainFlags[i] : true; // fallback: coi như ngày tập

// Lấy label từ DB để đồng nhất
const LB = {
  banana: foodDB.snack?.banana?.label || "Chuối",
  yogurt: foodDB.snack?.yogurt?.label || "Sữa chua",
  almond: foodDB.snack?.almond?.label || "Hạnh nhân",
  walnut: foodDB.snack?.walnut?.label || "Óc chó",
  apple:  foodDB.snack?.apple?.label  || "Táo"
};

// Combo NGÀY TẬP (ăn trước tập) – luôn 2 món
const SNACK_TRAIN = [
  [LB.banana, LB.yogurt],
  [LB.banana, LB.almond],
  [LB.banana, LB.walnut],
  [LB.yogurt, LB.apple],
  [LB.apple,  LB.almond],
];

// Combo NGÀY NGHỈ – 1–2 món
const SNACK_REST = [
  [LB.yogurt, LB.apple],
  [LB.apple,  LB.walnut],
  [LB.yogurt, LB.walnut],
  [LB.apple],          // 1 món
  [LB.yogurt],         // 1 món
];

const pool = isTrainDay ? SNACK_TRAIN : SNACK_REST;
const pair = pool[i % pool.length];

// Loại phần tử trùng (phòng khi label trùng nhau)
const uniq = [];
for (const x of pair) if (x && !uniq.includes(x)) uniq.push(x);

const snackText  = uniq.join(" + ");
const snackTitle = isTrainDay ? "Bữa phụ (ăn trước tập)" : "Bữa phụ";

plan.push(`
  <div>${meals.join("<br>")}</div>
  <h4 class="mt-2">${snackTitle}: ${snackText}</h4>
`);
  }

  return plan;
}




// ===== EXPORT API =====
export function buildMealPlanByDay(macrosInput, mealCount = 3, trainFlags = null) {
  return buildMealPlanCore({ macrosInput, mealCount, mode: "free", picks: null, trainFlags });
}
export function buildMealPlanByDayVIP(macrosInput, mealCount = 3, picks = null, trainFlags = null) {
  return buildMealPlanCore({ macrosInput, mealCount, mode: "vip", picks, trainFlags });
}



// ==================== EXERCISE DB + YOUTUBE ====================
export const exerciseDb = {
  Push: ["Bench Press: 4x10 @70% 1RM","Overhead Press: 4x10","Incline Dumbbell Press: 4x10","Triceps Pushdown: 4x12","Lateral Raise: 4x12"],
  Pull: ["Deadlift: 3x8 @80% 1RM","Barbell Row: 4x10","Lat Pulldown: 4x12","Face Pull: 4x15","Biceps Curl: 4x12"],
  Upper:["Bench Press: 4x10 @70% 1RM","Pull-up: 4x10","Overhead Press: 4x12","Barbell Row: 4x12","Dumbbell Curl: 4x12","Triceps Dip: 4x12"],
  Lower:["Squat: 4x10 @75% 1RM","Deadlift: 4x10 @75% 1RM","Leg Press: 4x12","Leg Curl: 4x12","Calf Raise: 4x15"],
  Leg:  ["Squat: 4x10 @75% 1RM","Leg Press: 4x12","Romanian Deadlift: 4x10","Leg Extension: 4x15","Calf Raise: 4x15"],
  Fullbody: ["Squat: 4x10","Bench Press: 4x10","Deadlift: 4x10","Pull-up: 4x10","Plank: 3x60s"],
  "Cardio/Core": []
};

export const exerciseYoutubeLinks = {
  "Bench Press": "https://www.youtube.com/watch?v=gRVjAtPip0Y",
  "Pull-up": "https://www.youtube.com/watch?v=eGo4IYlbE5g",
  "Overhead Press": "https://www.youtube.com/watch?v=qEwKCR5JCog",
  "Incline Dumbbell Press": "https://www.youtube.com/watch?v=8iPEnn-ltC8",
  "Barbell Row": "https://www.youtube.com/watch?v=vT2GjY_Umpw",
  "Dumbbell Curl": "https://www.youtube.com/watch?v=ykJmrZ5v0Oo",
  "Triceps Dip": "https://www.youtube.com/watch?v=6kALZikXxLc",
  "Triceps Pushdown": "https://www.youtube.com/watch?v=2-LAMcpzODU",
  "Lateral Raise": "https://www.youtube.com/watch?v=kDqklk1ZESo",
  "Deadlift": "https://www.youtube.com/watch?v=ytGaGIn3SjE",
  "Lat Pulldown": "https://www.youtube.com/watch?v=CAwf7n6Luuc",
  "Face Pull": "https://www.youtube.com/watch?v=vB5OHsJ3EME",
  "Squat": "https://www.youtube.com/watch?v=aclHkVaku9U",
  "Leg Press": "https://www.youtube.com/watch?v=IZxyjW7MPJQ",
  "Leg Curl": "https://www.youtube.com/watch?v=1Tq3QdYUuHs",
  "Calf Raise": "https://www.youtube.com/watch?v=YMmgqO8Jo-k",
  "Romanian Deadlift": "https://www.youtube.com/watch?v=2SHsk9AzdjA",
  "Leg Extension": "https://www.youtube.com/watch?v=YyvSfVjQeL0",
  "Plank": "https://www.youtube.com/watch?v=pSHjTRCQxIw",
  "Cardio": "https://www.youtube.com/watch?v=ml6cT4AZdqI",

  // Các bài isolate dùng cho tuần chẵn – thêm mới:
  "Dumbbell Flyes": "https://www.youtube.com/watch?v=eozdVDA78K0",
  "Overhead Cable Extension": "https://www.youtube.com/watch?v=_gsUck-7M74",
  "Cable Lateral Raise": "https://www.youtube.com/watch?v=3VcKaXpzqRo",
  "Rear Delt Fly": "https://www.youtube.com/watch?v=0a_fVSf5qPo",
  "Hammer Curl": "https://www.youtube.com/watch?v=zC3nLlEvin4",
  "Seated Calf Raise": "https://www.youtube.com/watch?v=YMmgqO8Jo-k",
  "Leg Extension (Single-Leg)": "https://www.youtube.com/watch?v=YyvSfVjQeL0",
  "Skull Crusher": "https://www.youtube.com/watch?v=d_KZxkY_0cM",
  "Chest Supported Row": "https://www.youtube.com/watch?v=U06n3Vwq2bo",

};
