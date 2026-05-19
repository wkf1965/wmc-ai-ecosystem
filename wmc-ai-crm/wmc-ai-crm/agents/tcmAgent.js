/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — TCM (Traditional Chinese Medicine) Agent      ║
 * ║                                                              ║
 * ║  Role: Specialist agent for Traditional Chinese Medicine    ║
 * ║  inquiries. Provides detailed guidance on TCM services,     ║
 * ║  acupuncture, herbal prescriptions, and related treatments. ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Services covered:
 *   🌿 中医调理 — General TCM wellness
 *   💉 针灸     — Acupuncture (pain, paralysis, fertility)
 *   🌱 中药     — Herbal medicine prescription
 *   🔥 拔罐     — Cupping therapy
 *   💆 推拿     — Tui Na massage
 *
 * Common conditions handled:
 *   - 腰背痛 / 颈痛 / 关节痛 (musculoskeletal)
 *   - 失眠 / 焦虑 (sleep / anxiety via acupuncture)
 *   - 中风后遗症 (post-stroke via acupuncture)
 *   - 慢性病调理 (chronic disease management)
 *   - 月经不调 / 妇科 (women's health)
 *
 * TODO:
 *   - Create TCM-specific system prompt for DeepSeek
 *   - Add herb / acupuncture point knowledge base (knowledge-base/)
 *   - Integrate with appointment booking for TCM consultations
 *   - Add session tracking for ongoing herbal prescriptions
 */

"use strict";

const AGENT_NAME = "TCMAgent";

const TCM_SERVICES = [
  { id: "acupuncture",   name: "针灸",     keywords: ["针灸", "acupuncture", "穴位"] },
  { id: "herbal",        name: "中药",     keywords: ["中药", "草药", "herbal", "煎药"] },
  { id: "tuina",         name: "推拿",     keywords: ["推拿", "按摩", "tui na", "massage"] },
  { id: "cupping",       name: "拔罐",     keywords: ["拔罐", "cupping"] },
  { id: "general_tcm",   name: "中医调理", keywords: ["中医", "调理", "tcm", "traditional"] },
];

const TCM_KEYWORDS = TCM_SERVICES.flatMap((s) => s.keywords);

/**
 * Detect if a message is TCM-related.
 *
 * @param {string} message
 * @returns {boolean}
 */
function isTCMMessage(message) {
  const lower = (message || "").toLowerCase();
  return TCM_KEYWORDS.some((kw) =>
    /[^\u0000-\u007f]/.test(kw) ? message.includes(kw) : lower.includes(kw),
  );
}

/**
 * Identify the specific TCM service being asked about.
 *
 * @param {string} message
 * @returns {{ id: string; name: string } | null}
 */
function identifyService(message) {
  const lower = (message || "").toLowerCase();
  for (const svc of TCM_SERVICES) {
    const matched = svc.keywords.some((kw) =>
      /[^\u0000-\u007f]/.test(kw) ? message.includes(kw) : lower.includes(kw),
    );
    if (matched) return { id: svc.id, name: svc.name };
  }
  return null;
}

/**
 * Generate a TCM-specific response.
 *
 * @param {{ message: string; name?: string }} input
 * @returns {string}
 */
function respond(input) {
  const service = identifyService(input.message);
  const greeting = input.name ? `${input.name}您好` : "您好";

  // TODO: Replace with DeepSeek call using TCM specialist system prompt
  if (service) {
    return `${greeting} 😊 您询问的是我们的${service.name}服务。` +
      `我们的中医师会根据您的情况进行评估，为您制定合适的调理方案。` +
      `请问您主要希望解决什么健康问题呢？\n📞 如需预约：012-4520077`;
  }

  return `${greeting} 😊 我们提供中医调理、针灸、中药和推拿服务。` +
    `请问您目前有哪方面的健康需求？我们的中医师会为您提供专业建议。\n📞 012-4520077`;
}

/**
 * Main entry point.
 *
 * @param {{ phone: string; message: string; name?: string }} input
 */
async function process(input) {
  if (!isTCMMessage(input.message)) {
    return { handle: false };
  }

  console.log(`[${AGENT_NAME}] Handling TCM inquiry for ${input.phone}`);

  return {
    handle:   true,
    response: respond(input),
    service:  identifyService(input.message),
  };
}

module.exports = { process, isTCMMessage, identifyService, respond, TCM_SERVICES, AGENT_NAME };
