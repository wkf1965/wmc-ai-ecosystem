/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Appointment Service                                      ║
 * ║                                                                          ║
 * ║  Monitors the Appointments Google Sheet tab every cycle and:            ║
 * ║                                                                          ║
 * ║  1. Sends a 24h WhatsApp reminder when appointment is tomorrow          ║
 * ║  2. Sends a 1h WhatsApp reminder when appointment is in ~1 hour         ║
 * ║  3. Marks appointment as "Today Appointment" on the day                 ║
 * ║  4. Marks appointment as "Missed Appointment" if time passed + no show  ║
 * ║  5. Adds missed appointments to Follow Up Queue for rescheduling        ║
 * ║  6. Updates Pipeline stage + leadType for confirmed appointments        ║
 * ║                                                                          ║
 * ║  Status flow in Appointments sheet (column H):                          ║
 * ║    Confirmed                                                             ║
 * ║      → 24h Reminder Sent   (when T-18h to T-30h)                       ║
 * ║      → 1h Reminder Sent    (when T-30min to T-90min)                   ║
 * ║      → Today Appointment   (appointment day, any time)                  ║
 * ║      → Missed Appointment  (T+2h grace, no attendance recorded)         ║
 * ║      → Attended / Completed (set manually by staff — never touched)     ║
 * ║                                                                          ║
 * ║  Duplicate-reminder prevention: every status change is persisted to     ║
 * ║  the sheet immediately, so even after a server restart the reminder     ║
 * ║  will not be re-sent.                                                   ║
 * ║                                                                          ║
 * ║  POLICY: never deletes any appointment row or field.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Appointments sheet columns (A–I):
 *   A  Timestamp        (when the booking was logged)
 *   B  Name
 *   C  Phone
 *   D  Category
 *   E  SlotRequested    (raw text from AI parser)
 *   F  ParsedStart      (ISO datetime — e.g. "2026-05-17T09:00:00+08:00")
 *   G  ParsedEnd
 *   H  Status           ← this service reads & updates this column only
 *   I  CalendarEventId
 *
 * Pipeline sheet columns (A–I):
 *   A Name  B Phone  C Category  D LeadType  E PipelineStage
 *   F LastFollowUp  G Appointment  H Status  I UpdatedAt
 *
 * Follow Up Queue columns (A–I):
 *   A createdTime  B phone  C customerMessage  D category  E leadScore
 *   F lastAiReply  G followUpTime  H followUpStatus  I followUpMessage
 */

"use strict";

require("dotenv").config();

const { google } = require("googleapis");
const fs         = require("fs");
const path       = require("path");

const { sendMessage }    = require("../src/services/whatsapp.service");
const { updatePipeline } = require("../sheetsPipeline");

// ── Config ────────────────────────────────────────────────────────────────────

const SHEET_ID   = process.env.GOOGLE_SHEET_ID    || "";
const CREDS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./google-credentials.json";

const APPT_TAB = String(process.env.GOOGLE_SHEET_APPOINTMENTS_TAB || "Appointments").trim();
const FUQ_TAB  = "Follow Up Queue";

const WMC_ADDRESS = "14 Jalan Lapangan Siber 1, Bandar Cyber, 31350 Ipoh, Perak";
const WMC_PHONE   = "012-4520077";

// ── Appointment sheet column indices (0-based) ────────────────────────────────

const COL = {
  timestamp:      0, // A
  name:           1, // B
  phone:          2, // C
  category:       3, // D
  slotRequested:  4, // E
  parsedStart:    5, // F
  parsedEnd:      6, // G
  status:         7, // H
  calendarId:     8, // I
};

// ── Status constants ──────────────────────────────────────────────────────────

const APPT_STATUS = {
  PENDING:            "Pending",
  CONFIRMED:          "Confirmed",
  REMINDER_24H:       "24h Reminder Sent",
  REMINDER_1H:        "1h Reminder Sent",
  TODAY:              "Today Appointment",
  MISSED:             "Missed Appointment",
  ATTENDED:           "Attended",
  COMPLETED:          "Completed",
  CANCELLED:          "Cancelled",
};

