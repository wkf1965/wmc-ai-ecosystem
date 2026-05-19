/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Health Check Service                                     ║
 * ║                                                                          ║
 * ║  Read-only diagnostic service. Checks every critical system component  ║
 * ║  and returns a structured report with status levels:                   ║
 * ║    OK       — component is healthy                                     ║
 * ║    Warning  — degraded / partial issue / soft failure                  ║
 * ║    Critical — component is down or producing incorrect output          ║
 * ║                                                                          ║
 * ║  POLICY: This service never writes, edits, or deletes any data.        ║
 * ║           It only reads state and returns diagnostic results.          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Checks performed each cycle:
 *   1.  WhatsApp Webhook         — HTTP ping to localhost /health
 *   2.  Google Sheets Connection — spreadsheets.get() meta call
 *   3.  Leads Sheet              — read access to Sheet1 tab
 *   4.  Pipeline Sheet           — read access to Pipeline tab
 *   5.  FollowUpQueue Sheet      — read access to Follow Up Queue tab
 *   6.  LoopDashboard Sheet      — read access to LoopDashboard tab
 *   7.  Latest AI Reply          — checks most recent reply is not empty
 *   8.  Duplicate Replies        — scans last 50 rows for phone+reply duplicates
 *   9.  Empty Replies            — % of recent entries missing an AI reply
 *   10. API Errors               — reads loop registry error state
 *   11. Follow-up Loop Running   — checks loop registry status for "followup"
 *   12. Lead Scoring Loop Running— checks loop registry status for "leadScoring"
 */

"use strict";

require("dotenv").config();

const { google } = require("googleapis");
const fs         = require("fs");
const path       = require("path");

const axios = (() => { try { return require("axios"); } catch { return null; } })();

// ── Config ────────────────────────────────────────────────────────────────────

const SHEET_ID   = process.env.GOOGLE_SHEET_ID    || "";
const CREDS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./google-credentials.json";
const PORT       = Number(process.env.PORT)        || 3000;

const LEADS_TAB   = String(process.env.GOOGLE_SHEET_TAB          || "Sheet1").trim();
const PIPELINE_TAB = String(process.env.GOOGLE_SHEET_PIPELINE_TAB || "Pipeline").trim();

const SHEETS_TO_CHECK = [
  { name: "Leads",         tab: LEADS_TAB },
  { name: "Pipeline",      tab: PIPELINE_TAB },
  { name: "FollowUpQueue", tab: "Follow Up Queue" },
  { name: "LoopDashboard", tab: "LoopDashboard" },
];

// ── Status constants ──────────────────────────────────────────────────────────

const STATUS = {
  OK:       "OK",
  WARNING:  "Warning",
  CRITICAL: "Critical",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a read-only Google Sheets client. Returns null if not configured. */
function createReadonlySheets() {
  const keyFile = path.resolve(CREDS_PATH);
  if (!SHEET_ID || !fs.existsSync(keyFile)) return null;

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

/** Build a blank check result object. */
function blankCheck(name) {
  return { name, status: STATUS.OK, note: "", suggestion: "" };
}

// ── Individual Checks ─────────────────────────────────────────────────────────

/**
 * 1. WhatsApp Webhook
 *    Sends an HTTP GET to localhost /health and verifies the server responds.
 *    A healthy CRM server must respond 200 on this endpoint.
 */
async function checkWebhookStatus() {
  const check = blankCheck("WhatsApp Webhook");

  if (!axios) {
    check.status     = STATUS.WARNING;
    check.note       = "axios not available — cannot test webhook endpoint";
    check.suggestion = "Run: npm install axios";
    return check;
  }

  try {
    const t0  = Date.now();
    const res = await axios.get(`http://localhost:${PORT}/health`, { timeout: 5_000 });
    const ms  = Date.now() - t0;

    if (res.status === 200) {
      check.status = STATUS.OK;
      check.note   = `Webhook server responding OK (${ms}ms)`;
    } else {
      check.status     = STATUS.WARNING;
      check.note       = `Unexpected HTTP ${res.status} from /health endpoint`;
      check.suggestion = "Check Express health route in src/app.js";
    }
  } catch (err) {
    check.status     = STATUS.CRITICAL;
    check.note       = `Webhook unreachable: ${err.message}`;
    check.suggestion = `Start server on port ${PORT}: node server.js`;
  }

  return check;
}

/**
 * 2. Google Sheets Connection
 *    Calls spreadsheets.get() to confirm API auth and spreadsheet access.
 */
async function checkGoogleSheetsConnection() {
  const check = blankCheck("Google Sheets Connection");

  if (!SHEET_ID) {
    check.status     = STATUS.CRITICAL;
    check.note       = "GOOGLE_SHEET_ID is not set in .env";
    check.suggestion = "Add GOOGLE_SHEET_ID=<your-spreadsheet-id> to .env";
    return check;
  }

  const keyFile = path.resolve(CREDS_PATH);
  if (!fs.existsSync(keyFile)) {
    check.status     = STATUS.CRITICAL;
    check.note       = `Credentials file not found: ${keyFile}`;
    check.suggestion = `Place google-credentials.json at ${keyFile}`;
    return check;
  }

  const sheets = createReadonlySheets();
  try {
    const t0   = Date.now();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: "spreadsheetId,sheets.properties.title",
    });
    const ms       = Date.now() - t0;
    const tabCount = (meta.data.sheets ?? []).length;

    check.status = STATUS.OK;
    check.note   = `Connected — ${tabCount} tab(s) accessible (${ms}ms)`;
    check._tabs  = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "");
  } catch (err) {
    check.status     = STATUS.CRITICAL;
    check.note       = `Sheets API error: ${err.message}`;
    check.suggestion = "Verify service account permissions — it must have editor access to the spreadsheet";
  }

  return check;
}

