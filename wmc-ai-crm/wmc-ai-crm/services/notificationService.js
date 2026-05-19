/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Notification Service                                     ║
 * ║                                                                          ║
 * ║  Runs every 2 minutes. Scans CRM data for 5 alert conditions and       ║
 * ║  writes admin notifications to the console + NotificationLog sheet.    ║
 * ║                                                                          ║
 * ║  Event detectors:                                                        ║
 * ║    1. Hot Lead           — Pipeline LeadType = "Hot Lead"               ║
 * ║    2. Appointment Confirmed — Appointments Status contains "Confirmed"  ║
 * ║    3. Missed Appointment — Appointments Status contains "Missed"        ║
 * ║    4. System Error       — Health Check Loop reported Critical status   ║
 * ║    5. Follow-up Failed   — Follow-up Loop last cycle had errors         ║
 * ║                                                                          ║
 * ║  Duplicate prevention:                                                  ║
 * ║    • In-memory Set of notification keys, seeded from NotificationLog   ║
 * ║      sheet on first run (survives server restarts)                      ║
 * ║    • Hot Lead:          HOT_LEAD|{phone}            — once per phone    ║
 * ║    • Appt Confirmed:   APPT_CONFIRMED|{phone}|{date} — per appointment ║
 * ║    • Missed Appt:      MISSED_APPT|{phone}|{today}  — once per day     ║
 * ║    • System Error:     SYSTEM_ERROR|{YYYY-MM-DD-HH} — once per hour    ║
 * ║    • Follow-up Failed: FU_LOOP_ERROR|{today}         — once per day    ║
 * ║                                                                          ║
 * ║  NotificationLog tab columns (A–H):                                     ║
 * ║    A  Timestamp   B  EventType   C  Phone   D  CustomerName            ║
 * ║    E  Details     F  Status      G  Channel  H  NotifKey (dedup key)   ║
 * ║                                                                          ║
 * ║  WhatsApp: Code is wired but disabled. Set WA_SEND_ENABLED=true in     ║
 * ║  .env to activate when ready.                                           ║
 * ║                                                                          ║
 * ║  POLICY: Never writes to Pipeline, Memory, Appointments, FollowUpQueue ║
 * ║           Only writes to: NotificationLog tab + console + log file     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();

const fs   = require("fs");
const path = require("path");
const { google } = require("googleapis");

const {
  parseSpreadsheetId,
  resolveAccessibleSpreadsheetId,
  resolveKeyFile,
  sheetsConfigured,
  toSheetUtf8String,
} = require("../sheetsAppend");

const systemHealth = require("../health/systemHealth");

// ── Config ────────────────────────────────────────────────────────────────────

const RAW_SHEET_ID     = process.env.GOOGLE_SHEET_ID || "";
const CREDS_PATH       = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./google-credentials.json";
const PIPELINE_TAB     = String(process.env.GOOGLE_SHEET_PIPELINE_TAB    || "Pipeline").trim();
const APPOINTMENTS_TAB = String(process.env.GOOGLE_SHEET_APPOINTMENTS_TAB || "Appointments").trim();
const FUQ_TAB          = "Follow Up Queue";
const NOTIF_LOG_TAB    = "NotificationLog";

// WhatsApp admin notifications — wired but disabled until explicitly enabled
const WA_SEND_ENABLED  = String(process.env.ADMIN_WA_NOTIFICATIONS || "false").toLowerCase() === "true";
const ADMIN_WA_NUMBER  = process.env.ADMIN_WHATSAPP_NUMBER || "";

// ── Log file ──────────────────────────────────────────────────────────────────

const LOG_FILE = path.join(__dirname, "../logs/notificationLoop.log");

// ── NotificationLog sheet schema ──────────────────────────────────────────────

const NOTIF_HEADERS = [
  "Timestamp",    // A
  "EventType",    // B
  "Phone",        // C
  "CustomerName", // D
  "Details",      // E
  "Status",       // F
  "Channel",      // G
  "NotifKey",     // H  ← dedup key (unique per notification type+target)
];

// ── Event type constants ──────────────────────────────────────────────────────

const EVENT = {
  HOT_LEAD:       "Hot Lead",
  APPT_CONFIRMED: "Appointment Confirmed",
  MISSED_APPT:    "Missed Appointment",
  SYSTEM_ERROR:   "System Error",
  FU_FAILED:      "Follow-up Failed",
};

// ── Dedup state (in-memory, seeded from sheet on first run) ───────────────────

/** @type {Set<string>} */
const _notifiedKeys = new Set();
let _initialized    = false;

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().slice(0, 10);          // "2026-05-16"
}

