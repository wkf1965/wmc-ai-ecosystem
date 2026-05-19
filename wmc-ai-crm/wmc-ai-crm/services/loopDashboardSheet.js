/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — LoopDashboard Google Sheet Service           ║
 * ║                                                              ║
 * ║  Manages the "LoopDashboard" tab in the CRM spreadsheet.   ║
 * ║  One row per loop — upsert by Loop Name.                   ║
 * ║                                                              ║
 * ║  Column layout (A–J):                                       ║
 * ║    A  Loop Name      (unique key)                           ║
 * ║    B  Status         running / stopped / error              ║
 * ║    C  Last Run       ISO timestamp of last completed cycle  ║
 * ║    D  Next Run       ISO timestamp of next scheduled run    ║
 * ║    E  Frequency      human-readable interval label          ║
 * ║    F  Error Count    cumulative since server start          ║
 * ║    G  Last Error     last error message or "—"              ║
 * ║    H  Notes          description / purpose                  ║
 * ║    I  Total Runs     cumulative cycle count since start     ║
 * ║    J  Last Updated   timestamp of this sheet write         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

"use strict";

const { google } = require("googleapis");
const fs         = require("fs");
const path       = require("path");

// Config lives in src/config — load dotenv once if not yet loaded
require("dotenv").config();

const SHEET_ID  = process.env.GOOGLE_SHEET_ID || "";
const CREDS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./google-credentials.json";

const TAB     = "LoopDashboard";
const HEADERS = [
  "Loop Name",
  "Status",
  "Last Run",
  "Next Run",
  "Frequency",
  "Error Count",
  "Last Error",
  "Notes",
  "Total Runs",
  "Last Updated",
];

// 0-based column indices
const COL = {
  name:        0,
  status:      1,
  lastRun:     2,
  nextRun:     3,
  freq:        4,
  errorCount:  5,
  lastError:   6,
  notes:       7,
  totalRuns:   8,
  lastUpdated: 9,
};

const LAST_COL_LETTER = "J"; // = COL count - 1 in A1 notation

// ── Auth ──────────────────────────────────────────────────────────────────────

function createSheetsClient() {
  const keyFile = path.resolve(CREDS_PATH);
  if (!fs.existsSync(keyFile)) {
    throw new Error(`[LOOP_SHEET] Credentials not found: ${keyFile}`);
  }
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// ── Tab + header bootstrap ────────────────────────────────────────────────────

let tabEnsured = false;

async function ensureTab(sheets) {
  if (tabEnsured) return;

  if (!SHEET_ID) {
    console.warn("[LOOP_SHEET] GOOGLE_SHEET_ID not set — skip tab creation");
    tabEnsured = true;
    return;
  }

  // 1. Create tab if it doesn't already exist
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: "sheets.properties.title",
  });
  const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "");
  if (!titles.includes(TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: TAB } } }],
      },
    });
    console.log(`[LOOP_SHEET] ✅ Tab "${TAB}" created`);
  }

  // 2. Write headers if A1 is not "Loop Name"
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB}'!A1`,
  });
  if ((check.data.values?.[0]?.[0] ?? "") !== "Loop Name") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${TAB}'!A1:${LAST_COL_LETTER}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [HEADERS] },
    });
    console.log(`[LOOP_SHEET] ✅ Headers written to ${TAB}!A1:${LAST_COL_LETTER}1`);
  }

  tabEnsured = true;
}

// ── Find existing row by loop name ────────────────────────────────────────────

/**
 * @returns {Promise<{ rowIndex1Based: number } | null>}
 */
async function findRowByName(sheets, loopName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB}'!A2:${LAST_COL_LETTER}1000`,
    majorDimension: "ROWS",
  });

  const rows = res.data.values ?? [];
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][COL.name] ?? "") === loopName) {
      return { rowIndex1Based: i + 2 };
    }
  }
  return null;
}

// ── Main export: sync one loop row ────────────────────────────────────────────

/**
 * Upsert one loop's row in the LoopDashboard sheet.
 *
 * @param {{
 *   id:          string;
 *   name:        string;
 *   description: string;
 *   freqLabel:   string;
 *   status:      "running" | "stopped" | "error";
 *   lastRun:     string | null;
 *   nextRun:     string | null;
 *   totalRuns:   number;
 *   errorCount:  number;
 *   lastError:   string | null;
 * }} loop
 */
async function syncLoopRow(loop) {
  if (!SHEET_ID) {
    console.warn(`[LOOP_SHEET] GOOGLE_SHEET_ID not set — skip sync for "${loop.name}"`);
    return;
  }

  const tag = `[LOOP_SHEET][${loop.id}]`;
  const now  = new Date().toISOString();

  // Format timestamps for human readability in the sheet
  function fmt(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-MY", {
        timeZone: "Asia/Kuala_Lumpur",
        year: "numeric", month: "short", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      });
    } catch { return iso; }
  }

  const row = [
    loop.name,
    loop.status,
    fmt(loop.lastRun),
    loop.nextRun ? fmt(loop.nextRun) : "—",
    loop.freqLabel   || "—",
    String(loop.errorCount  ?? 0),
    loop.lastError   || "—",
    loop.description || "—",
    String(loop.totalRuns   ?? 0),
    fmt(now),
  ];

  try {
    const sheets  = createSheetsClient();
    await ensureTab(sheets);

    const existing = await findRowByName(sheets, loop.name);

    if (existing) {
      // UPDATE
      const range = `'${TAB}'!A${existing.rowIndex1Based}:${LAST_COL_LETTER}${existing.rowIndex1Based}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { majorDimension: "ROWS", values: [row] },
      });
      console.log(
        `${tag} ✅ Updated row ${existing.rowIndex1Based} | status="${loop.status}" errors=${loop.errorCount}`,
      );
    } else {
      // APPEND
      const result = await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `'${TAB}'!A:${LAST_COL_LETTER}`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { majorDimension: "ROWS", values: [row] },
      });
      const updated = result.data.updates?.updatedRange || TAB;
      console.log(`${tag} ✅ New row appended → ${updated} | status="${loop.status}"`);
    }
  } catch (err) {
    const apiErr = err?.response?.data?.error;
    if (apiErr) {
      console.error(`${tag} ❌ Google API ${apiErr.code}: ${apiErr.message}`);
    } else {
      console.error(`${tag} ❌ Sheet sync error:`, err?.message || err);
    }
    // Never throw — sheet sync failure must not crash the loop
  }
}

/**
 * Sync every registered loop in one pass.
 * Call this on server startup so the sheet is fully populated.
 *
 * @param {Array} loops  — result of registry.getAll() + raw entries
 */
async function syncAll(loops) {
  for (const loop of loops) {
    await syncLoopRow(loop);
  }
  console.log(`[LOOP_SHEET] ✅ Full sync done — ${loops.length} loops written`);
}

module.exports = { syncLoopRow, syncAll };
