/**
 * Marketing CRM — service interest, keyword, lead type (marketing rules), marketing stage.
 */

const MARKETING_STAGES = [
  "New Lead",
  "Engaged",
  "Interested",
  "Appointment Intent",
  "Appointment Booked",
  "Follow Up Needed",
  "Converted",
  "Lost",
];

const STAGE_RANK = {
  "New Lead": 0,
  Engaged: 1,
  Interested: 2,
  "Appointment Intent": 3,
  "Appointment Booked": 4,
  "Follow Up Needed": 5,
  Converted: 6,
  Lost: 100,
};

/**
 * @param {string} s
 * @returns {string | null}
 */
function normalizeMarketingStage(s) {
  const t = typeof s === "string" ? s.trim() : "";
  if (!t) return null;
  return MARKETING_STAGES.find((x) => x.toLowerCase() === t.toLowerCase()) || null;
}

/**
 * @param {string} a
 * @param {string} b
 */
function strongerMarketingStage(a, b) {
  if (a === "Lost" || b === "Lost") return "Lost";
  const ra = STAGE_RANK[a] ?? -1;
  const rb = STAGE_RANK[b] ?? -1;
  return ra >= rb ? a : b;
}

/**
 * @param {string} text
 * @returns {string}
 */
function inferServiceInterestMarketing(text) {
  const t = typeof text === "string" ? text : "";
  const low = t.toLowerCase();
  if (/中风|半身不遂|stroke|不能走路|手脚无力/.test(t) || /\bstroke\b/i.test(low)) {
    return "Stroke Rehab";
  }
  if (
    /腰痛|膝盖|膝痛|肩膀|肩痛|疼痛|麻痹|坐骨|颈椎|knee|shoulder|pain|back pain|lumbar/i.test(
      t,
    )
  ) {
    return "Pain Treatment";
  }
  if (/心理|焦虑|抑郁|情绪|压力|panic|depression|trauma|辅导|失眠.*情绪/i.test(t)) {
    return "Mental Health";
  }
  if (/疗养院|养老院|老人照顾|nursing|住院照顾/i.test(t)) {
    return "Nursing Home";
  }
  if (/中医|体质|调理|针灸|中药/i.test(t)) {
    return "TCM";
  }
  return "General Inquiry";
}

/**
 * @param {string} text
 * @returns {string}
 */
function extractMarketingKeyword(text) {
  const t = typeof text === "string" ? text : "";
  const checks = [
    ["中风", "中风"],
    ["stroke", "stroke"],
    ["腰痛", "腰痛"],
    ["膝盖", "膝盖"],
    ["心理", "心理"],
    ["焦虑", "焦虑"],
    ["疗养院", "疗养院"],
    ["预约", "预约"],
    ["价格", "价格"],
    ["费用", "费用"],
  ];
  for (const [needle, label] of checks) {
    if (t.includes(needle)) return label;
  }
  const low = t.toLowerCase();
  if (/\bpain\b|\bknee\b|\bshoulder\b/.test(low)) return "pain";
  if (/\bappointment\b|\bprice\b/.test(low)) return low.match(/\b(appointment|price)\b/i)?.[1] || "";
  return "";
}

/**
 * Marketing Hot/Cold rules (WhatsApp path).
 * @param {string} trimmedMessage
 * @param {boolean} casualGreet
 * @param {string} crmLeadType Hot Lead / Warm Lead / Cold Lead
 * @returns {string}
 */
function inferMarketingLeadType(trimmedMessage, casualGreet, crmLeadType) {
  if (casualGreet) {
    return "Cold Lead";
  }
  const t = typeof trimmedMessage === "string" ? trimmedMessage : "";
  if (
    /价格|价钱|费用|收费|多少钱|预约|约诊|appointment|book|地址|在哪|location|地图|怎么去|how to get/i.test(
      t,
    )
  ) {
    return "Hot Lead";
  }
  const c = typeof crmLeadType === "string" ? crmLeadType : "";
  if (/hot/i.test(c)) return "Hot Lead";
  if (/warm/i.test(c)) return "Warm Lead";
  if (/cold/i.test(c)) return "Cold Lead";
  return "Warm Lead";
}

/**
 * @param {{
 *   trimmedMessage: string;
 *   casualGreet: boolean;
 *   marketingLeadType: string;
 *   previousMarketingStage: string;
 *   pipelineSalesStage: string;
 *   crmCategory: string;
 * }} p
 * @returns {string}
 */
function inferMarketingStage(p) {
  const t = typeof p.trimmedMessage === "string" ? p.trimmedMessage : "";
  const prev = normalizeMarketingStage(p.previousMarketingStage) || "New Lead";

  if (/不考虑|不用了|取消|没兴趣|lost|not interested|别联系/i.test(t)) {
    return "Lost";
  }
  if (p.pipelineSalesStage === "Appointment Booked") {
    return strongerMarketingStage(prev, "Appointment Booked");
  }
  if (/成交|已付|付款|converted|谢谢.*康复/i.test(t)) {
    return strongerMarketingStage(prev, "Converted");
  }
  if (/改天|再联系|跟进|follow up|稍后/i.test(t)) {
    return strongerMarketingStage(prev, "Follow Up Needed");
  }
  const hotRule =
    /价格|价钱|费用|收费|多少钱|预约|约诊|地址|在哪|location|地图|appointment|book|price/i.test(
      t,
    ) || /Hot Lead/i.test(p.marketingLeadType || "");
  if (hotRule) {
    return strongerMarketingStage(prev, "Appointment Intent");
  }
  const svc = inferServiceInterestMarketing(t);
  if (svc !== "General Inquiry" && t.length > 3 && !p.casualGreet) {
    return strongerMarketingStage(prev, "Interested");
  }
  if (!p.casualGreet && t && t !== "(no text)") {
    return strongerMarketingStage(prev, "Engaged");
  }
  return prev;
}

module.exports = {
  MARKETING_STAGES,
  inferServiceInterestMarketing,
  extractMarketingKeyword,
  inferMarketingLeadType,
  inferMarketingStage,
  normalizeMarketingStage,
};
