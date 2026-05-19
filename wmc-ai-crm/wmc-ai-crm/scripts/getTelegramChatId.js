/**
 * Get Telegram Chat ID from the bot's recent updates.
 *
 * Usage:
 *   1. Send any message to your Telegram bot first.
 *   2. Run: node scripts/getTelegramChatId.js
 *   3. Copy the TELEGRAM_CHAT_ID printed in the terminal.
 *   4. Add it to .env: TELEGRAM_CHAT_ID=<value>
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const axios = require("axios");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

if (!TOKEN) {
  console.error("[ERROR] TELEGRAM_BOT_TOKEN is not set in .env");
  process.exit(1);
}

const URL = `https://api.telegram.org/bot${TOKEN}/getUpdates`;

(async () => {
  console.log("──────────────────────────────────────────────────");
  console.log("  WMC AI CRM — Telegram Chat ID Finder");
  console.log("──────────────────────────────────────────────────");
  console.log(`  Bot Token : ${TOKEN.slice(0, 10)}...${TOKEN.slice(-6)}`);
  console.log(`  API URL   : ${URL.replace(TOKEN, "<TOKEN>")}`);
  console.log("──────────────────────────────────────────────────");

  let data;
  try {
    const res = await axios.get(URL, { timeout: 10000 });
    data = res.data;
  } catch (err) {
    const msg = err.response?.data?.description || err.message;
    console.error(`[ERROR] Telegram API call failed: ${msg}`);
    process.exit(1);
  }

  if (!data.ok) {
    console.error("[ERROR] Telegram API returned ok=false:", data.description);
    process.exit(1);
  }

  const updates = data.result || [];

  if (updates.length === 0) {
    console.warn("[WARNING] No updates found.");
    console.warn("  → Send any message to your bot on Telegram first,");
    console.warn("    then run this script again.");
    process.exit(0);
  }

  console.log(`  Found ${updates.length} update(s)\n`);

  // Print all unique senders
  const seen = new Set();
  for (const update of updates) {
    const msg  = update.message || update.channel_post || update.edited_message;
    if (!msg) continue;

    const chatId   = msg.chat?.id;
    const chatType = msg.chat?.type;
    const chatName = msg.chat?.title || msg.chat?.username ||
                     [msg.chat?.first_name, msg.chat?.last_name].filter(Boolean).join(" ");
    const text     = msg.text || msg.caption || "(no text)";
    const date     = new Date(msg.date * 1000).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" });

    if (!chatId || seen.has(chatId)) continue;
    seen.add(chatId);

    console.log(`  Chat Name    : ${chatName}`);
    console.log(`  Chat Type    : ${chatType}`);
    console.log(`  TELEGRAM_CHAT_ID : ${chatId}`);
    console.log(`  Latest Message   : "${text}"`);
    console.log(`  Sent At      : ${date}`);
    console.log("──────────────────────────────────────────────────");
  }

  // Highlight the most recent one (last update)
  const latest = [...updates].reverse().find(
    (u) => u.message || u.channel_post || u.edited_message,
  );
  if (latest) {
    const msg    = latest.message || latest.channel_post || latest.edited_message;
    const chatId = msg?.chat?.id;
    if (chatId) {
      console.log("\n  ✅ Add this to your .env file:");
      console.log(`  TELEGRAM_CHAT_ID=${chatId}`);
      console.log("──────────────────────────────────────────────────");
    }
  }
})();