function hourKey() {
  return new Date().toISOString().slice(0, 13).replace("T", "-"); // "2026-05-16-14"
}

// ── Auth / sheet client ───────────────────────────────────────────────────────

async function getSheetsClient() {
  if (!sheetsConfigured()) return null;
  const parsedId = parseSpreadsheetId(RAW_SHEET_ID);
  if (!parsedId) return null;
  const keyFile = resolveKeyFile();
  if (!keyFile || !fs.existsSync(keyFile)) return null;

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = await resolveAccessibleSpreadsheetId(sheets, parsedId);
  return { sheets, spreadsheetId };
}

function esc(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

function cell(row, idx) {
  return String(row?.[idx] ?? "").trim();
}

// ── Ensure NotificationLog tab exists ────────────────────────────────────────

async function ensureNotifTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const exists = (meta.data.sheets ?? []).some(
    (s) => s.properties?.title === NOTIF_LOG_TAB,
  );
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: NOTIF_LOG_TAB } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            `${esc(NOTIF_LOG_TAB)}!A1:H1`,
      valueInputOption: "USER_ENTERED",
      requestBody:      { majorDimension: "ROWS", values: [NOTIF_HEADERS] },
    });
    console.log(`[NotificationService] Created "${NOTIF_LOG_TAB}" tab in Google Sheet`);
  }
}

// ── Seed dedup Set from NotificationLog sheet (called once on first run) ──────

async function seedNotifiedKeys(sheets, spreadsheetId) {
  if (_initialized) return;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range:          `${esc(NOTIF_LOG_TAB)}!H2:H5000`,
      majorDimension: "ROWS",
    });
    for (const row of res.data.values ?? []) {
      const key = String(row[0] ?? "").trim();
      if (key) _notifiedKeys.add(key);
    }
    console.log(`[NotificationService] Loaded ${_notifiedKeys.size} existing notification key(s) from sheet`);
  } catch {
    /* tab may not exist yet — safe to skip */
  }
  _initialized = true;
}

// ── Read tab helper ───────────────────────────────────────────────────────────

async function readTab(sheets, spreadsheetId, tab, range) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range:          `${esc(tab)}!${range}`,
      majorDimension: "ROWS",
    });
    return res.data.values || [];
  } catch {
    return [];
  }
}

// ── Log helpers ───────────────────────────────────────────────────────────────

function appendLog(entry) {
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch { /* non-fatal */ }
}

const EVENT_EMOJI = {
  [EVENT.HOT_LEAD]:       "🔥",
  [EVENT.APPT_CONFIRMED]: "✅",
  [EVENT.MISSED_APPT]:    "⚠️",
  [EVENT.SYSTEM_ERROR]:   "🚨",
  [EVENT.FU_FAILED]:      "❌",
};

function consoleLog(notif) {
  const emoji = EVENT_EMOJI[notif.eventType] || "📣";
  const name  = notif.customerName ? ` — ${notif.customerName}` : "";
  const phone = notif.phone        ? ` (${notif.phone})`        : "";
  console.log(`[NOTIFICATION] ${emoji} ${notif.eventType}${name}${phone}`);
  if (notif.details) {
    console.log(`[NOTIFICATION]    ↳ ${notif.details}`);
  }
}

// ── WhatsApp send (wired but disabled) ───────────────────────────────────────

async function sendWhatsApp(notif) {
  if (!WA_SEND_ENABLED) return;
  if (!ADMIN_WA_NUMBER) {
    console.warn("[NotificationService] ADMIN_WHATSAPP_NUMBER not set — WhatsApp skipped");
    return;
  }
  try {
    const { sendMessage } = require("../src/services/whatsapp.service");
    const emoji = EVENT_EMOJI[notif.eventType] || "📣";
    const msg   = [
      `${emoji} *WMC AI CRM Alert*`,
      `Type: ${notif.eventType}`,
      notif.customerName ? `Customer: ${notif.customerName}` : null,
      notif.phone        ? `Phone: ${notif.phone}`           : null,
      notif.details      ? `Details: ${notif.details}`       : null,
      `Time: ${new Date().toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}`,
    ].filter(Boolean).join("\n");
    await sendMessage(ADMIN_WA_NUMBER, msg);
    console.log(`[NotificationService] WhatsApp alert sent to admin (${ADMIN_WA_NUMBER})`);
  } catch (err) {
    console.warn("[NotificationService] WhatsApp send error:", err.message);
  }
}

// ── Append one row to NotificationLog ────────────────────────────────────────

