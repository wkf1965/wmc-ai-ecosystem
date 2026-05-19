/**
 * Sales pipeline stage inference (rules + optional AI string).
 * Canonical stages must match Google Sheet "Pipeline" tab.
 */

const PIPELINE_STAGES = [
  "New Inquiry",
  "Contacted",
  "Assessment Interested",
  "Appointment Booked",
  "Treatment Started",
  "Follow Up Needed",
  "Lost Lead",
  "Converted",
];

/** @type {Record<string, number>} higher = later in funnel (except terminals handled separately) */
const STAGE_RANK = {
  "New Inquiry": 0,
  Contacted: 1,
  "Assessment Interested": 2,
  "Appointment Booked": 3,
  "Treatment Started": 4,
  "Follow Up Needed": 5,
  "Lost Lead": 90,
  Converted: 100,
};

/**
 * @param {unknown} s
 * @returns {string | null} canonical stage or null if unknown
 */
function normalizePipelineStage(s) {
  const t = typeof s === "string" ? s.trim() : "";
  if (!t) return null;
  const low = t.toLowerCase();
  return PIPELINE_STAGES.find((x) => x.toLowerCase() === low) || null;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function strongerStage(a, b) {
  if (a === "Lost Lead" || b === "Lost Lead") return "Lost Lead";
  const ra = STAGE_RANK[a] ?? -1;
  const rb = STAGE_RANK[b] ?? -1;
  return ra >= rb ? a : b;
}

/**
 * Rule-based stage from latest user text (Chinese + English).
 * @param {string} userText
 * @returns {string | null}
 */
function inferStageFromRules(userText) {
  const t = typeof userText === "string" ? userText.trim() : "";
  if (!t || t === "(no text)") return null;
  const low = t.toLowerCase();

  if (
    /不考虑|不用了|别联系|不去了|取消预约|不要再发|退订|不用预约|没兴趣|^lost\b|not interested|stop contacting|cancel everything/i.test(
      t,
    ) ||
    /cancel\s+(the\s+)?(appointment|booking)/i.test(low)
  ) {
    return "Lost Lead";
  }

  if (
    /已经来过|来过中心|到诊了|开始治疗|已经开始|正在复健|已开始疗程|already came|started treatment|visited today|first session done/i.test(
      t,
    )
  ) {
    return "Treatment Started";
  }

  if (
    /约好了|敲定|确认.*(时间|日期)|订在.*(周|月|\d)|confirmed.*(appointment|time|date)|booked for/i.test(t) ||
    (/\d{4}-\d{2}-\d{2}/.test(t) && /(好|行|可以|确认|那就|ok|yes)/i.test(t)) ||
    (/(明天|后天|下周[一二三四五六日天]|周[一二三四五六日]).{0,12}(下午|上午|\d{1,2}\s*[点:：])/i.test(
      t,
    ) &&
      /(好|行|可以|确认|就|ok|yes)/i.test(t))
  ) {
    return "Appointment Booked";
  }

  if (
    /价格|价钱|费用|收费|多少钱|报价|怎么算|how much|fee|price|cost|availability|有空|档期|预约.*时间|什么时候能约|想预约|约诊|appointment|book.*slot/i.test(
      t,
    )
  ) {
    return "Assessment Interested";
  }

  if (
    /改天再聊|想一下|再联系你|需要跟进|跟进一下|follow up|稍后回复|考虑几天/i.test(t)
  ) {
    return "Follow Up Needed";
  }

  if (/成交|已付|付款完成|签了|谢谢.*安排|converted|paid in full/i.test(t)) {
    return "Converted";
  }

  return null;
}

/**
 * @param {{
 *   userText: string;
 *   previousStage: string;
 *   aiPipelineStage: string | null;
 *   hasAssistantReply: boolean;
 *   casualGreeting: boolean;
 * }} p
 * @returns {string}
 */
function resolvePipelineStage(p) {
  const prev = normalizePipelineStage(p.previousStage) || "New Inquiry";
  let next = prev;

  const rule = inferStageFromRules(p.userText);
  if (rule) next = strongerStage(next, rule);

  const ai = normalizePipelineStage(p.aiPipelineStage);
  if (ai) next = strongerStage(next, ai);

  if (
    p.hasAssistantReply &&
    !p.casualGreeting &&
    (prev === "New Inquiry" || !p.previousStage)
  ) {
    next = strongerStage(next, "Contacted");
  }

  if (!PIPELINE_STAGES.includes(next)) return "New Inquiry";
  return next;
}

module.exports = {
  PIPELINE_STAGES,
  normalizePipelineStage,
  resolvePipelineStage,
  inferStageFromRules,
};
