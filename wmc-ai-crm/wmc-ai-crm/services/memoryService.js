/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Memory Service                                           ║
 * ║                                                                          ║
 * ║  Runs every 5 minutes. Reads 4 source sheets and writes a merged,      ║
 * ║  enriched customer record into the Memory sheet for each unique phone. ║
 * ║                                                                          ║
 * ║  Source sheets read (parallel):                                         ║
 * ║    • Sheet1 (Leads)        — name, category, last message, timestamp   ║
 * ║    • Pipeline              — lead status, stage, last contact time      ║
 * ║    • Appointments          — most recent appointment date / status      ║
 * ║    • Follow Up Queue       — main problem, follow-up status             ║
 * ║                                                                          ║
 * ║  Memory sheet schema (A–M):                                             ║
 * ║    A  Phone               B  Name             C  ServiceInterest       ║
 * ║    D  LeadStatus          E  LastMessageSummary  F  LastReply           ║
 * ║    G  LastContactTime     H  MainProblem       I  PipelineStage         ║
 * ║    J  AppointmentDate     K  PreferredLanguage L  FollowUpStatus        ║
 * ║    M  Notes                                                             ║
 * ║                                                                          ║
 * ║  Rules:                                                                 ║
 * ║    • Never deletes memory rows — update or create only                  ║
 * ║    • Merge by phone number (normalised digits)                          ║
 * ║    • If new value empty → keep existing value                           ║
 * ║    • Column F (LastReply) is managed by the webhook, never overwritten  ║
 * ║    • Column M (Notes) is user-entered, never overwritten                ║
 * ║    • Uses batchUpdate for efficiency (one API call for all updates)     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();

const fs   = require("fs");
const path = require("path");

const {
  getSheetsClient,
  ensureMemorySheet,
  normalizeDigits,
  MEMORY_TAB,
} = require("../sheetsMemory");

const { toSheetUtf8String } = require("../sheetsAppend");

// ── Sheet tab names ───────────────────────────────────────────────────────────

const LEADS_TAB        = String(process.env.GOOGLE_SHEET_TAB             || "Sheet1").trim();
const PIPELINE_TAB     = String(process.env.GOOGLE_SHEET_PIPELINE_TAB    || "Pipeline").trim();
const APPOINTMENTS_TAB = String(process.env.GOOGLE_SHEET_APPOINTMENTS_TAB || "Appointments").trim();
const FUQ_TAB          = "Follow Up Queue";

// ── Log file ──────────────────────────────────────────────────────────────────

const LOG_FILE = path.join(__dirname, "../logs/memoryLoop.log");

// ── Extended column headers added to Memory (H–M) ────────────────────────────

const EXTENDED_HEADERS = [
  "MainProblem",      // H
  "PipelineStage",    // I
  "AppointmentDate",  // J
  "PreferredLanguage",// K
  "FollowUpStatus",   // L
  "Notes",            // M
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

/** Safe cell read — returns trimmed string or "" */
function c(row, idx) {
  return String(row?.[idx] ?? "").trim();
}

/** Return first non-empty value from args */
function pick(...vals) {
  return vals.find((v) => v && v !== "—" && v !== "-") || "";
}

/** Truncate a message to max chars */
function trunc(str, max = 250) {
  const s = String(str || "").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/** Detect primary language from text (heuristic: >30% CJK chars = Chinese) */
function detectLanguage(text) {
  if (!text) return "";
  const chinese = (text.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g) || []).length;
  const total   = text.replace(/\s/g, "").length;
  if (total > 0 && chinese / total >= 0.25) return "Chinese";
  return "English";
}

function appendLog(entry) {
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch { /* non-fatal */ }
}

// ── Read all rows from any tab (silent on missing tabs) ───────────────────────

async function readTab(sheets, spreadsheetId, tab, range) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range:          `${esc(tab)}!${range}`,
      majorDimension: "ROWS",
    });
    return res.data.values || [];
  } catch (err) {
    // 400 = tab doesn't exist yet, warn but don't throw
    console.warn(`[MemoryService] Could not read "${tab}": ${err.message}`);
    return [];
  }
}

// ── Ensure extended headers H–M are written in row 1 ─────────────────────────

