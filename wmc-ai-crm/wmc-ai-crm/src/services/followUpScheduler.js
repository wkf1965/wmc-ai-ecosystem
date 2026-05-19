/**
 * 24-Hour Follow Up Scheduler for WMC AI CRM
 *
 * Follow Up Queue tab columns:
 *   A  Created Time
 *   B  Phone
 *   C  Customer Message
 *   D  Category
 *   E  Lead Score
 *   F  Last AI Reply
 *   G  Follow Up Time       (Created Time + 24 h)
 *   H  Follow Up Status     PENDING → SENT
 *   I  Follow Up Message    (fixed template)
 *
 * Scheduler runs every 10 minutes.
 * Sends WhatsApp to every row where:
 *   - Status (col H) = "PENDING"
 *   - Follow Up Time (col G) <= now
 */

const { google } = require("googleapis");
const path       = require("path");
const fs         = require("fs");
const config     = require("../config");
const { sendMessage } = require("./whatsapp.service");

// ── Constants ──────────────────────────────────────────────────────────────

const TAB          = "Follow Up Queue";
const INTERVAL_MS  = 10 * 60 * 1000; // 10 minutes
const FOLLOW_UP_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours

const HEADERS = [
  "Created Time",
  "Phone",
  "Customer Message",
  "Category",
  "Lead Score",
  "Last AI Reply",
  "Follow Up Time",
  "Follow Up Status",
  "Follow Up Message",
];

// Column indices (0-based)
const COL = {
  createdTime:     0,
  phone:           1,
  customerMessage: 2,
  category:        3,
  leadScore:       4,
  lastAiReply:     5,
  followUpTime:    6,
  followUpStatus:  7,
  followUpMessage: 8,
};

const FOLLOW_UP_MESSAGE = `您好 😊
这里是 Wong Medical Centre。
昨天您有咨询我们的服务，请问您目前的情况有没有好一些？
如果您愿意，我们可以帮您安排进一步了解或预约评估。

📍 14 Jalan Lapangan Siber 1, Bandar Cyber, 31350 Ipoh, Perak
📞 WhatsApp: 012-4520077`;

let tabEnsured = false;

// ── Auth ───────────────────────────────────────────────────────────────────

function createSheetsClient() {
  const keyFile = path.resolve(config.google.credentials);
  if (!fs.existsSync(keyFile)) {
    throw new Error(`[FOLLOWUP] Credentials not found: ${keyFile}`);
  }
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function esc(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

// ── Tab bootstrap ──────────────────────────────────────────────────────────

async function ensureTab(sheets) {
  if (tabEnsured) return;

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.google.sheetId,
    fields: "sheets.properties.title",
  });
  const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title);

  if (!titles.includes(TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
    console.log(`[FOLLOWUP] ✅ Tab "${TAB}" created`);
  }

  // Write/overwrite header if A1 is not "Created Time"
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range: `${esc(TAB)}!A1`,
  });
  const a1 = check.data.values?.[0]?.[0] ?? "";
  if (a1 !== "Created Time") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.sheetId,
      range: `${esc(TAB)}!A1:I1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [HEADERS] },
    });
    console.log(`[FOLLOWUP] ✅ Header row written to "${TAB}"`);
  }

  tabEnsured = true;
}

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Upserts a follow-up queue row for a phone number.
 *
 * Rules:
 *  - If phone already has a PENDING row → update it (reset Follow Up Time to +24h from now).
 *  - If phone has no PENDING row (SENT/CANCELLED or brand new) → append a fresh row.
 *
 * @param {{
 *   phone:      string;
 *   message:    string;
 *   category:   string;
 *   leadScore:  number;
 *   reply:      string;
 *   timestamp?: string;
 * }} data
 */
async function appendToFollowUpQueue({ phone, message, category, leadScore, reply, timestamp }) {
  if (!config.google.sheetId) return;

  const sheets = createSheetsClient();
  await ensureTab(sheets);

  const now          = timestamp || new Date().toISOString();
  const followUpTime = new Date(new Date(now).getTime() + FOLLOW_UP_DELAY_MS).toISOString();
  const cleanPhone   = String(phone || "").replace(/\s/g, "");

  // Look for existing PENDING row for this phone
  let existingPendingRow = null;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetId,
      range: `${esc(TAB)}!A2:I5000`,
      majorDimension: "ROWS",
    });
    const rows = res.data.values ?? [];
    for (let i = 0; i < rows.length; i++) {
      const rowPhone = String(rows[i][COL.phone] ?? "").replace(/\s/g, "");
      const status   = String(rows[i][COL.followUpStatus] ?? "").trim().toUpperCase();
      if (rowPhone === cleanPhone && status === "PENDING") {
        existingPendingRow = i + 2; // 1-based sheet row
        break;
      }
    }
  } catch (e) {
    console.warn(`[FOLLOWUP] Could not read queue rows:`, e.message);
  }

  const row = [
    now,
    String(phone     || ""),
    String(message   || ""),
    String(category  || ""),
    String(leadScore ?? ""),
    String(reply     || ""),
    followUpTime,
    "PENDING",
    FOLLOW_UP_MESSAGE,
  ];

  if (existingPendingRow) {
    // UPDATE existing PENDING row — reset timer + update message/category
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.sheetId,
      range: `${esc(TAB)}!A${existingPendingRow}:I${existingPendingRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { majorDimension: "ROWS", values: [row] },
    });
    console.log(`[FOLLOWUP] ✅ Updated PENDING row ${existingPendingRow} for ${phone} → followUp at ${followUpTime}`);
  } else {
    // APPEND new row
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.sheetId,
      range: `${esc(TAB)}!A:I`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { majorDimension: "ROWS", values: [row] },
    });
    console.log(`[FOLLOWUP] ✅ New follow-up row for ${phone} → followUp at ${followUpTime}`);
  }
}

