// The one place a price is decided.
//
// The browser shows the customer a breakdown before they book, and the server
// recomputes it and refuses a booking whose total does not match. If the two ever
// disagreed, the customer would see one number and be charged another, so both
// import this file rather than each carrying its own arithmetic. It is plain JS with
// no imports for that reason: server/app.mjs loads it directly.
//
// Every rule and every number below comes from 《客户预订与服务方案》. The numbers are
// defaults only — the admin settings page overrides them, and the server passes the
// live settings in, because the document itself says the published rates govern.

// 译员等级. The document prices its worked example off "某L3中级译员标准时薪为100元/小时",
// so L3 is the anchor and the rest are set around it. The admin assigns a level during
// review, and the level — not the interpreter's own asking price — is what is charged:
// 「实际价格以平台公示的各等级时薪为准」.
export const LEVELS = {
  L1: {
    zh: "见习",
    ko: "수습",
    rate: 60,
    scope: ["基础生活陪同", "기초 생활 동행 통역"],
  },
  L2: {
    zh: "初级",
    ko: "초급",
    rate: 80,
    scope: [
      "独立处理日常生活、基础行政场景",
      "일상생활과 기초 행정 상황을 단독 처리",
    ],
  },
  L3: {
    zh: "中级",
    ko: "중급",
    rate: 100,
    scope: [
      "主力译员；出入境、学校、租房及常见行政场景",
      "주력 통역사: 출입국, 학교, 부동산 및 일반 행정 상황",
    ],
  },
  L4: {
    zh: "高级",
    ko: "고급",
    rate: 150,
    scope: ["劳动沟通、合同与商务场景", "노무 소통, 계약 및 비즈니스 상황"],
  },
  L5: {
    zh: "专家",
    ko: "전문가",
    rate: 220,
    scope: [
      "法律、医疗、税务等专业领域沟通协助",
      "법률, 의료, 세무 등 전문 영역 소통 지원",
    ],
  },
  L6: {
    zh: "金牌",
    ko: "골드",
    rate: 300,
    scope: [
      "平台认证专家；按资质开放高级场景，可带教与参与争议评审",
      "플랫폼 인증 전문가: 자격에 따라 고급 상황 담당, 멘토링 및 분쟁 심의 참여",
    ],
  },
};
export const LEVEL_KEYS = Object.keys(LEVELS);

// 第 10 条 晋升门槛. Shown to interpreters so the ladder is something they can see
// rather than ask about; the platform does not promote automatically — a level is
// still assigned by a reviewer, and these are the thresholds that reviewer applies.
export const PROMOTION = {
  L1: {
    orders: 0,
    rating: 0,
    extra: ["通过服务准则笔试", "서비스 수칙 필기 통과"],
  },
  L2: {
    orders: 20,
    rating: 4.5,
    extra: ["通过生活场景考核", "생활 상황 평가 통과"],
  },
  L3: {
    orders: 30,
    rating: 4.6,
    extra: ["通过行政场景考核", "행정 상황 평가 통과"],
  },
  L4: {
    orders: 50,
    rating: 4.7,
    extra: ["通过专业场景考核", "전문 상황 평가 통과"],
  },
  L5: {
    orders: 80,
    rating: 4.8,
    extra: [
      "具备相关资质或从业背景及领域考核",
      "관련 자격 또는 실무 경력 및 영역 평가",
    ],
  },
  L6: {
    orders: 100,
    rating: 4.9,
    extra: ["通过平台评审委员会审核", "플랫폼 심의위원회 승인"],
  },
};
// 「当前等级任职至少 1 个月、无重大违规记录、完成相应进阶培训及考核。」
export const PROMOTION_CONDITIONS = [
  ["在当前等级任职满 1 个月", "현재 등급에서 1개월 이상 근무"],
  ["无重大违规记录", "중대한 위반 기록 없음"],
  ["完成相应进阶培训及考核", "해당 심화 교육 및 평가 이수"],
  [
    "态度评分达标（未达标者不得升级）",
    "태도 평가 기준 충족 (미달 시 승급 불가)",
  ],
];

export const MODES = {
  onsite: { zh: "线下一对一", ko: "오프라인 1:1" },
  online: { zh: "线上语音通话", ko: "온라인 음성 통화" },
};
export const MODE_KEYS = Object.keys(MODES);

