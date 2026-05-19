/**
 * Keyword-based lead classification for WMC WhatsApp messages.
 *
 * Priority order (checked top to bottom — first match wins):
 *   1. Appointment Confirmed  — explicit confirmation or compound (day + time + come)
 *   2. Stroke Rehabilitation
 *   3. Nursing Home
 *   4. Psychology / Hypnosis
 *   5. Pain Rehabilitation
 *   6. General Inquiry (fallback)
 */

// ── Appointment confirmation detection ────────────────────────────────────────

/**
 * Direct single-phrase confirmations (very high confidence).
 */
const DIRECT_CONFIRM_KEYWORDS = [
  // Chinese — explicit confirms
  "我确认", "确认预约", "确认来", "确认了", "已确认",
  "我会来", "会来的", "一定来", "肯定来", "我来了",
  "我明天来", "我今天来", "我后天来", "我下午来",
  "我过来", "我会过来", "我要过来",
  "好我来", "好的我来", "好，我来",
  "发地址", "地址发我", "怎么去", "导航", "我要去",
  // English
  "appointment confirmed", "i'll come", "i will come",
  "i'll be there", "i'm coming", "confirmed",
  "coming tomorrow", "coming today", "coming soon",
  // Mixed
  "confirm", "ok i come", "ok i'll come",
];

/**
 * Day-of-week / relative day words.
 */
const DAY_WORDS = [
  "今天", "明天", "后天", "大后天",
  "这周", "下周", "这个星期", "下个星期",
  "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日",
  "周一", "周二", "周三", "周四", "周五", "周六", "周日",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "tomorrow", "today",
];

/**
 * Time-of-day words.
 */
const TIME_WORDS = [
  "上午", "下午", "早上", "晚上", "中午", "凌晨",
  "morning", "afternoon", "evening",
];

/**
 * "Come / arrive" action words.
 */
const COME_WORDS = [
  "来", "过来", "前来", "到来", "前往", "去",
  "会去", "想去", "要去", "会到",
  "到", "准时到", "点到",               // "下午4点到" / "下午3点到"
  "come", "visit", "arrive",
];

/**
 * Returns true if message is an appointment confirmation.
 * Two paths:
 *   A) Contains a direct single-phrase confirmation keyword.
 *   B) Contains a compound: (day OR time) + come-word, meaning the patient
 *      is specifying when they will come.
 *
 * @param {string} message
 * @returns {boolean}
 */
function isAppointmentConfirmation(message) {
  if (!message) return false;
  const text  = message;
  const lower = message.toLowerCase();

  const includes = (kw) =>
    /[^\u0000-\u007f]/.test(kw) ? text.includes(kw) : lower.includes(kw.toLowerCase());

  // Path A — direct single-phrase
  if (DIRECT_CONFIRM_KEYWORDS.some(includes)) return true;

  // Path B — compound: (day OR time) + come-word
  const hasDay  = DAY_WORDS.some(includes);
  const hasTime = TIME_WORDS.some(includes);
  const hasCome = COME_WORDS.some(includes);

  // Require come-word PLUS at least one time signal
  return hasCome && (hasDay || hasTime);
}

/**
 * Simple regex extraction of appointment time from Chinese messages.
 * Returns a human-readable string like "明天下午3点" or "" if not found.
 *
 * @param {string} message
 * @returns {string}
 */
function extractAppointmentTime(message) {
  if (!message) return "";

  // e.g. "明天下午3点", "今天上午10点半", "后天早上9:30"
  const RE = /(今天|明天|后天|大后天|这个?星期[一二三四五六日天]|周[一二三四五六日])?[的\s]*(上午|下午|早上|晚上|中午)?[约\s]*(\d{1,2})[点:：](\d{0,2})?([分])?/u;
  const m = message.match(RE);
  if (!m) return "";

  const day     = m[1] || "";
  const session = m[2] || "";
  const hour    = m[3] || "";
  const min     = m[4] ? `:${m[4]}` : "";

  return `${day}${session}${hour}点${min}`.trim();
}

// ── Category RULES ────────────────────────────────────────────────────────────

