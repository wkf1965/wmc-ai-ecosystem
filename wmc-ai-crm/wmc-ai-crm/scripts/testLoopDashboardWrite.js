/**
 * Force-writes all 6 loop rows to the LoopDashboard tab in the WMC AI CRM
 * Google Sheet. Run this whenever the sheet needs to be refreshed without
 * restarting the server.
 *
 * Run with:
 *   node scripts/testLoopDashboardWrite.js
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { parseSpreadsheetId, resolveAccessibleSpreadsheetId } = require("../sheetsAppend");
const { writeAll, TAB_NAME } = require("../services/loopDashboardService");
const { google } = require("googleapis");
const fs   = require("fs");
const path = require("path");

const RAW_ID     = process.env.GOOGLE_SHEET_ID || "";
const CREDS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./google-credentials.json";

const now = new Date().toISOString();
const nextMin   = (n) => new Date(Date.now() + n * 60 * 1000).toISOString();

// All 6 loops — matches startAllLoops.js LOOP_DEFS exactly
const allLoops = [
  {
    name:        "Follow-up Loop",
    status:      "running",
    freqLabel:   "Every 1 min",
    lastRun:     now,
    nextRun:     nextMin(1),
    errorCount:  0,
    lastError:   null,
    description: "Scans Follow Up Queue every 1 min. Sends AI-personalized WhatsApp to PENDING leads past 24 h. Updates Pipeline + logs.",
    totalRuns:   0,
  },
  {
    name:        "Lead Scoring Loop",
    status:      "running",
    freqLabel:   "Every 1 min",
    lastRun:     now,
    nextRun:     nextMin(1),
    errorCount:  0,
    lastError:   null,
    description: "Re-scores every pipeline lead every 1 min. Upgrades Cold→Warm→Hot. Never downgrades Hot Lead.",
    totalRuns:   0,
  },
  {
    name:        "Appointment Loop",
    status:      "running",
    freqLabel:   "Every 5 min",
    lastRun:     now,
    nextRun:     nextMin(5),
    errorCount:  0,
    lastError:   null,
    description: "Scans Appointments tab every 5 min. Sends 24h + 1h WhatsApp reminders. Marks Today/Missed.",
    totalRuns:   0,
  },
  {
    name:        "Health Check Loop",
    status:      "running",
    freqLabel:   "Every 10 min",
    lastRun:     now,
    nextRun:     nextMin(10),
    errorCount:  0,
    lastError:   null,
    description: "Runs 12 system checks every 10 min. Logs to healthCheck.log. Read-only.",
    totalRuns:   0,
  },
  {
    name:        "Memory Loop",
    status:      "running",
    freqLabel:   "Every 5 min",
    lastRun:     now,
    nextRun:     nextMin(5),
    errorCount:  0,
    lastError:   null,
    description: "Reads Leads, Pipeline, Appointments, FollowUpQueue every 5 min. Merges customer memory records.",
    totalRuns:   0,
  },
  {
    name:        "Notification Loop",
    status:      "running",
    freqLabel:   "Every 2 min",
    lastRun:     now,
    nextRun:     nextMin(2),
    errorCount:  0,
    lastError:   null,
    description: "Detects Hot Lead, Appt Confirmed, Missed Appt, System Error, Follow-up Failed every 2 min. Logs to NotificationLog sheet.",
    totalRuns:   0,
  },
];

(async () => {
  console.log("[LOOP DASHBOARD TEST] ─────────────────────────────────────────");
  console.log("[LOOP DASHBOARD TEST] WMC AI CRM — All 6 Loops Dashboard Write");

  // Show the spreadsheet ID that will be used
  let resolvedId = "(could not resolve)";
  try {
    const keyFile = path.resolve(CREDS_PATH);
    if (!fs.existsSync(keyFile)) throw new Error(`Credentials not found: ${keyFile}`);
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    resolvedId = await resolveAccessibleSpreadsheetId(sheets, parseSpreadsheetId(RAW_ID));
  } catch (err) {
    console.error(`[LOOP DASHBOARD TEST] Could not resolve spreadsheet ID: ${err.message}`);
  }

  console.log(`[LOOP DASHBOARD TEST] Using spreadsheet ID : ${resolvedId}`);
  console.log(`[LOOP DASHBOARD TEST] Writing to tab       : ${TAB_NAME}`);
  console.log(`[LOOP DASHBOARD TEST] Loops to write       : ${allLoops.length}`);
  allLoops.forEach((l) => console.log(`[LOOP DASHBOARD TEST]   • ${l.name} | ${l.status} | ${l.freqLabel}`));
  console.log("[LOOP DASHBOARD TEST] ─────────────────────────────────────────");

  const ok = await writeAll(allLoops);

  if (ok) {
    console.log("[LOOP DASHBOARD TEST] ─────────────────────────────────────────");
    console.log("[LOOP DASHBOARD TEST] Write successful to existing WMC AI CRM sheet");
    console.log(`[LOOP DASHBOARD TEST] Open Google Sheet → "${TAB_NAME}" tab`);
    console.log("[LOOP DASHBOARD TEST] You should now see all 6 loops:");
    allLoops.forEach((l) => console.log(`[LOOP DASHBOARD TEST]   ✓ ${l.name}`));
    console.log("[LOOP DASHBOARD TEST] ─────────────────────────────────────────");
    process.exit(0);
  } else {
    console.error("[LOOP DASHBOARD TEST] Write FAILED — check errors above");
    process.exit(1);
  }
})();