// Scene loading. 「涉及医疗、法律、劳动纠纷、商务谈判等专业场景，根据译员等级和场景复杂度
// 加收20%–50%」. Of our six categories these three are the professional ones; the other
// three carry no loading. A senior interpreter adds to it, which is the "译员等级" half
// of that sentence, and the result is capped at the 50% the document sets.
export const SCENE_LOAD = {
  medical: 30,
  beauty: 20,
  business: 20,
  shopping: 0,
  errands: 0,
  concert: 0,
};
export const LEVEL_LOAD = { L1: 0, L2: 0, L3: 0, L4: 10, L5: 20, L6: 20 };
export const SCENE_LOAD_CAP = 50;

export const PRICING_DEFAULTS = {
  // 线上语音 ≈ 线下价格的 40%–50%; we publish the top of that band.
  onlinePercent: 50,
  // 「预约时间须至少提前3小时」, and inside that window 「加收20%紧急服务费」.
  urgentHours: 3,
  urgentPercent: 20,
  // 「22:00以后开始的服务：加收20%」.
  nightFromMinute: 22 * 60,
  nightPercent: 20,
  // 「周末及法定节假日：加收15%」.
  weekendPercent: 15,
  // 「线下陪同：每单最低按2小时计费。线上语音：每单最低按10分钟计费」.
  minOnsiteMinutes: 120,
  minOnlineMinutes: 10,
  // 「法定节假日」 has no formula — the admin keeps the list, as YYYY-MM-DD in KST.
  holidays: [],
  // Overtime is billed by the minute, and the interpreter holds both the start and
  // the finish button. With no grace, a service running two minutes long produces a
  // bill and an argument, and a minute of padding produces a charge nobody can
  // dispute. Only the part beyond the grace is billable, so there is no cliff.
  overtimeGraceMinutes: 10,
};

const KST = 9 * 3600000;
const pct = (n) => Math.max(0, Number(n) || 0);