async function ensureExtendedHeaders(sheets, spreadsheetId) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${esc(MEMORY_TAB)}!H1:M1`,
    });
    const h1 = String(res.data.values?.[0]?.[0] ?? "").trim();
    if (h1 !== "") return; // already written

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            `${esc(MEMORY_TAB)}!H1:M1`,
      valueInputOption: "USER_ENTERED",
      requestBody:      { majorDimension: "ROWS", values: [EXTENDED_HEADERS] },
    });
    console.log("[MemoryService] Extended Memory headers (H–M) written");
  } catch (err) {
    console.warn("[MemoryService] ensureExtendedHeaders:", err.message);
  }
}

// ── Read all existing Memory rows into a Map (phone → record) ────────────────

async function readMemoryMap(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range:          `${esc(MEMORY_TAB)}!A2:M5000`,
    majorDimension: "ROWS",
  });
  const rows = res.data.values || [];
  const map  = new Map();

  for (let i = 0; i < rows.length; i++) {
    const r     = rows[i];
    const phone = normalizeDigits(c(r, 0));
    if (!phone) continue;

    map.set(phone, {
      rowIndex:           i + 2,       // 1-based (row 1 = headers)
      phone:              c(r, 0),
      name:               c(r, 1),
      serviceInterest:    c(r, 2),
      leadStatus:         c(r, 3),
      lastMessageSummary: c(r, 4),
      lastReply:          c(r, 5),     // managed by webhook — NEVER overwrite
      lastContactTime:    c(r, 6),
      mainProblem:        c(r, 7),
      pipelineStage:      c(r, 8),
      appointmentDate:    c(r, 9),
      preferredLanguage:  c(r, 10),
      followUpStatus:     c(r, 11),
      notes:              c(r, 12),    // user-entered — NEVER overwrite
    });
  }

  return map;
}

// ── Build cell array for a merged record ─────────────────────────────────────

function buildCells(merged) {
  return [
    toSheetUtf8String(merged.phone),
    toSheetUtf8String(merged.name),
    toSheetUtf8String(merged.serviceInterest),
    toSheetUtf8String(merged.leadStatus),
    toSheetUtf8String(merged.lastMessageSummary),
    toSheetUtf8String(merged.lastReply),        // preserved from existing
    toSheetUtf8String(merged.lastContactTime),
    toSheetUtf8String(merged.mainProblem),
    toSheetUtf8String(merged.pipelineStage),
    toSheetUtf8String(merged.appointmentDate),
    toSheetUtf8String(merged.preferredLanguage),
    toSheetUtf8String(merged.followUpStatus),
    toSheetUtf8String(merged.notes),            // preserved from existing
  ];
}

// ── Main run function ─────────────────────────────────────────────────────────

/**
 * Execute one memory-sync cycle.
 * @returns {Promise<{ updated: number; created: number; errors: number; elapsed: number }>}
 */
async function run() {
  const tag       = "[MemoryService]";
  const startTime = Date.now();

  console.log(`${tag} Cycle start — syncing customer memory from 4 sheets…`);

  const stats = { updated: 0, created: 0, errors: 0 };

  // ── Get authenticated client ──────────────────────────────────────────────
  const ctx = await getSheetsClient();
  if (!ctx) {
    console.warn(`${tag} Google Sheets not configured — skipping`);
    return { ...stats, elapsed: Date.now() - startTime };
  }
  const { sheets, spreadsheetId } = ctx;

  // ── Ensure Memory sheet + extended headers exist ──────────────────────────
  try {
    await ensureMemorySheet(sheets, spreadsheetId);
    await ensureExtendedHeaders(sheets, spreadsheetId);
  } catch (err) {
    console.error(`${tag} Sheet setup error: ${err.message}`);
    return { ...stats, elapsed: Date.now() - startTime };
  }

  // ── Read all 4 source sheets in parallel ──────────────────────────────────
  //
  //  Leads (Sheet1)   cols: Timestamp(0) Name(1) Message(2) Source(3) Category(4)
  //                        LeadType(5)  Phone(6) Reply(7)  NextAction(8)
  //
  //  Pipeline         cols: Name(0) Phone(1) Category(2) LeadType(3) PipelineStage(4)
  //                        LastFollowUp(5) Appointment(6) Status(7) UpdatedAt(8)
  //
  //  Appointments     cols: Timestamp(0) Name(1) Phone(2) Category(3) SlotRequested(4)
  //                        ParsedStart(5) ParsedEnd(6) Status(7) CalendarEventId(8)
  //
  //  Follow Up Queue  cols: CreatedTime(0) Phone(1) CustomerMessage(2) Category(3)
  //                        LeadScore(4) LastAiReply(5) FollowUpTime(6)
  //                        FollowUpStatus(7) FollowUpMessage(8)

  const [leadsRows, pipelineRows, appointmentRows, fuqRows] = await Promise.all([
    readTab(sheets, spreadsheetId, LEADS_TAB,        "A2:I5000"),
    readTab(sheets, spreadsheetId, PIPELINE_TAB,     "A2:I5000"),
    readTab(sheets, spreadsheetId, APPOINTMENTS_TAB, "A2:I5000"),
    readTab(sheets, spreadsheetId, FUQ_TAB,          "A2:J5000"),
  ]);

  console.log(
    `${tag} Rows read — Leads:${leadsRows.length} ` +
    `Pipeline:${pipelineRows.length} ` +
    `Appointments:${appointmentRows.length} ` +
    `FollowUpQueue:${fuqRows.length}`,
  );

  // ── Read existing Memory map ──────────────────────────────────────────────
  const memoryMap = await readMemoryMap(sheets, spreadsheetId);
  console.log(`${tag} Existing Memory rows: ${memoryMap.size}`);

  // ── Build new-data map per phone ──────────────────────────────────────────

  /** @type {Map<string, Record<string, string>>} */
  const newDataMap = new Map();

  const getOrCreate = (phone, rawPhone) => {
    if (!newDataMap.has(phone)) newDataMap.set(phone, { phone: rawPhone || phone });
    return newDataMap.get(phone);
  };

  // 1. Leads (Sheet1) — take the LATEST entry per phone
  const leadsLatest = new Map(); // phone digits → { ts, row }
  for (const row of leadsRows) {
    const phone = normalizeDigits(c(row, 6));
    if (!phone) continue;
    const ts = c(row, 0);
    const prev = leadsLatest.get(phone);
    if (!prev || ts > prev.ts) leadsLatest.set(phone, { ts, row });
  }
  for (const [phone, { row }] of leadsLatest.entries()) {
    const rec = getOrCreate(phone, c(row, 6));
    rec.name               = pick(c(row, 1), rec.name);
    rec.serviceInterest    = pick(c(row, 4), rec.serviceInterest); // Category
    rec.leadStatus         = pick(c(row, 5), rec.leadStatus);      // LeadType
    rec.lastMessageSummary = pick(trunc(c(row, 2)), rec.lastMessageSummary);
    rec.lastContactTime    = pick(c(row, 0), rec.lastContactTime);
  }

  // 2. Pipeline — most authoritative for lead/stage status
  for (const row of pipelineRows) {
    const phone = normalizeDigits(c(row, 1));
    if (!phone) continue;
    const rec = getOrCreate(phone, c(row, 1));
    rec.name            = pick(c(row, 0), rec.name);
    rec.serviceInterest = pick(c(row, 2), rec.serviceInterest);
    rec.leadStatus      = pick(c(row, 3), rec.leadStatus);       // LeadType (most current)
    rec.pipelineStage   = pick(c(row, 4), rec.pipelineStage);
    rec.lastContactTime = pick(c(row, 8), rec.lastContactTime);  // UpdatedAt
  }

  // 3. Appointments — most recent appointment date per phone
  const apptLatest = new Map(); // phone digits → { parsedStart, row }
  for (const row of appointmentRows) {
    const phone = normalizeDigits(c(row, 2));
    if (!phone) continue;
    const parsedStart = c(row, 5);
    if (!parsedStart) continue;
    const prev = apptLatest.get(phone);
    if (!prev || parsedStart > prev.parsedStart) {
      apptLatest.set(phone, { parsedStart, row });
    }
  }
  for (const [phone, { parsedStart, row }] of apptLatest.entries()) {
    const rec = getOrCreate(phone, c(row, 2));
    rec.appointmentDate = parsedStart;
    rec.name = pick(c(row, 1), rec.name);
  }

  // 4. Follow Up Queue — most recent entry per phone for mainProblem + followUpStatus
  const fuqLatest = new Map(); // phone digits → { ts, row }
  for (const row of fuqRows) {
    const phone = normalizeDigits(c(row, 1));
    if (!phone) continue;
    const ts   = c(row, 0);
    const prev = fuqLatest.get(phone);
    if (!prev || ts > prev.ts) fuqLatest.set(phone, { ts, row });
  }
  for (const [phone, { row }] of fuqLatest.entries()) {
    const rec = getOrCreate(phone, c(row, 1));
    const msg = trunc(c(row, 2)); // CustomerMessage
    rec.mainProblem    = pick(msg,       rec.mainProblem);
    rec.followUpStatus = pick(c(row, 7), rec.followUpStatus);  // FollowUpStatus
    if (!rec.serviceInterest) rec.serviceInterest = c(row, 3); // Category fallback
    // Use FUQ message as lastMessageSummary fallback if not from Leads
    if (!rec.lastMessageSummary) rec.lastMessageSummary = msg;
  }

  // ── Compute merged records, split into updates vs appends ────────────────

  /** @type {{ range: string; values: string[][] }[]} */
  const batchData   = [];    // for batchUpdate (existing rows)
  /** @type {string[][]} */
  const appendRows  = [];    // for append (new rows)

  for (const [phone, newData] of newDataMap.entries()) {
    const existing = memoryMap.get(phone);

    // Language detection from best available text
    const langText = newData.mainProblem || newData.lastMessageSummary || "";
    const detectedLang = detectLanguage(langText);

    const merged = existing ? {
      phone:              pick(newData.phone,              existing.phone, phone),
      name:               pick(newData.name,               existing.name),
      serviceInterest:    pick(newData.serviceInterest,    existing.serviceInterest),
      leadStatus:         pick(newData.leadStatus,         existing.leadStatus),
      lastMessageSummary: pick(newData.lastMessageSummary, existing.lastMessageSummary),
      lastReply:          existing.lastReply,               // webhook-managed — keep as-is
      lastContactTime:    pick(newData.lastContactTime,    existing.lastContactTime),
      mainProblem:        pick(newData.mainProblem,        existing.mainProblem),
      pipelineStage:      pick(newData.pipelineStage,      existing.pipelineStage),
      appointmentDate:    pick(newData.appointmentDate,    existing.appointmentDate),
      preferredLanguage:  pick(existing.preferredLanguage, detectedLang),
      followUpStatus:     pick(newData.followUpStatus,     existing.followUpStatus),
      notes:              existing.notes,                   // user-entered — keep as-is
    } : {
      phone:              newData.phone || phone,
      name:               newData.name              || "",
      serviceInterest:    newData.serviceInterest   || "",
      leadStatus:         newData.leadStatus        || "",
      lastMessageSummary: newData.lastMessageSummary|| "",
      lastReply:          "",
      lastContactTime:    newData.lastContactTime   || "",
      mainProblem:        newData.mainProblem       || "",
      pipelineStage:      newData.pipelineStage     || "",
      appointmentDate:    newData.appointmentDate   || "",
      preferredLanguage:  detectedLang,
      followUpStatus:     newData.followUpStatus    || "",
      notes:              "",
    };

    const cells = buildCells(merged);

    if (existing) {
      batchData.push({
        range:  `${esc(MEMORY_TAB)}!A${existing.rowIndex}:M${existing.rowIndex}`,
        values: [cells],
      });
    } else {
      appendRows.push(cells);
    }
  }

  // ── Batch update existing rows (single API call) ──────────────────────────

  if (batchData.length > 0) {
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data:             batchData,
        },
      });
      stats.updated = batchData.length;
      console.log(`${tag} Updated ${stats.updated} existing Memory row(s)`);
    } catch (err) {
      console.error(`${tag} batchUpdate error: ${err.message}`);
      stats.errors++;
    }
  }

  // ── Append new rows ───────────────────────────────────────────────────────

  if (appendRows.length > 0) {
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range:            `${esc(MEMORY_TAB)}!A:M`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody:      { majorDimension: "ROWS", values: appendRows },
      });
      stats.created = appendRows.length;
      console.log(`${tag} Created ${stats.created} new Memory row(s)`);
    } catch (err) {
      console.error(`${tag} Append error: ${err.message}`);
      stats.errors++;
    }
  }

  const elapsed = Date.now() - startTime;

  console.log(
    `${tag} Cycle done in ${elapsed}ms — ` +
    `updated=${stats.updated} created=${stats.created} errors=${stats.errors}`,
  );

  appendLog({
    time:            new Date().toISOString(),
    elapsed,
    leadsRows:       leadsRows.length,
    pipelineRows:    pipelineRows.length,
    appointmentRows: appointmentRows.length,
    fuqRows:         fuqRows.length,
    memoryBefore:    memoryMap.size,
    ...stats,
  });

  return { ...stats, elapsed };
}

module.exports = { run };