/**
 * 3–6. Individual sheet tab checks
 *       Reads A1:Z2 to confirm the tab exists and headers are present.
 */
async function checkSheet(sheetInfo) {
  const check = blankCheck(`${sheetInfo.name} Sheet`);

  const sheets = createReadonlySheets();
  if (!sheets) {
    check.status = STATUS.WARNING;
    check.note   = "Sheets client unavailable — credentials or SHEET_ID missing";
    return check;
  }

  try {
    const res  = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${sheetInfo.tab}'!A1:Z2`,
    });
    const rows = res.data.values ?? [];

    if (rows.length === 0) {
      check.status     = STATUS.WARNING;
      check.note       = `Tab "${sheetInfo.tab}" exists but is empty`;
      check.suggestion = `Populate the "${sheetInfo.tab}" tab with headers and data`;
    } else {
      check.status = STATUS.OK;
      check.note   = `Tab "${sheetInfo.tab}" accessible — ${rows[0].length} column(s) found`;
    }
  } catch (err) {
    if (err.message?.includes("Unable to parse range") || err.message?.includes("not found")) {
      check.status     = STATUS.WARNING;
      check.note       = `Tab "${sheetInfo.tab}" does not exist in this spreadsheet`;
      check.suggestion = `Create a tab named exactly "${sheetInfo.tab}" in your Google Sheet`;
    } else {
      check.status     = STATUS.CRITICAL;
      check.note       = `Read error for "${sheetInfo.tab}": ${err.message}`;
      check.suggestion = "Check sheet permissions and service account access";
    }
  }

  return check;
}

/**
 * 7. Latest AI Reply
 *    Reads the last row of the Leads sheet and verifies the reply (column H) is not empty.
 *    An empty reply on the most recent entry may indicate the AI pipeline failed.
 */
async function checkLatestAIReply() {
  const check = blankCheck("Latest AI Reply");

  const sheets = createReadonlySheets();
  if (!sheets) {
    check.status = STATUS.WARNING;
    check.note   = "Skipped — Sheets client not available";
    return check;
  }

  try {
    const res  = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${LEADS_TAB}'!A2:I1001`,
    });
    const rows = res.data.values ?? [];

    if (rows.length === 0) {
      check.status     = STATUS.WARNING;
      check.note       = "No entries found in Leads sheet — no messages have been received yet";
      check.suggestion = "Send a test WhatsApp message to confirm webhook is receiving data";
      return check;
    }

    const lastRow     = rows[rows.length - 1];
    const lastReply   = (lastRow[7] ?? "").trim(); // Column H = reply
    const lastTs      = lastRow[0] ?? "unknown time";

    if (!lastReply) {
      check.status     = STATUS.WARNING;
      check.note       = `Latest entry (${lastTs}) has no AI reply in column H`;
      check.suggestion = "Check DEEPSEEK_API_KEY and AI service connectivity — the reply may have failed silently";
    } else {
      const preview    = lastReply.length > 80 ? lastReply.substring(0, 80) + "…" : lastReply;
      check.status     = STATUS.OK;
      check.note       = `Last reply at ${lastTs}: "${preview}"`;
    }
  } catch (err) {
    check.status     = STATUS.WARNING;
    check.note       = `Cannot read Leads sheet: ${err.message}`;
    check.suggestion = `Ensure the "${LEADS_TAB}" tab exists with column layout A–I`;
  }

  return check;
}

/**
 * 8. Duplicate Replies
 *    Scans the last 50 Leads rows for identical reply text sent to the same phone number.
 *    More than 5 duplicates in 50 rows indicates a replay/dedup failure.
 */