/** The calendar date in Seoul, as YYYY-MM-DD, for an instant. */
export const kstDate = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
/** Minutes past midnight in Seoul. */
export const kstMinute = (ms) => {
  const d = new Date(ms + KST);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const kstWeekday = (ms) => new Date(ms + KST).getUTCDay();

/**
 * The published standard hourly rate for a level. A reviewer approving an interpreter
 * starts from this, and may price that one interpreter differently; whatever they
 * settle on is stored on the interpreter and is what quote() charges. So this is the
 * suggested figure, not the authority — nothing bills through it.
 */
export const levelRate = (level, rates) =>
  (level && (rates?.[level] ?? LEVELS[level]?.rate)) || 0;

/** Minimum billable minutes for a mode, per 「最低计费时长」. */
export const minimumMinutes = (mode, cfg = PRICING_DEFAULTS) =>
  mode === "online" ? cfg.minOnlineMinutes : cfg.minOnsiteMinutes;

/**
 * Price one booking.
 *
 * Returns the billed duration, every surcharge as its own line so the customer can see
 * what they are paying for, and the total in whole yuan. Surcharges are applied to the
 * base rather than compounded on each other: 「紧急加成与时段加成可叠加」 reads as two
 * additions, and compounding would quietly charge more than the document's own worked
 * example (100 × 2h urgent = 240, not 240 plus a further slice).
 */
export function quote({
  rate,
  level = "",
  mode = "onsite",
  startMs,
  minutes,
  purposes = [],
  nowMs = Date.now(),
  settings = {},
  // Overtime turns these off; overtimeQuote below says why.
  applyMinimum = true,
  allowUrgent = true,
  allowScene = true,
}) {
  const cfg = { ...PRICING_DEFAULTS, ...settings };
  // rate is the interpreter's reviewed hourly rate — the single charged figure.
  // level only shifts the professional-scene loading below.
  const hourly = Number(rate) || 0;
  const billedMinutes = applyMinimum
    ? Math.max(Math.round(Number(minutes) || 0), minimumMinutes(mode, cfg))
    : Math.max(0, Math.round(Number(minutes) || 0));

  // 线上语音 is a percentage of the on-site hourly rate, and everything after this is
  // figured on that reduced base — the document's own example takes 20% of the online
  // price, not of the on-site one.
  const modePercent = mode === "online" ? pct(cfg.onlinePercent) : 100;
  const base = (hourly * billedMinutes * modePercent) / (60 * 100);

  const lines = [];
  const add = (key, percent, detail = {}) => {
    if (!percent) return;
    lines.push({
      key,
      percent,
      amount: Math.round((base * percent) / 100),
      ...detail,
    });
  };

  // 紧急预约: measured from when the customer orders to when the service starts.
  const leadHours = (startMs - nowMs) / 3600000;
  const urgent = allowUrgent && leadHours < pct(cfg.urgentHours);
  if (urgent) add("urgent", pct(cfg.urgentPercent));

  // 时段加成. Night is decided by the start time, as the document words it
  // (「22:00以后开始的服务」), not by whether the booking runs past 22:00.
  if (kstMinute(startMs) >= cfg.nightFromMinute)
    add("night", pct(cfg.nightPercent));

  const date = kstDate(startMs);
  const weekday = kstWeekday(startMs);
  const holiday = (cfg.holidays || []).includes(date);
  if (holiday || weekday === 0 || weekday === 6)
    add("weekend", pct(cfg.weekendPercent), { holiday });

  // 场景加成: the heaviest selected scene decides it. Adding the scenes together would
  // punish a customer for describing their day honestly.
  const sceneBase = allowScene
    ? purposes.reduce((m, p) => Math.max(m, SCENE_LOAD[p] ?? 0), 0)
    : 0;
  if (sceneBase > 0) {
    const scene = Math.min(
      SCENE_LOAD_CAP,
      sceneBase + (LEVEL_LOAD[level] ?? 0),
    );
    add("scene", scene);
  }

  const surcharges = lines.reduce((sum, l) => sum + l.amount, 0);
  return {
    hourly,
    mode,
    modePercent,
    billedMinutes,
    minimumApplied: billedMinutes > Math.round(Number(minutes) || 0),
    urgent,
    base: Math.round(base),
    lines,
    total: Math.round(base) + surcharges,
  };
}

/**
 * 「超时计费：服务时长超出预约时长的部分，按对应等级时薪按实际分钟数累计。若超时部分
 * 跨越夜间时段或节假日，按相应时段加成规则另行计算。」
 *
 * Three things the booking quote does are deliberately off here, because the sentence
 * above asks for none of them on overtime:
 *  - no minimum, or ten minutes over would bill as two hours;
 *  - no urgent fee, which is about how late the booking was placed, not about this;
 *  - no scene loading, which that sentence does not mention. It makes an overtime
 *    minute slightly cheaper than a booked one on a medical job. Charging less than
 *    the published rule is the safe direction to be wrong in.
 *
 * Night and weekend loading are decided by the moment the overtime began — the end of
 * the booked window — so a service running past 22:00 is charged at the night rate.
 */
export function overtimeQuote({
  rate,
  mode = "onsite",
  bookedEndMs,
  overtimeMinutes,
  settings = {},
}) {
  const cfg = { ...PRICING_DEFAULTS, ...settings };
  const grace = Math.max(0, Math.round(cfg.overtimeGraceMinutes ?? 0));
  const over = Math.max(0, Math.round(Number(overtimeMinutes) || 0));
  const billable = Math.max(0, over - grace);
  const priced = quote({
    rate,
    mode,
    startMs: bookedEndMs,
    minutes: billable,
    purposes: [],
    nowMs: bookedEndMs,
    settings: cfg,
    applyMinimum: false,
    allowUrgent: false,
    allowScene: false,
  });
  return {
    ...priced,
    overtimeMinutes: over,
    graceMinutes: grace,
    billableMinutes: billable,
  };
}

// 「六、取消与改期规则」. Ordered widest notice first; the first match wins.
export const CANCELLATION = [
  { minHours: 24, refundPercent: 100, feePercent: 0 },
  { minHours: 3, refundPercent: 80, feePercent: 20 },
  { minHours: 0, refundPercent: 50, feePercent: 50 },
];
// 「紧急单取消：不退预付款，但可改期一次」.
export const URGENT_CANCELLATION = {
  refundPercent: 0,
  feePercent: 100,
  reschedules: 1,
};
// 「译员迟到超过30分钟：客户可选择免费改期或全额退款」.
export const LATE_GRACE_MINUTES = 30;

/** What a customer gets back if they cancel now. */
export function cancellationTerms({
  startMs,
  nowMs = Date.now(),
  urgent = false,
}) {
  if (urgent)
    return {
      ...URGENT_CANCELLATION,
      urgent: true,
      hoursAhead: (startMs - nowMs) / 3600000,
    };
  const hoursAhead = (startMs - nowMs) / 3600000;
  const band =
    CANCELLATION.find((b) => hoursAhead >= b.minHours) ||
    CANCELLATION[CANCELLATION.length - 1];
  return { ...band, urgent: false, hoursAhead };
}

// 「八、支付与结算」 allows a 50%–100% deposit on a regular order. The platform takes
// the full amount up front for every order today, which is inside that band and is the
// only thing the settlement and refund ledger is built for, so there is no partial
// deposit here to get out of step with it.
export const DEPOSIT_PERCENT = 100;