// Statuses that are terminal — the loop will never modify these rows
const TERMINAL_STATUSES = new Set([
  APPT_STATUS.ATTENDED,
  APPT_STATUS.COMPLETED,
  APPT_STATUS.CANCELLED,
  APPT_STATUS.MISSED,
]);

// ── Time window constants ─────────────────────────────────────────────────────

const H  = 60 * 60 * 1000;
const MIN = 60 * 1000;

// 24h reminder fires when the appointment is 18–30h away
const WINDOW_24H_MIN = 18 * H;
const WINDOW_24H_MAX = 30 * H;

// 1h reminder fires when the appointment is 30–90min away
const WINDOW_1H_MIN  = 30 * MIN;
const WINDOW_1H_MAX  = 90 * MIN;

// Missed grace period — appointment must be > 2h in the past before marking missed
const MISSED_GRACE = 2 * H;

// ── Helpers ───────────────────────────────────────────────────────────────────

function createSheetsClient() {
  const keyFile = path.resolve(CREDS_PATH);
  if (!fs.existsSync(keyFile)) {
    throw new Error(`Google credentials not found: ${keyFile}`);
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

/**
 * Parse a date/time string from the Appointments sheet into a JS Date.
 * Handles ISO strings ("2026-05-17T09:00:00+08:00") and plain dates ("2026-05-17").
 * Returns null if unparseable.
 */
function parseApptDate(raw) {
  if (!raw || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // Try common Malaysian date formats: "17/05/2026 09:00" or "17-05-2026"
  const dmyTime = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmyTime) {
    const [, day, mon, yr, hh = "0", mm = "0", ss = "0"] = dmyTime;
    const iso = `${yr}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}T${hh.padStart(2, "0")}:${mm}:${ss}+08:00`;
    const d2 = new Date(iso);
    if (!isNaN(d2.getTime())) return d2;
  }

  return null;
}

/**
 * Format a Date as human-readable MYT string for WhatsApp messages.
 * e.g. "17 May 2026 (Sunday) at 9:00 AM"
 */
function fmtMYT(date) {
  return date.toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    weekday:  "long",
    year:     "numeric",
    month:    "long",
    day:      "numeric",
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   true,
  });
}

/**
 * Format a Date as a short time string for MYT.
 * e.g. "9:00 AM"
 */
function fmtTimeMYT(date) {
  return date.toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   true,
  });
}

/**
 * Returns true if two dates fall on the same calendar day in MYT.
 */
function isSameDayMYT(a, b) {
  const opts = { timeZone: "Asia/Kuala_Lumpur" };
  return (
    a.toLocaleDateString("en-MY", opts) === b.toLocaleDateString("en-MY", opts)
  );
}

// ── WhatsApp message builders ─────────────────────────────────────────────────

function build24hMessage(name, parsedStart) {
  const when = fmtMYT(parsedStart);
  return `您好${name ? ` ${name}` : ""}！

温馨提醒：您在黄氏医疗中心（Wong Medical Centre）的预约是明天，${when}。

请准时出席。如需更改时间，请提前联系我们。

📍 ${WMC_ADDRESS}
📞 WhatsApp: ${WMC_PHONE}

Wong Medical Centre 期待您的到来！`;
}

function build1hMessage(name, parsedStart) {
  const time = fmtTimeMYT(parsedStart);
  return `您好${name ? ` ${name}` : ""}！

温馨提醒：您今天在 Wong Medical Centre 的预约将在约 1 小时后（${time}）开始。

请准时到来，我们的团队已准备好迎接您。

📍 ${WMC_ADDRESS}
📞 WhatsApp: ${WMC_PHONE}`;
}

// ── Sheet update helpers ──────────────────────────────────────────────────────

/** Update column H (Status) of a single Appointments row. Never touches other columns. */
async function updateApptStatus(sheets, rowIndex1Based, newStatus) {
  if (!SHEET_ID) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${esc(APPT_TAB)}!H${rowIndex1Based}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { majorDimension: "ROWS", values: [[newStatus]] },
  });
}

/**
 * Append a reschedule entry to the Follow Up Queue tab.
 * createdTime, phone, customerMessage, category, leadScore,
 * lastAiReply, followUpTime, followUpStatus, followUpMessage
 */