async function checkDuplicateReplies() {
  const check = blankCheck("Duplicate Replies");

  const sheets = createReadonlySheets();
  if (!sheets) {
    check.status = STATUS.WARNING;
    check.note   = "Skipped — Sheets client not available";
    return check;
  }

  try {
    const res  = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${LEADS_TAB}'!A2:I1001`,
    });
    const rows = res.data.values ?? [];

    if (rows.length < 2) {
      check.status = STATUS.OK;
      check.note   = "Not enough entries to check for duplicates";
      return check;
    }

    const recent      = rows.slice(-50);
    const seen        = {};
    let duplicateCount = 0;

    for (const row of recent) {
      const phone = (row[6] ?? "").trim();   // Column G = phone
      const reply = (row[7] ?? "").trim();   // Column H = reply

      if (!phone || !reply) continue;

      const key = `${phone}::${reply.substring(0, 120)}`;
      if (seen[key]) {
        duplicateCount++;
      } else {
        seen[key] = true;
      }
    }

    if (duplicateCount > 5) {
      check.status     = STATUS.CRITICAL;
      check.note       = `${duplicateCount} duplicate replies found in last 50 entries`;
      check.suggestion = "Inspect webhook deduplication logic — check for missing idempotency key or double-processing";
    } else if (duplicateCount > 0) {
      check.status     = STATUS.WARNING;
      check.note       = `${duplicateCount} possible duplicate(s) in last 50 entries — may be retried webhooks`;
      check.suggestion = "Monitor over the next cycle — if count grows, add duplicate message-id checking";
    } else {
      check.status = STATUS.OK;
      check.note   = "No duplicate replies detected in last 50 entries";
    }
  } catch (err) {
    check.status = STATUS.WARNING;
    check.note   = `Duplicate scan error: ${err.message}`;
  }

  return check;
}

/**
 * 9. Empty Replies
 *    Counts the percentage of the last 50 Leads rows that have an empty reply column.
 *    ≥ 50% empty → Critical.  20–49% → Warning.  < 20% → OK.
 */
async function checkEmptyReplies() {
  const check = blankCheck("Empty Replies");

  const sheets = createReadonlySheets();
  if (!sheets) {
    check.status = STATUS.WARNING;
    check.note   = "Skipped — Sheets client not available";
    return check;
  }

  try {
    const res  = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${LEADS_TAB}'!A2:I1001`,
    });
    const rows = res.data.values ?? [];

    if (rows.length === 0) {
      check.status = STATUS.OK;
      check.note   = "No entries to scan";
      return check;
    }

    const recent      = rows.slice(-50);
    const emptyCount  = recent.filter((row) => !(row[7] ?? "").trim()).length;
    const emptyPct    = Math.round((emptyCount / recent.length) * 100);
    const label       = `${emptyCount}/${recent.length} recent entries (${emptyPct}%) have no AI reply`;

    if (emptyPct >= 50) {
      check.status     = STATUS.CRITICAL;
      check.note       = label;
      check.suggestion = "AI reply generation is failing for the majority of messages — verify DEEPSEEK_API_KEY and API quota";
    } else if (emptyPct >= 20) {
      check.status     = STATUS.WARNING;
      check.note       = label;
      check.suggestion = "Elevated empty-reply rate — check server logs for AI errors or rate-limiting";
    } else {
      check.status = STATUS.OK;
      check.note   = `Empty reply rate: ${emptyPct}% (${emptyCount}/${recent.length} entries) — within normal range`;
    }
  } catch (err) {
    check.status = STATUS.WARNING;
    check.note   = `Empty reply scan error: ${err.message}`;
  }

  return check;
}

/**
 * 10. API Errors
 *     Reads the loop registry's in-memory error counters.
 *     Any loop in "error" status → Critical.  Accumulated errors → Warning.
 */
async function checkAPIErrors() {
  const check = blankCheck("API Errors");

  try {
    const registry       = require("./loopRegistry");
    const loops          = registry.getAll();
    const erroredLoops   = loops.filter((l) => l.errorCount > 0);
    const criticalLoops  = erroredLoops.filter((l) => l.status === "error");

    if (criticalLoops.length > 0) {
      const detail     = criticalLoops.map((l) => `${l.name} (${l.lastError || "unknown error"})`).join("; ");
      check.status     = STATUS.CRITICAL;
      check.note       = `${criticalLoops.length} loop(s) in error state: ${detail}`;
      check.suggestion = "Restart affected loops via POST /api/loops/<id>/restart or check server logs";
    } else if (erroredLoops.length > 0) {
      const totalErrors = erroredLoops.reduce((s, l) => s + l.errorCount, 0);
      check.status      = STATUS.WARNING;
      check.note        = `${totalErrors} cumulative API error(s) across ${erroredLoops.length} loop(s) since startup`;
      check.suggestion  = "Review console logs for error patterns — may be transient network failures";
    } else {
      check.status = STATUS.OK;
      check.note   = "No API errors recorded in loop registry";
    }
  } catch (err) {
    check.status     = STATUS.WARNING;
    check.note       = `Cannot read loop registry: ${err.message}`;
    check.suggestion = "Ensure loopBootstrap has initialised the LoopRegistry singleton";
  }

  return check;
}

