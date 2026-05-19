/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Loop Dashboard Service                                   ║
 * ║                                                                          ║
 * ║  Writes all registered loop rows to the LoopDashboard Google Sheet tab ║
 * ║  using a CLEAR + REWRITE approach.                                      ║
 * ║                                                                          ║
 * ║  Uses the same spreadsheet ID resolution as all other CRM sheets        ║
 * ║  (parseSpreadsheetId + resolveAccessibleSpreadsheetId from              ║
 * ║  sheetsAppend.js) to guarantee it writes to the correct WMC CRM file.  ║
 * ║                                                                          ║
 * ║  Called from: services/startAllLoops.js (at server startup)            ║
 * ║  Also available via: POST /api/loops/sync-dashboard                    ║
 * ║                                                                          ║
 * ║  Column layout (A–J):                                                   ║
 * ║    A  Loop Name     B  Status    C  Frequency   D  Last Run            ║
 * ║    E  Next Run      F  Error Count  G  Last Error  H  Notes            ║
 * ║    I  Total Runs    J  Last Updated                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();

const { google } = require("googleapis");
const fs         = require("fs");
const path       = require("path");

// ── Reuse the same spreadsheet-ID helpers used by all other CRM sheets ────────
const {
  parseSpreadsheetId,
  resolveAccessibleSpreadsheetId,
} = require("../sheetsAppend");

const CREDS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./google-credentials.json";
const RAW_ID     = process.env.GOOGLE_SHEET_ID || "";

const TAB_NAME = "LoopDashboard";

const HEADERS = [
  "Loop Name",
  "Status",
  "Frequency",
  "Last Run",
  "Next Run",
  "Error Count",
  "Last Error",
  "Notes",
  "Total Runs",
  "Last Updated",
];

// ── Auth ──────────────────────────────────────────────────────────────────────

function createSheetsClient() {
  const keyFile = path.resolve(CREDS_PATH);
  if (!fs.existsSync(keyFile)) {
    throw new Error(`Google credentials file not found: ${keyFile}`);
  }
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// ── Resolve the correct spreadsheet ID (same logic as sheetsPipeline, etc.) ──

async function resolveSheetId(sheets) {
  const parsed = parseSpreadsheetId(RAW_ID);
  if (!parsed) throw new Error("GOOGLE_SHEET_ID is not set in .env");
  return resolveAccessibleSpreadsheetId(sheets, parsed);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMYT(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-MY", {
      timeZone:  "Asia/Kuala_Lumpur",
      year:      "numeric",
      month:     "short",
      day:       "2-digit",
      hour:      "2-digit",
      minute:    "2-digit",
      second:    "2-digit",
      hour12:    false,
    });
  } catch { return iso; }
}

// ── Ensure LoopDashboard tab exists ───────────────────────────────────────────

async function ensureTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "");

  if (!titles.includes(TAB_NAME)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: TAB_NAME } } }],
      },
    });
    console.log(`[LOOP DASHBOARD] Created new tab "${TAB_NAME}" in Google Sheet`);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Clear the LoopDashboard tab and rewrite all loop rows from scratch.
 * Creates the tab if it does not exist.
 * Uses the SAME spreadsheet as all other CRM operations.
 * Never throws — logs errors and returns gracefully.
 *
 * @param {Array} loops  — result of registry.getAll()
 * @returns {Promise<boolean>}  true on success, false on failure
 */
async function writeAll(loops) {
  const tag = "[LOOP DASHBOARD]";

  if (!RAW_ID) {
    console.warn(`${tag} GOOGLE_SHEET_ID not set in .env — skipping LoopDashboard write`);
    return false;
  }

  // ── Create sheets client ─────────────────────────────────────────────────
  let sheets;
  try {
    sheets = createSheetsClient();
  } catch (err) {
    console.error(`${tag} Auth error: ${err.message}`);
    return false;
  }

  // ── Resolve the real spreadsheet ID (corrects hyphen typos, etc.) ────────
  let spreadsheetId;
  try {
    spreadsheetId = await resolveSheetId(sheets);
  } catch (err) {
    console.error(`${tag} Could not resolve spreadsheet ID: ${err.message}`);
    return false;
  }

  // ── Ensure tab exists ─────────────────────────────────────────────────────
  try {
    await ensureTab(sheets, spreadsheetId);
  } catch (err) {
    console.error(`${tag} ensureTab error: ${err.message}`);
    return false;
  }

  // ── Build rows ────────────────────────────────────────────────────────────
  const now      = new Date().toISOString();
  const dataRows = loops.map((loop) => [
    loop.name,
    loop.status,
    loop.freqLabel     || "—",
    fmtMYT(loop.lastRun),
    loop.nextRun ? fmtMYT(loop.nextRun) : "—",
    String(loop.errorCount  ?? 0),
    loop.lastError     || "—",
    loop.description   || "—",
    String(loop.totalRuns   ?? 0),
    fmtMYT(now),
  ]);

  const allRows = [HEADERS, ...dataRows];

  // ── Clear tab ─────────────────────────────────────────────────────────────
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${TAB_NAME}'!A:J`,
    });
  } catch (err) {
    console.error(`${tag} Clear error: ${err.message}`);
    return false;
  }

  // ── Write headers + all loop rows ─────────────────────────────────────────
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            `'${TAB_NAME}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody:      { majorDimension: "ROWS", values: allRows },
    });
  } catch (err) {
    console.error(`${tag} Write error: ${err.message}`);
    return false;
  }

  console.log(
    `${tag} Successfully updated Google Sheet — ` +
    `${loops.length} loop(s) written to "${TAB_NAME}" tab (ID: ${spreadsheetId})`,
  );

  return true;
}

module.exports = { writeAll, TAB_NAME, HEADERS };