async function appendToFollowUpQueue(sheets, appt) {
  if (!SHEET_ID) return;

  const now     = new Date().toISOString();
  const message = `错过预约 — 原定时间：${appt.parsedStartRaw || appt.slotRequested || "未知"}。请联系重新预约。`;

  const row = [
    now,             // A createdTime
    appt.phone,      // B phone
    message,         // C customerMessage (context for follow-up AI)
    appt.category,   // D category
    "70",            // E leadScore (hot — had a confirmed appointment)
    "",              // F lastAiReply
    now,             // G followUpTime (due immediately for rescheduling)
    "PENDING",       // H followUpStatus
    "",              // I followUpMessage
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${esc(FUQ_TAB)}!A:I`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { majorDimension: "ROWS", values: [row] },
  });
}

// ── Core run function ─────────────────────────────────────────────────────────

/**
 * One execution cycle of the Appointment Loop.
 *
 * Reads all Appointments rows, evaluates each one against the current time,
 * and takes the appropriate action (send reminder, mark status, queue follow-up).
 *
 * @returns {Promise<{
 *   scanned: number;
 *   reminders24h: number;
 *   reminders1h: number;
 *   markedToday: number;
 *   markedMissed: number;
 *   queuedReschedule: number;
 *   errors: number;
 * }>}
 */
async function run() {
  const tag = "[APPT_SVC]";

  const stats = {
    scanned:           0,
    reminders24h:      0,
    reminders1h:       0,
    markedToday:       0,
    markedMissed:      0,
    queuedReschedule:  0,
    errors:            0,
  };

  if (!SHEET_ID) {
    console.warn(`${tag} GOOGLE_SHEET_ID not set — skipping cycle`);
    return stats;
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  let sheets;
  try {
    sheets = createSheetsClient();
  } catch (err) {
    console.error(`${tag} Auth error:`, err.message);
    throw err; // let LoopRegistry mark this cycle as "error"
  }

  // ── Read Appointments tab ───────────────────────────────────────────────────

  let rows = [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${esc(APPT_TAB)}!A2:I5000`,
      majorDimension: "ROWS",
    });
    rows = res.data.values ?? [];
  } catch (err) {
    console.error(`${tag} Failed to read Appointments tab:`, err.message);
    throw err;
  }

  if (rows.length === 0) {
    console.log(`${tag} Appointments tab is empty — nothing to process`);
    return stats;
  }

  console.log(`${tag} Cycle start — scanning ${rows.length} appointment row(s)…`);

  const now = Date.now();

  // ── Process each row ────────────────────────────────────────────────────────

  for (let i = 0; i < rows.length; i++) {
    const row         = rows[i];
    const rowNum      = i + 2;                                       // 1-based sheet row
    const name        = String(row[COL.name]          ?? "").trim();
    const phone       = String(row[COL.phone]         ?? "").trim();
    const category    = String(row[COL.category]      ?? "General Inquiry").trim();
    const parsedStartRaw = String(row[COL.parsedStart]   ?? "").trim();
    const slotReqRaw  = String(row[COL.slotRequested] ?? "").trim();
    const rawStatus   = String(row[COL.status]        ?? "").trim();

    stats.scanned++;

    // ── Skip if no phone (can't send WhatsApp) ──────────────────────────────
    if (!phone) continue;

    // ── Skip terminal statuses ───────────────────────────────────────────────
    if (TERMINAL_STATUSES.has(rawStatus)) continue;

    // ── Parse appointment date ───────────────────────────────────────────────
    const parsedStart = parseApptDate(parsedStartRaw) ?? parseApptDate(slotReqRaw);

    if (!parsedStart) {
      // No parseable date — skip silently (appointment may still be unconfirmed)
      continue;
    }

    const apptMs   = parsedStart.getTime();
    const diffMs   = apptMs - now; // positive = future, negative = past

    const apptContext = {
      phone,
      name,
      category,
      parsedStartRaw,
      slotRequested: slotReqRaw,
      rowNum,
      rawStatus,
    };

    // ── 1. Missed Appointment ────────────────────────────────────────────────
    //    Appointment time has passed by > MISSED_GRACE, not attended/completed
    if (diffMs < -MISSED_GRACE) {
      if (rawStatus !== APPT_STATUS.MISSED) {
        await handleMissed(sheets, apptContext, parsedStart, stats, tag);
      }
      continue; // nothing else to do for this row
    }

    // ── 2. Today Appointment  ────────────────────────────────────────────────
    //    Appointment is today but not yet passed the grace period
    if (isSameDayMYT(parsedStart, new Date()) && diffMs > -MISSED_GRACE) {
      if (
        rawStatus !== APPT_STATUS.TODAY &&
        rawStatus !== APPT_STATUS.REMINDER_1H &&
        rawStatus !== APPT_STATUS.MISSED
      ) {
        await handleMarkToday(sheets, apptContext, stats, tag);
      }
    }

    // ── 3. 1h Reminder ──────────────────────────────────────────────────────
    if (diffMs >= WINDOW_1H_MIN && diffMs <= WINDOW_1H_MAX) {
      if (rawStatus !== APPT_STATUS.REMINDER_1H) {
        await handle1hReminder(sheets, apptContext, parsedStart, stats, tag);
      }
      continue;
    }

    // ── 4. 24h Reminder ─────────────────────────────────────────────────────
    if (diffMs >= WINDOW_24H_MIN && diffMs <= WINDOW_24H_MAX) {
      if (rawStatus === APPT_STATUS.CONFIRMED || rawStatus === APPT_STATUS.PENDING) {
        await handle24hReminder(sheets, apptContext, parsedStart, stats, tag);
      }
      continue;
    }

    // ── 5. Confirmed — keep Pipeline hot ────────────────────────────────────
    //    Appointment is in the future and confirmed — make sure Pipeline reflects this
    if (
      (rawStatus === APPT_STATUS.CONFIRMED) &&
      diffMs > WINDOW_24H_MAX // more than 30h away — too early for 24h reminder
    ) {
      await ensurePipelineHot(apptContext, parsedStart, tag);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  console.log(
    `${tag} Cycle done — scanned=${stats.scanned} ` +
    `24h=${stats.reminders24h} 1h=${stats.reminders1h} ` +
    `today=${stats.markedToday} missed=${stats.markedMissed} ` +
    `queued=${stats.queuedReschedule} errors=${stats.errors}`,
  );

  return stats;
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handle24hReminder(sheets, appt, parsedStart, stats, tag) {
  const { phone, name, category, rowNum } = appt;

  console.log(`${tag} 24h reminder due — row=${rowNum} phone=${phone} appt=${fmtMYT(parsedStart)}`);

  // 1. Send WhatsApp
  try {
    const msg = build24hMessage(name, parsedStart);
    await sendMessage(phone, msg);
    console.log(`${tag} ✅ 24h reminder sent to ${phone}`);
  } catch (err) {
    console.error(`${tag} ❌ 24h reminder WhatsApp failed for ${phone}:`, err.message);
    stats.errors++;
    return; // don't update status if message didn't send
  }

  // 2. Update Appointments sheet status
  try {
    await updateApptStatus(sheets, rowNum, APPT_STATUS.REMINDER_24H);
    console.log(`${tag} ✅ Appointments row ${rowNum} → "${APPT_STATUS.REMINDER_24H}"`);
  } catch (err) {
    console.error(`${tag} ❌ Status update failed for row ${rowNum}:`, err.message);
    stats.errors++;
  }

  // 3. Update Pipeline — mark as Appointment Confirmed + Hot Lead
  try {
    const apptStr = fmtMYT(parsedStart);
    await updatePipeline(phone, {
      pipelineStage: "Appointment Confirmed",
      leadType:      "Hot Lead",
      appointment:   apptStr,
      status:        "Appointment Confirmed",
      updatedAt:     new Date().toISOString(),
    });
    console.log(`${tag} ✅ Pipeline updated for ${phone} → Appointment Confirmed / Hot Lead`);
  } catch (err) {
    console.warn(`${tag} Pipeline update failed for ${phone}:`, err.message);
  }

  stats.reminders24h++;
}

async function handle1hReminder(sheets, appt, parsedStart, stats, tag) {
  const { phone, name, rowNum } = appt;

  console.log(`${tag} 1h reminder due — row=${rowNum} phone=${phone} appt=${fmtTimeMYT(parsedStart)}`);

  // 1. Send WhatsApp
  try {
    const msg = build1hMessage(name, parsedStart);
    await sendMessage(phone, msg);
    console.log(`${tag} ✅ 1h reminder sent to ${phone}`);
  } catch (err) {
    console.error(`${tag} ❌ 1h reminder WhatsApp failed for ${phone}:`, err.message);
    stats.errors++;
    return;
  }

  // 2. Update status
  try {
    await updateApptStatus(sheets, rowNum, APPT_STATUS.REMINDER_1H);
    console.log(`${tag} ✅ Appointments row ${rowNum} → "${APPT_STATUS.REMINDER_1H}"`);
  } catch (err) {
    console.error(`${tag} ❌ Status update failed for row ${rowNum}:`, err.message);
    stats.errors++;
  }

  stats.reminders1h++;
}

async function handleMarkToday(sheets, appt, stats, tag) {
  const { phone, rowNum } = appt;

  console.log(`${tag} Today appointment — row=${rowNum} phone=${phone}`);

  try {
    await updateApptStatus(sheets, rowNum, APPT_STATUS.TODAY);
    console.log(`${tag} ✅ Appointments row ${rowNum} → "${APPT_STATUS.TODAY}"`);
    stats.markedToday++;
  } catch (err) {
    console.error(`${tag} ❌ Today-status update failed for row ${rowNum}:`, err.message);
    stats.errors++;
  }

  // Update Pipeline to reflect today's appointment
  try {
    await updatePipeline(phone, {
      pipelineStage: "Appointment Today",
      leadType:      "Hot Lead",
      status:        "Appointment Today",
      updatedAt:     new Date().toISOString(),
    });
  } catch (err) {
    console.warn(`${tag} Pipeline update failed for ${phone}:`, err.message);
  }
}

async function handleMissed(sheets, appt, parsedStart, stats, tag) {
  const { phone, name, category, rowNum, parsedStartRaw, slotRequested } = appt;

  console.log(`${tag} Missed appointment detected — row=${rowNum} phone=${phone} was=${fmtMYT(parsedStart)}`);

  // 1. Mark appointment as Missed in sheet
  try {
    await updateApptStatus(sheets, rowNum, APPT_STATUS.MISSED);
    console.log(`${tag} ✅ Appointments row ${rowNum} → "${APPT_STATUS.MISSED}"`);
    stats.markedMissed++;
  } catch (err) {
    console.error(`${tag} ❌ Missed-status update failed for row ${rowNum}:`, err.message);
    stats.errors++;
    return; // if we can't write back, don't queue (would create duplicates)
  }

  // 2. Add to Follow Up Queue for rescheduling follow-up
  try {
    await appendToFollowUpQueue(sheets, {
      phone,
      name,
      category,
      parsedStartRaw,
      slotRequested,
    });
    console.log(`${tag} ✅ Added ${phone} to Follow Up Queue for rescheduling`);
    stats.queuedReschedule++;
  } catch (err) {
    console.error(`${tag} ❌ Follow Up Queue append failed for ${phone}:`, err.message);
    stats.errors++;
  }

  // 3. Update Pipeline to Missed Appointment
  try {
    await updatePipeline(phone, {
      pipelineStage: "Missed Appointment",
      status:        "Missed Appointment",
      updatedAt:     new Date().toISOString(),
    });
    console.log(`${tag} ✅ Pipeline updated for ${phone} → Missed Appointment`);
  } catch (err) {
    console.warn(`${tag} Pipeline update failed for ${phone}:`, err.message);
  }
}

/**
 * For confirmed appointments > 30h away, ensure Pipeline shows
 * Appointment Confirmed + Hot Lead without sending any message.
 */
async function ensurePipelineHot(appt, parsedStart, tag) {
  const { phone } = appt;
  try {
    await updatePipeline(phone, {
      pipelineStage: "Appointment Confirmed",
      leadType:      "Hot Lead",
      appointment:   fmtMYT(parsedStart),
      updatedAt:     new Date().toISOString(),
    });
  } catch {
    // Silent — this is a background sync, not critical
  }
}

module.exports = { run, APPT_STATUS, APPT_TAB };