/**
 * 11–12. Loop running status
 *         Checks the loop registry for the given loop ID.
 */
async function checkLoopRunning(loopId, displayName) {
  const check = blankCheck(displayName);

  try {
    const registry = require("./loopRegistry");
    const loop     = registry.get(loopId);

    if (loop.status === "running") {
      const lastRunStr = loop.lastRun
        ? new Date(loop.lastRun).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour12: false })
        : "not yet";
      check.status = STATUS.OK;
      check.note   = `Running — last run: ${lastRunStr} | ${loop.totalRuns} cycle(s) | ${loop.errorCount} error(s)`;
    } else if (loop.status === "error") {
      check.status     = STATUS.CRITICAL;
      check.note       = `Loop is in error state — last error: ${loop.lastError || "unknown"}`;
      check.suggestion = `Restart: POST /api/loops/${loopId}/restart`;
    } else {
      check.status     = STATUS.WARNING;
      check.note       = `Loop is "${loop.status}" — not currently running`;
      check.suggestion = `Start: POST /api/loops/${loopId}/start`;
    }
  } catch (err) {
    check.status     = STATUS.WARNING;
    check.note       = `Loop "${loopId}" is not registered: ${err.message}`;
    check.suggestion = `Ensure "${displayName}" is registered in services/loopBootstrap.js`;
  }

  return check;
}

// ── Main run ──────────────────────────────────────────────────────────────────

/**
 * Run all health checks and return a structured summary.
 *
 * @returns {Promise<{
 *   overallStatus: "OK" | "Warning" | "Critical";
 *   checkedAt:     string;
 *   completedAt:   string;
 *   totalChecks:   number;
 *   okCount:       number;
 *   warningCount:  number;
 *   criticalCount: number;
 *   checks:        Array<{ name: string; status: string; note: string; suggestion: string }>;
 * }>}
 */
async function run() {
  const checkedAt = new Date().toISOString();
  const results   = [];

  // 1. WhatsApp webhook
  results.push(await checkWebhookStatus());

  // 2. Google Sheets connection
  const sheetsConn = await checkGoogleSheetsConnection();
  results.push(sheetsConn);

  // 3–6. Individual sheet tabs (skip if connection is down — would all fail anyway)
  if (sheetsConn.status !== STATUS.CRITICAL) {
    for (const sheetInfo of SHEETS_TO_CHECK) {
      results.push(await checkSheet(sheetInfo));
    }

    // 7–9. AI reply quality checks
    results.push(await checkLatestAIReply());
    results.push(await checkDuplicateReplies());
    results.push(await checkEmptyReplies());
  } else {
    // Insert skipped placeholders so the check count stays consistent
    for (const sheetInfo of SHEETS_TO_CHECK) {
      results.push({
        name:       `${sheetInfo.name} Sheet`,
        status:     STATUS.WARNING,
        note:       "Skipped — Google Sheets connection is down",
        suggestion: sheetsConn.suggestion,
      });
    }
    results.push({ name: "Latest AI Reply",   status: STATUS.WARNING, note: "Skipped — Google Sheets connection is down", suggestion: "" });
    results.push({ name: "Duplicate Replies", status: STATUS.WARNING, note: "Skipped — Google Sheets connection is down", suggestion: "" });
    results.push({ name: "Empty Replies",     status: STATUS.WARNING, note: "Skipped — Google Sheets connection is down", suggestion: "" });
  }

  // 10. API errors
  results.push(await checkAPIErrors());

  // 11. Follow-up loop
  results.push(await checkLoopRunning("followup",    "Follow-up Loop Running"));

  // 12. Lead scoring loop
  results.push(await checkLoopRunning("leadScoring", "Lead Scoring Loop Running"));

  // ── Overall status ──────────────────────────────────────────────────────────
  const hasCritical = results.some((r) => r.status === STATUS.CRITICAL);
  const hasWarning  = results.some((r) => r.status === STATUS.WARNING);

  const overallStatus = hasCritical
    ? STATUS.CRITICAL
    : hasWarning
      ? STATUS.WARNING
      : STATUS.OK;

  return {
    overallStatus,
    checkedAt,
    completedAt:  new Date().toISOString(),
    totalChecks:  results.length,
    okCount:      results.filter((r) => r.status === STATUS.OK).length,
    warningCount: results.filter((r) => r.status === STATUS.WARNING).length,
    criticalCount: results.filter((r) => r.status === STATUS.CRITICAL).length,
    checks: results,
  };
}

module.exports = { run, STATUS };
