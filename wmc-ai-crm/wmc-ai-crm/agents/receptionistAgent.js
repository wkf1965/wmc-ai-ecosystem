/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Receptionist Agent                            ║
 * ║                                                              ║
 * ║  Role: First point of contact for all inbound WhatsApp      ║
 * ║  messages. Greets patients, collects initial information,   ║
 * ║  and routes to the appropriate specialist agent.            ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Responsibilities:
 *   - Respond to greetings and general inquiries
 *   - Triage intent: pain / psychology / TCM / nursing home / appointment
 *   - Collect name and phone if not already known
 *   - Hand off to specialist agent when category is clear
 *   - Manage appointment booking flow
 *   - Always maintain warm, professional tone (BM/CN/EN)
 *
 * Current implementation:  src/services/ai.service.js + webhook.js
 * This agent will eventually replace the monolithic AI call with
 * a multi-agent routing architecture.
 *
 * TODO:
 *   - Define agent state machine (greeting → triage → collect → route)
 *   - Implement handoff protocol to crmAgent / marketingAgent
 *   - Support multi-language detection (Malay / Chinese / English)
 *   - Add intake form flow for new patients
 */

"use strict";

const AGENT_NAME = "ReceptionistAgent";

const GREETING_KEYWORDS = ["你好", "hi", "hello", "hai", "halo", "apa khabar", "selamat"];

const ROUTE_MAP = {
  "Pain Rehabilitation":          "CRMAgent",
  "Psychology / Hypnosis Lead":   "CRMAgent",
  "Stroke Rehabilitation Lead":   "CRMAgent",
  "Nursing Home Lead":            "CRMAgent",
  "Appointment Confirmed":        "CRMAgent",
  "General Inquiry":              "ReceptionistAgent", // stays with receptionist
};

/**
 * Determine if this agent should handle the message or hand off.
 *
 * @param {{ category: string; leadStatus: string }} ctx
 * @returns {{ handle: boolean; routeTo?: string }}
 */
function triage(ctx) {
  const target = ROUTE_MAP[ctx.category] || "CRMAgent";
  if (target === AGENT_NAME) return { handle: true };
  return { handle: false, routeTo: target };
}

/**
 * Generate a receptionist-style greeting response.
 *
 * @param {{ name?: string; isReturning: boolean }} ctx
 * @returns {string}
 */
function greet(ctx) {
  // TODO: This will eventually call DeepSeek with a receptionist-specific system prompt
  if (ctx.isReturning && ctx.name) {
    return `欢迎回来，${ctx.name}！😊 很高兴再次联系到您。请问这次有什么可以帮到您？`;
  }
  return `您好！欢迎来到黄氏医疗中心 🏥\n我们提供心理辅导、物理治疗、中医、中风康复及疗养院服务。\n请问您今天需要什么协助？`;
}

/**
 * Main entry point — process one inbound message.
 *
 * @param {{
 *   phone:      string;
 *   message:    string;
 *   category:   string;
 *   leadStatus: string;
 *   memory:     object | null;
 * }} input
 */
async function process(input) {
  const { phone, message, category, memory } = input;

  const routing = triage({ category, leadStatus: input.leadStatus });

  if (!routing.handle) {
    console.log(`[${AGENT_NAME}] Routing ${phone} → ${routing.routeTo}`);
    return { handoff: routing.routeTo };
  }

  // TODO: Call AI with receptionist system prompt
  console.log(`[${AGENT_NAME}] ⚠️  Stub handling for ${phone} | category: ${category}`);

  return {
    handoff:  null,
    response: greet({ name: memory?.name, isReturning: !!memory }),
  };
}

module.exports = { process, triage, greet, AGENT_NAME, ROUTE_MAP };