// ── Cancel follow-ups (on appointment confirmed) ───────────────────────────

/**
 * Marks all PENDING follow-up rows for a phone as CANCELLED.
 * Called when a customer confirms an appointment — stops unnecessary follow-ups.
 *
 * @param {string} phone
 */
async function cancelFollowUpsForPhone(phone) {
  if (!config.google.sheetId || !phone) return;

  let sheets;
  try {
    sheets = createSheetsClient();
    await ensureTab(sheets);
  } catch (e) {
    console.error(`[FOLLOWUP] cancelFollowUps auth error:`, e.message);
    return;
  }

  let rows;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetId,
      range: `${esc(TAB)}!A2:I5000`,
      majorDimension: "ROWS",
    });
    rows = res.data.values ?? [];
  } catch (e) {
    console.error(`[FOLLOWUP] cancelFollowUps read error:`, e.message);
    return;
  }

  const cleanPhone = String(phone).replace(/\D/g, "");
  let cancelled = 0;

  for (let i = 0; i < rows.length; i++) {
    const row        = rows[i];
    const rowPhone   = String(row[COL.phone]          ?? "").replace(/\D/g, "");
    const status     = String(row[COL.followUpStatus] ?? "").trim().toUpperCase();

    if (rowPhone !== cleanPhone) continue;
    if (status !== "PENDING")   continue;

    const sheetRow = i + 2;
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.google.sheetId,
        range: `${esc(TAB)}!H${sheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [["CANCELLED"]] },
      });
      cancelled++;
    } catch (e) {
      console.error(`[FOLLOWUP] Failed to cancel row ${sheetRow}:`, e.message);
    }
  }

  if (cancelled > 0) {
    console.log(`[FOLLOWUP] ✅ Cancelled ${cancelled} follow-up(s) for ${phone} (appointment confirmed)`);
  }
}

// ── Read + send ────────────────────────────────────────────────────────────

async function checkAndSendFollowUps() {
  if (!config.google.sheetId) return;

  console.log("[FOLLOWUP] Checking Follow Up Queue…");

  let sheets;
  try {
    sheets = createSheetsClient();
    await ensureTab(sheets);
  } catch (e) {
    console.error("[FOLLOWUP] Auth error:", e.message);
    return;
  }

  // Read all rows (skip header row 1)
  let rows;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetId,
      range: `${esc(TAB)}!A2:I5000`,
      majorDimension: "ROWS",
    });
    rows = res.data.values ?? [];
  } catch (e) {
    console.error("[FOLLOWUP] Read error:", e.message);
    return;
  }

  const now = Date.now();
  let sent = 0;

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i];
    const status = String(row[COL.followUpStatus] ?? "").trim().toUpperCase();
    const phone  = String(row[COL.phone]          ?? "").trim();
    const fupRaw = String(row[COL.followUpTime]   ?? "").trim();
    const msgOut = String(row[COL.followUpMessage] ?? FOLLOW_UP_MESSAGE).trim();

    if (status !== "PENDING") continue; // also skips SENT and CANCELLED
    if (!phone)               continue;

    const fupTime = fupRaw ? new Date(fupRaw).getTime() : NaN;
    if (isNaN(fupTime) || fupTime > now) continue;

    // Due — send WhatsApp
    console.log(`[FOLLOWUP] Sending to ${phone} (row ${i + 2})…`);
    try {
      await sendMessage(phone, msgOut);
      console.log(`[FOLLOWUP] ✅ Sent to ${phone}`);
    } catch (e) {
      console.error(`[FOLLOWUP] ❌ WhatsApp send failed for ${phone}:`, e.message);
      continue; // don't mark SENT if delivery failed
    }

    // Mark SENT in col H (1-based sheet row = i + 2)
    try {
      const sheetRow = i + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.google.sheetId,
        range: `${esc(TAB)}!H${sheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [["SENT"]] },
      });
      console.log(`[FOLLOWUP] ✅ Status updated to SENT for row ${sheetRow}`);
    } catch (e) {
      console.error(`[FOLLOWUP] ❌ Failed to update status for row ${i + 2}:`, e.message);
    }

    sent++;
  }

  if (sent === 0) {
    console.log("[FOLLOWUP] No follow-ups due at this time.");
  } else {
    console.log(`[FOLLOWUP] ✅ ${sent} follow-up(s) sent.`);
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────

/**
 * Starts the follow-up scheduler.
 * Runs immediately on start, then every 10 minutes.
 * Safe to call once from server.js.
 */
function startFollowUpScheduler() {
  console.log(`[FOLLOWUP] Scheduler started — checking every ${INTERVAL_MS / 60000} minutes`);

  // First run after 1 minute (let server finish booting)
  setTimeout(() => {
    checkAndSendFollowUps().catch((e) =>
      console.error("[FOLLOWUP] Scheduler error:", e.message),
    );
  }, 60_000);

  // Recurring check every 10 minutes
  setInterval(() => {
    checkAndSendFollowUps().catch((e) =>
      console.error("[FOLLOWUP] Scheduler error:", e.message),
    );
  }, INTERVAL_MS);
}

module.exports = { startFollowUpScheduler, appendToFollowUpQueue, cancelFollowUpsForPhone, checkAndSendFollowUps };