const RULES = [
  {
    category: "Stroke Rehabilitation Lead",
    score: 5,
    keywords: [
      "中风", "半身不遂", "不能走", "不能走路", "手脚无力",
      "复健", "康复", "stroke", "rehabilitation",
    ],
  },
  {
    category: "Nursing Home Lead",
    score: 5,
    keywords: [
      "老人", "老人痴呆", "失智", "疗养院", "养老院",
      "住院", "护理", "不能照顾", "出院后", "长期护理",
      "dementia", "alzheimer",
    ],
  },
  {
    category: "Psychology / Hypnosis Lead",
    score: 4,
    keywords: [
      "焦虑", "失眠", "压力", "情绪", "抑郁", "心烦",
      "害怕", "惊恐", "婚姻", "家庭问题", "心理", "催眠",
      "情绪失控", "精神", "panic", "depression", "anxiety",
    ],
  },
  {
    category: "Pain Rehabilitation Lead",
    score: 4,
    keywords: [
      "腰痛", "颈痛", "背痛", "膝盖痛", "肩膀痛",
      "坐骨神经", "关节痛", "手脚麻", "麻痹", "肩周炎",
      "腰椎", "颈椎", "pain", "physiotherapy",
    ],
  },
  {
    category: "General Inquiry",
    score: 1,
    keywords: [
      "你好", "hi", "hello", "哈喽", "多少钱", "价格",
      "费用", "地址", "在哪", "营业时间",
    ],
  },
];

const DEFAULT = { category: "General Inquiry", score: 1 };

/**
 * Classifies a message.
 * Appointment detection runs FIRST (before category rules).
 *
 * @param {string} message
 * @returns {{ category: string; score: number; appointmentTime?: string }}
 */
function classifyMessage(message) {
  const text  = typeof message === "string" ? message : "";
  const lower = text.toLowerCase();

  // ── Priority 0: appointment confirmation ──────────────────────────────
  if (isAppointmentConfirmation(text)) {
    const apptTime = extractAppointmentTime(text);
    return { category: "Appointment Confirmed", score: 10, appointmentTime: apptTime };
  }

  // ── Priority 1–5: keyword rules ───────────────────────────────────────
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      const isChineseKw = /[^\u0000-\u007f]/.test(kw);
      const matched = isChineseKw
        ? text.includes(kw)
        : lower.includes(kw.toLowerCase());

      if (matched) {
        return { category: rule.category, score: rule.score };
      }
    }
  }

  return DEFAULT;
}

// ── Next Action ───────────────────────────────────────────────────────────────

/**
 * Additional keywords (outside of appointment-confirmed path) that signal
 * the patient is ready to book / visit soon.
 */
const SOFT_APPOINTMENT_KEYWORDS = [
  "预约", "appointment", "book",
  "几点", "什么时候", "时间",
];

/**
 * Derives the recommended Next Action.
 *
 * Priority:
 *   1. Category = "Appointment Confirmed"         → Prepare Appointment
 *   2. Lead score >= 80                           → Call Immediately
 *   3. Soft appointment intent keywords           → Confirm Appointment Time
 *   4. Category-based default
 *
 * @param {{ category: string; score: number; message: string }} opts
 * @returns {string}
 */
function getNextAction({ category, score, message }) {
  const text  = typeof message === "string" ? message : "";
  const lower = text.toLowerCase();

  // Priority 1 — appointment confirmed
  if (category === "Appointment Confirmed") return "Prepare Appointment";

  // Priority 2 — very hot score
  if (score >= 80) return "Call Immediately";

  // Priority 3 — soft appointment intent
  const softIntent = SOFT_APPOINTMENT_KEYWORDS.some((kw) =>
    /[^\u0000-\u007f]/.test(kw) ? text.includes(kw) : lower.includes(kw.toLowerCase()),
  );
  if (softIntent) return "Confirm Appointment Time";

  // Priority 4 — category default
  const MAP = {
    "General Inquiry":             "Ask More",
    "Pain Rehabilitation Lead":    "Invite Consultation",
    "Stroke Rehabilitation Lead":  "Arrange Rehab Assessment",
    "Psychology / Hypnosis Lead":  "Invite Counselling Session",
    "Nursing Home Lead":           "Arrange Care Assessment",
  };

  return MAP[category] ?? "Ask More";
}

// ── Lead Status ───────────────────────────────────────────────────────────────

/**
 * Rank table — higher rank always wins when comparing old vs new status.
 * Never downgrade: if old status outranks new, keep old.
 */
