/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Marketing Agent                               ║
 * ║                                                              ║
 * ║  Role: Runs daily marketing campaigns, manages the          ║
 * ║  Campaigns sheet, and sends targeted WhatsApp messages      ║
 * ║  based on lead category.                                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Responsibilities:
 *   - Schedule and send daily campaign messages (10 AM MYT)
 *   - Match leads to campaign by category
 *   - Update Campaigns sheet (Sent / Pending / Status)
 *   - Respect opt-out list
 *   - Track open/response rates (future)
 *
 * Campaign categories:
 *   Pain Rehabilitation Lead     → 物理治疗 / 腰痛评估
 *   Psychology / Hypnosis Lead   → 心理辅导 / 临床催眠
 *   Stroke Rehabilitation Lead   → 中风康复计划
 *   Nursing Home Lead            → 疗养院长期护理
 *
 * Current implementation: src/services/campaignScheduler.js
 *
 * TODO:
 *   - A/B test message variants
 *   - Personalise with customer name + last category
 *   - Add send-rate throttling (e.g. max 50 messages/hour)
 *   - Implement opt-out via "stop" / "退出" keyword
 *   - Track response rate and feed back to lead scoring
 */

"use strict";

const AGENT_NAME = "MarketingAgent";

const CAMPAIGNS = {
  "Pain Rehabilitation Lead": {
    name:    "腰痛康复评估",
    message: (name) =>
      `您好${name ? " " + name : ""} 😊 这里是黄氏医疗中心。` +
      `如果您最近仍有腰痛、颈痛或关节痛的困扰，我们提供专业物理治疗评估。` +
      `预约评估：📞 012-4520077 📍 14 Jalan Lapangan Siber 1, Bandar Cyber, Ipoh`,
  },
  "Psychology / Hypnosis Lead": {
    name:    "心理辅导体验",
    message: (name) =>
      `您好${name ? " " + name : ""} 😊 这里是黄氏医疗中心心理部门。` +
      `如果您近期有焦虑、失眠或压力困扰，我们的临床心理师和催眠治疗师可以协助您。` +
      `预约初诊：📞 012-4520077`,
  },
  "Stroke Rehabilitation Lead": {
    name:    "中风康复计划",
    message: (name) =>
      `您好${name ? " " + name : ""} 😊 这里是黄氏医疗中心康复部门。` +
      `我们为中风患者提供全面康复疗程，帮助恢复行动能力。` +
      `预约评估：📞 012-4520077`,
  },
  "Nursing Home Lead": {
    name:    "疗养院长期护理",
    message: (name) =>
      `您好${name ? " " + name : ""} 😊 这里是黄氏医疗中心。` +
      `我们提供专业疗养院及长期护理服务，适合行动不便或需要长期照顾的长者。` +
      `了解详情：📞 012-4520077 📍 14 Jalan Lapangan Siber 1, Bandar Cyber, Ipoh`,
  },
};

/**
 * Get the campaign message for a lead category.
 *
 * @param {string} category
 * @param {string} [name]
 * @returns {{ name: string; message: string } | null}
 */
function getCampaign(category, name) {
  const c = CAMPAIGNS[category];
  if (!c) return null;
  return { name: c.name, message: c.message(name || "") };
}

/**
 * Process a daily campaign run.
 *
 * @param {{ leads: Array<{ phone: string; name: string; category: string }> }} opts
 */
async function runCampaign(opts) {
  const { leads } = opts;
  console.log(`[${AGENT_NAME}] Campaign run — ${leads.length} leads`);

  let sent = 0;
  for (const lead of leads) {
    const campaign = getCampaign(lead.category, lead.name);
    if (!campaign) continue;

    // TODO: Send via notificationLoop.enqueue() or whatsapp.service directly
    // TODO: Update Campaigns sheet Sent count
    console.log(`[${AGENT_NAME}] ⚠️  Stub send to ${lead.phone} — campaign: "${campaign.name}"`);
    sent++;
  }

  console.log(`[${AGENT_NAME}] Campaign complete — ${sent} messages queued`);
  return { sent };
}

module.exports = { runCampaign, getCampaign, CAMPAIGNS, AGENT_NAME };