async function logToSheet(sheets, spreadsheetId, notif) {
  const row = [
    toSheetUtf8String(new Date().toISOString()),
    toSheetUtf8String(notif.eventType),
    toSheetUtf8String(notif.phone        || ""),
    toSheetUtf8String(notif.customerName || ""),
    toSheetUtf8String(notif.details      || ""),
    toSheetUtf8String("logged"),
    toSheetUtf8String(WA_SEND_ENABLED && ADMIN_WA_NUMBER ? "console+sheet+whatsapp" : "console+sheet"),
    toSheetUtf8String(notif.key),
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range:            `${esc(NOTIF_LOG_TAB)}!A:H`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody:      { majorDimension: "ROWS", values: [row] },
  });
}

// ── Dispatch a notification ───────────────────────────────────────────────────

/**
 * Log a notification to console + sheet and (optionally) send WhatsApp.
 * Adds key to dedup set before returning.
 */
async function dispatch(sheets, spreadsheetId, notif) {
  // Console log
  consoleLog(notif);

  // Sheet log
  try {
    await logToSheet(sheets, spreadsheetId, notif);
  } catch (err) {
    console.warn(`[NotificationService] Sheet log failed for "${notif.key}": ${err.message}`);
  }

  // WhatsApp (disabled by default)
  await sendWhatsApp(notif);

  // File log
  appendLog({
    time:         new Date().toISOString(),
    eventType:    notif.eventType,
    phone:        notif.phone || "",
    customerName: notif.customerName || "",
    details:      notif.details || "",
    key:          notif.key,
  });

  // Mark as notified
  _notifiedKeys.add(notif.key);
}

// ── EVENT DETECTOR 1: Hot Lead ────────────────────────────────────────────────
// Pipeline cols: Name(0) Phone(1) Category(2) LeadType(3) PipelineStage(4) ... Status(7) UpdatedAt(8)

function detectHotLeads(pipelineRows) {
  const events = [];
  for (const row of pipelineRows) {
    const leadType = cell(row, 3).toLowerCase();
    if (!leadType.includes("hot")) continue;

    const phone = cell(row, 1);
    if (!phone) continue;

    const key = `HOT_LEAD|${phone}`;
    if (_notifiedKeys.has(key)) continue;

    events.push({
      key,
      eventType:    EVENT.HOT_LEAD,
      phone,
      customerName: cell(row, 0),
      details:      `Service: ${cell(row, 2)} | Stage: ${cell(row, 4)} | Updated: ${cell(row, 8)}`,
    });
  }
  return events;
}

// ── EVENT DETECTOR 2: Appointment Confirmed ───────────────────────────────────
// Appointments cols: Timestamp(0) Name(1) Phone(2) Category(3) SlotRequested(4)
//                    ParsedStart(5) ParsedEnd(6) Status(7) CalendarEventId(8)

function detectAppointmentsConfirmed(apptRows) {
  const events = [];
  for (const row of apptRows) {
    const status = cell(row, 7).toLowerCase();
    if (!status.includes("confirm")) continue;

    const phone = cell(row, 2);
    if (!phone) continue;

    // Use appointment date as part of key (so re-scheduling creates a new notif)
    const apptDate = cell(row, 5).slice(0, 10) || cell(row, 0).slice(0, 10);
    const key = `APPT_CONFIRMED|${phone}|${apptDate}`;
    if (_notifiedKeys.has(key)) continue;

    events.push({
      key,
      eventType:    EVENT.APPT_CONFIRMED,
      phone,
      customerName: cell(row, 1),
      details:      `Date: ${cell(row, 5)} | Service: ${cell(row, 3)} | Status: ${cell(row, 7)}`,
    });
  }
  return events;
}

// ── EVENT DETECTOR 3: Missed Appointment ─────────────────────────────────────

function detectMissedAppointments(apptRows) {
  const events  = [];
  const today   = todayKey();
  for (const row of apptRows) {
    const status = cell(row, 7).toLowerCase();
    if (!status.includes("miss")) continue;

    const phone = cell(row, 2);
    if (!phone) continue;

    const key = `MISSED_APPT|${phone}|${today}`;
    if (_notifiedKeys.has(key)) continue;

    events.push({
      key,
      eventType:    EVENT.MISSED_APPT,
      phone,
      customerName: cell(row, 1),
      details:      `Scheduled: ${cell(row, 5)} | Service: ${cell(row, 3)} | Status: ${cell(row, 7)}`,
    });
  }
  return events;
}

// ── EVENT DETECTOR 4: System Error (Critical) ─────────────────────────────────