const STATUS_RANK = {
  "Cold Lead": 1,
  "Warm Lead": 2,
  "Hot Lead":  3,
  "Converted": 4,
  "Patient":   5,
};

const WARM_KEYWORDS = [
  "价钱", "价格", "费用", "收费", "多少钱", "怎么收费",
  "治疗", "怎么治", "疗程", "几次",
  "症状", "情况", "问题",
  "营业时间", "开门",
  "怎么约", "可以约吗",
  "评估", "检查",
  "address", "location", "price", "cost", "treatment", "session",
];

const HOT_KEYWORDS = [
  "确认", "确定", "会来", "我来", "我会来", "我会去",
  "我下午来", "我明天来", "我今天来", "我后天来", "好我来",
  "地址发我", "发地址", "怎么去", "导航",
  "ok i'll come", "confirmed", "i'll be there", "i'm coming",
];

/**
 * Keywords that indicate the customer has physically arrived at the clinic.
 * Triggers "Converted" status.
 */
const CONVERTED_KEYWORDS = [
  // Chinese
  "我到了", "我来了", "我已经到了", "到了", "已经到",
  "我在这里", "我在诊所", "我在中心", "我在里面",
  "我已经在", "刚到", "到中心了", "到诊所了",
  // English
  "i'm here", "i am here", "just arrived", "arrived",
  "at the clinic", "at the center", "i'm at", "already here",
];

/**
 * Keywords that indicate the customer is accepting long-term treatment / admission.
 * Triggers "Patient" status.
 */
const PATIENT_KEYWORDS = [
  // Chinese
  "住院", "我要住院", "接受住院", "住下来", "住院治疗",
  "长期治疗", "接受长期", "长期疗程", "长期住院",
  "办理入院", "入院", "入住",
  "接受疗养", "住疗养院", "长期护理入住",
  // English
  "in-patient", "inpatient", "admitted", "admission",
  "long term treatment", "long-term care", "long-term treatment",
  "i'll stay", "staying at", "check in",
];

/**
 * Determines Lead Status.
 *
 * Priority (highest to lowest):
 *   1. Patient   — long-term care / admission keywords
 *   2. Converted — arrived at clinic keywords
 *   3. Hot Lead  — appointment confirmed category / action / hot keywords
 *   4. Warm Lead — serious inquiry keywords or specialist category
 *   5. Cold Lead — default
 *
 * NOTE: This returns the status for THIS message only.
 *       The webhook applies STATUS_RANK to prevent downgrading from the stored status.
 *
 * @param {{ category: string; score: number; nextAction: string; message: string }} opts
 * @returns {"Patient" | "Converted" | "Hot Lead" | "Warm Lead" | "Cold Lead"}
 */
function getLeadStatus({ category, score, nextAction, message }) {
  const text  = typeof message === "string" ? message : "";
  const lower = text.toLowerCase();

  const matches = (kw) =>
    /[^\u0000-\u007f]/.test(kw) ? text.includes(kw) : lower.includes(kw.toLowerCase());

  // Patient (highest — long-term care / admission)
  if (PATIENT_KEYWORDS.some(matches))       return "Patient";

  // Converted (physically at clinic)
  if (CONVERTED_KEYWORDS.some(matches))     return "Converted";

  // Hot Lead (appointment confirmed)
  if (category === "Appointment Confirmed") return "Hot Lead";
  if (nextAction === "Prepare Appointment") return "Hot Lead";
  if (nextAction === "Confirm Appointment Time") return "Hot Lead";
  if (HOT_KEYWORDS.some(matches))           return "Hot Lead";

  // Warm Lead (serious inquiry)
  if (WARM_KEYWORDS.some(matches))          return "Warm Lead";
  if (score >= 4)                           return "Warm Lead";

  return "Cold Lead";
}

/**
 * Returns the higher-ranked of two lead statuses.
 * Use this to prevent downgrading a customer who already confirmed.
 *
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function maxLeadStatus(a, b) {
  const ra = STATUS_RANK[a] ?? 0;
  const rb = STATUS_RANK[b] ?? 0;
  return ra >= rb ? a : b;
}

module.exports = {
  classifyMessage,
  getNextAction,
  getLeadStatus,
  maxLeadStatus,
  STATUS_RANK,
  isAppointmentConfirmation,
  extractAppointmentTime,
};
