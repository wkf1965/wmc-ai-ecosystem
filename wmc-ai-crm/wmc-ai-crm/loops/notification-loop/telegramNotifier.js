/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Telegram Notifier                                        ║
 * ║                                                                          ║
 * ║  Sends admin alert messages to a Telegram chat via Bot API.            ║
 * ║                                                                          ║
 * ║  .env variables required:                                               ║
 * ║    TELEGRAM_BOT_TOKEN  — from @BotFather                               ║
 * ║    TELEGRAM_CHAT_ID    — run scripts/getTelegramChatId.js to find it   ║
 * ║                                                                          ║
 * ║  Exported functions:                                                    ║
 * ║    sendTelegramMessage(message)    — raw text / HTML message            ║
 * ║    sendLeadAlert(data)             — hot lead notification              ║
 * ║    sendErrorAlert(data)            — system / loop error notification   ║
 * ║    sendAppointmentAlert(data)      — appointment confirmed / missed     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const axios = require("axios");

const TOKEN   = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID   || "";

if (!TOKEN) console.warn("[TELEGRAM] TELEGRAM_BOT_TOKEN not set in .env");
if (!CHAT_ID) console.warn("[TELEGRAM] TELEGRAM_CHAT_ID not set in .env");

const API_URL = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : "";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mytTime() {
  return new Date().toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

// ── Core send function ────────────────────────────────────────────────────────

/**
 * Send a plain-text or HTML-formatted message to the admin Telegram chat.
 *
 * @param {string} message  — supports HTML tags: <b>, <i>, <code>, <pre>
 * @returns {Promise<boolean>}  true on success, false on failure
 */
async function sendTelegramMessage(message) {
  if (!TOKEN || !CHAT_ID) {
    console.warn("[TELEGRAM] Cannot send — TOKEN or CHAT_ID missing");
    return false;
  }

  try {
    await axios.post(
      `${API_URL}/sendMessage`,
      {
        chat_id:    CHAT_ID,
        text:       message,
        parse_mode: "HTML",
      },
      { timeout: 10000 },
    );
    console.log(`[TELEGRAM] ✅ Sent: ${message.replace(/<[^>]+>/g, "").slice(0, 80)}…`);
    return true;
  } catch (err) {
    const detail = err.response?.data?.description || err.message;
    console.error(`[TELEGRAM] ❌ Send failed: ${detail}`);
    return false;
  }
}

// ── Alert functions ───────────────────────────────────────────────────────────

/**
 * Send a Hot Lead alert to admin.
 *
 * @param {{ name?: string; phone?: string; category?: string; leadStatus?: string; stage?: string }} data
 */
async function sendLeadAlert({ name, phone, category, leadStatus, stage } = {}) {
  const msg = [
    `🔥 <b>HOT LEAD ALERT — WMC AI CRM</b>`,
    ``,
    `👤 Customer  : ${name     || "Unknown"}`,
    `📞 Phone     : ${phone    || "—"}`,
    `🏥 Service   : ${category || "—"}`,
    `🎯 Status    : ${leadStatus || "—"}`,
    `📊 Stage     : ${stage    || "—"}`,
    `🕐 Time (MYT): ${mytTime()}`,
  ].join("\n");

  return sendTelegramMessage(msg);
}

/**
 * Send a system or loop error alert to admin.
 *
 * @param {{ loopName?: string; error?: string; details?: string }} data
 */
async function sendErrorAlert({ loopName, error, details } = {}) {
  const msg = [
    `🚨 <b>SYSTEM ERROR — WMC AI CRM</b>`,
    ``,
    `⚙️ Loop      : ${loopName || "Unknown"}`,
    `❌ Error     : ${error    || "Unknown error"}`,
    details ? `📋 Details   : ${details}` : null,
    `🕐 Time (MYT): ${mytTime()}`,
  ].filter(Boolean).join("\n");

  return sendTelegramMessage(msg);
}

/**
 * Send an appointment alert to admin (confirmed or missed).
 *
 * @param {{ name?: string; phone?: string; date?: string; service?: string; status?: string }} data
 */
async function sendAppointmentAlert({ name, phone, date, service, status } = {}) {
  const isMissed   = String(status || "").toLowerCase().includes("miss");
  const isConfirmed = String(status || "").toLowerCase().includes("confirm");
  const emoji = isMissed ? "⚠️" : isConfirmed ? "✅" : "📅";

  const msg = [
    `${emoji} <b>APPOINTMENT ALERT — WMC AI CRM</b>`,
    ``,
    `👤 Customer  : ${name    || "Unknown"}`,
    `📞 Phone     : ${phone   || "—"}`,
    `📅 Date      : ${date    || "—"}`,
    `🏥 Service   : ${service || "—"}`,
    `📋 Status    : ${status  || "—"}`,
    `🕐 Time (MYT): ${mytTime()}`,
  ].join("\n");

  return sendTelegramMessage(msg);
}

module.exports = {
  sendTelegramMessage,
  sendLeadAlert,
  sendErrorAlert,
  sendAppointmentAlert,
};
