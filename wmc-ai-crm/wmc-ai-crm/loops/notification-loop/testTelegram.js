/**
 * Telegram connection test for WMC AI CRM.
 *
 * Run:
 *   node loops/notification-loop/testTelegram.js
 *
 * Sends a test message to the admin Telegram chat confirming
 * the bot is connected and notifications are active.
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const { sendTelegramMessage, sendLeadAlert, sendErrorAlert, sendAppointmentAlert } = require("./telegramNotifier");

const TOKEN   = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID   || "";

(async () => {
  console.log("══════════════════════════════════════════════════════");
  console.log("  WMC AI CRM — Telegram Notification Test");
  console.log("══════════════════════════════════════════════════════");
  console.log(`  Bot Token : ${TOKEN  ? TOKEN.slice(0, 10)  + "..." : "❌ NOT SET"}`);
  console.log(`  Chat ID   : ${CHAT_ID || "❌ NOT SET"}`);
  console.log("══════════════════════════════════════════════════════");

  if (!TOKEN || !CHAT_ID) {
    console.error("\n[ERROR] Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env");
    console.error("  Run: node scripts/getTelegramChatId.js  to find your Chat ID");
    process.exit(1);
  }

  // ── Test 1: Main activation message ──────────────────────────────────────
  console.log("\n[TEST 1] Sending activation message...");
  const now = new Date().toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });

  const activationMsg = [
    `✅ <b>WMC AI CRM Telegram Notification Active</b>`,
    ``,
    `🏥 Centre    : Wong Medical Centre, Ipoh`,
    `🤖 System    : All loops running`,
    `🕐 Time (MYT): ${now}`,
    ``,
    `<b>Notification types enabled:</b>`,
    `🔥 Hot Lead alerts`,
    `📅 Appointment alerts (Confirmed / Missed)`,
    `🚨 System error alerts`,
    `❌ Follow-up failure alerts`,
    ``,
    `<i>This message confirms your Telegram bot is connected to WMC AI CRM.</i>`,
  ].join("\n");

  const ok1 = await sendTelegramMessage(activationMsg);
  console.log(ok1 ? "  ✅ Activation message sent!" : "  ❌ Failed");

  // ── Test 2: Lead alert sample ─────────────────────────────────────────────
  console.log("\n[TEST 2] Sending sample Lead Alert...");
  const ok2 = await sendLeadAlert({
    name:       "Sample Customer",
    phone:      "601X-XXX-XXXX",
    category:   "Pain Rehabilitation Lead",
    leadStatus: "Hot Lead",
    stage:      "Appointment Booked",
  });
  console.log(ok2 ? "  ✅ Lead alert sent!" : "  ❌ Failed");

  // ── Test 3: Appointment alert sample ─────────────────────────────────────
  console.log("\n[TEST 3] Sending sample Appointment Alert...");
  const ok3 = await sendAppointmentAlert({
    name:    "Sample Customer",
    phone:   "601X-XXX-XXXX",
    date:    "2026-05-17 10:00",
    service: "Physiotherapy",
    status:  "Appointment Confirmed",
  });
  console.log(ok3 ? "  ✅ Appointment alert sent!" : "  ❌ Failed");

  // ── Summary ───────────────────────────────────────────────────────────────
  const allPassed = ok1 && ok2 && ok3;
  console.log("\n══════════════════════════════════════════════════════");
  if (allPassed) {
    console.log("  ✅ All tests passed! Check your Telegram.");
  } else {
    console.log("  ⚠️  Some tests failed — check errors above.");
  }
  console.log("══════════════════════════════════════════════════════");

  process.exit(allPassed ? 0 : 1);
})();