function detectSystemErrors() {
  const events   = [];
  const critical = systemHealth.getCriticalChecks();
  if (critical.length === 0) return events;

  const key = `SYSTEM_ERROR|${hourKey()}`;
  if (_notifiedKeys.has(key)) return events;

  const names   = critical.map((c) => c.name).join(", ");
  const details = critical.map((c) => `${c.name}: ${c.note}`).join(" | ");

  events.push({
    key,
    eventType:    EVENT.SYSTEM_ERROR,
    phone:        "",
    customerName: "",
    details:      `${critical.length} Critical check(s): ${names} — ${details}`,
  });
  return events;
}

// ── EVENT DETECTOR 5: Follow-up Failed ───────────────────────────────────────

function detectFollowUpFailed() {
  const events = [];
  const today  = todayKey();
  const key    = `FU_LOOP_ERROR|${today}`;
  if (_notifiedKeys.has(key)) return events;

  try {
    const registry = require("./loopRegistry");
    const fuLoop   = registry.get("followup");
    if (fuLoop.status !== "error" && fuLoop.errorCount === 0) return events;

    events.push({
      key,
      eventType:    EVENT.FU_FAILED,
      phone:        "",
      customerName: "",
      details:      `Follow-up Loop status: ${fuLoop.status} | Errors today: ${fuLoop.errorCount} | Last error: ${fuLoop.lastError || "—"}`,
    });
  } catch {
    /* registry not loaded yet — skip */
  }
  return events;
}

// ── Main run function ─────────────────────────────────────────────────────────

/**
 * Execute one notification-check cycle.
 * @returns {Promise<{ dispatched: number; errors: number; elapsed: number }>}
 */
async function run() {
  const tag       = "[NotificationService]";
  const startTime = Date.now();

  const stats = { dispatched: 0, errors: 0 };

  // ── Get sheets client ──────────────────────────────────────────────────────
  const ctx = await getSheetsClient();
  if (!ctx) {
    console.warn(`${tag} Google Sheets not configured — skipping`);
    return { ...stats, elapsed: Date.now() - startTime };
  }
  const { sheets, spreadsheetId } = ctx;

  // ── Ensure NotificationLog tab exists ─────────────────────────────────────
  try {
    await ensureNotifTab(sheets, spreadsheetId);
  } catch (err) {
    console.error(`${tag} ensureNotifTab error: ${err.message}`);
    return { ...stats, elapsed: Date.now() - startTime };
  }

  // ── Seed dedup keys from sheet (first run only) ───────────────────────────
  await seedNotifiedKeys(sheets, spreadsheetId);

  // ── Read source sheets in parallel ────────────────────────────────────────
  // Pipeline cols: Name(0) Phone(1) Category(2) LeadType(3) PipelineStage(4)
  //                LastFollowUp(5) Appointment(6) Status(7) UpdatedAt(8)
  //
  // Appointments cols: Timestamp(0) Name(1) Phone(2) Category(3) SlotRequested(4)
  //                    ParsedStart(5) ParsedEnd(6) Status(7) CalendarEventId(8)

  const [pipelineRows, apptRows] = await Promise.all([
    readTab(sheets, spreadsheetId, PIPELINE_TAB,     "A2:I5000"),
    readTab(sheets, spreadsheetId, APPOINTMENTS_TAB, "A2:I5000"),
  ]);

  // ── Detect all events ─────────────────────────────────────────────────────

  const allEvents = [
    ...detectHotLeads(pipelineRows),
    ...detectAppointmentsConfirmed(apptRows),
    ...detectMissedAppointments(apptRows),
    ...detectSystemErrors(),
    ...detectFollowUpFailed(),
  ];

  if (allEvents.length === 0) {
    // Silent cycle — no new events to notify
    return { ...stats, elapsed: Date.now() - startTime };
  }

  console.log(`${tag} ${allEvents.length} new event(s) detected`);

  // ── Dispatch each notification ────────────────────────────────────────────

  for (const notif of allEvents) {
    try {
      await dispatch(sheets, spreadsheetId, notif);
      stats.dispatched++;
    } catch (err) {
      console.error(`${tag} Dispatch failed for "${notif.key}": ${err.message}`);
      stats.errors++;
    }
  }

  const elapsed = Date.now() - startTime;

  console.log(
    `${tag} Cycle done in ${elapsed}ms — ` +
    `dispatched=${stats.dispatched} errors=${stats.errors}`,
  );

  appendLog({
    time:        new Date().toISOString(),
    elapsed,
    dispatched:  stats.dispatched,
    errors:      stats.errors,
    events:      allEvents.map((e) => e.key),
  });

  return { ...stats, elapsed };
}

module.exports = { run, EVENT, NOTIF_LOG_TAB };
