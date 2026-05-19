/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Start All Loops                                          ║
 * ║                                                                          ║
 * ║  Single entry point that registers, starts, and writes all 6 AI        ║
 * ║  loops to the LoopDashboard Google Sheet.                               ║
 * ║                                                                          ║
 * ║  Called from server.js:                                                 ║
 * ║    const { start: startAllLoops } = require('./services/startAllLoops');║
 * ║    startAllLoops();                                                      ║
 * ║                                                                          ║
 * ║  Loops registered:                                                       ║
 * ║    1. Follow-up Loop        — Every 1 min                               ║
 * ║    2. Lead Scoring Loop     — Every 1 min                               ║
 * ║    3. Appointment Loop      — Every 5 min                               ║
 * ║    4. Health Check Loop     — Every 10 min                              ║
 * ║    5. Memory Loop           — Every 30 min                              ║
 * ║    6. Notification Loop     — Every 30 sec                              ║
 * ║                                                                          ║
 * ║  Sheet: LoopDashboard tab in Google Sheets                              ║
 * ║  Monitor: GET /api/loops                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();

const registry             = require("./loopRegistry");
const loopDashboardService = require("./loopDashboardService");

// ── Loop run functions ────────────────────────────────────────────────────────

async function runFollowUp() {
  const { run } = require("./followupService");
  await run();
}

async function runLeadScoring() {
  const { run } = require("./leadScoringService");
  await run();
}

async function runAppointments() {
  const { run } = require("../loops/appointmentLoop");
  await run();
}

async function runHealthCheck() {
  const { run } = require("./healthCheckService");
  const systemHealth = require("../health/systemHealth");
  const fs   = require("fs");
  const path = require("path");

  const summary = await run();
  systemHealth.update(summary);

  const logFile = path.join(__dirname, "../logs/healthCheck.log");
  const line = JSON.stringify({
    time:          summary.checkedAt,
    overallStatus: summary.overallStatus,
    ok:            summary.okCount,
    warning:       summary.warningCount,
    critical:      summary.criticalCount,
  }) + "\n";
  try { fs.appendFileSync(logFile, line, "utf8"); } catch { /* non-fatal */ }

  const tag =
    summary.overallStatus === "Critical" ? "[CRITICAL]" :
    summary.overallStatus === "Warning"  ? "[WARNING]"  : "[OK]";
  console.log(
    `[HealthCheckLoop] ${tag} ${summary.okCount} OK | ` +
    `${summary.warningCount} Warning | ${summary.criticalCount} Critical`,
  );
  if (summary.criticalCount > 0) {
    for (const c of summary.checks.filter((x) => x.status === "Critical")) {
      console.error(`  [CRITICAL] ${c.name}: ${c.note}`);
      if (c.suggestion) console.error(`             Suggestion: ${c.suggestion}`);
    }
  }
}

async function runMemory() {
  const { run } = require("./memoryService");
  return await run();
}

async function runNotification() {
  const { run } = require("./notificationService");
  return await run();
}

// ── Loop definitions ──────────────────────────────────────────────────────────

const LOOP_DEFS = [
  {
    id:          "followup",
    name:        "Follow-up Loop",
    description: "Scans Follow Up Queue every 1 min. Sends AI-personalized WhatsApp to PENDING leads past 24 h. Updates Pipeline + logs.",
    freqMs:      1 * 60 * 1000,
    freqLabel:   "Every 1 min",
    runFn:       runFollowUp,
  },
  {
    id:          "leadScoring",
    name:        "Lead Scoring Loop",
    description: "Re-scores every pipeline lead every 1 min using category, behaviour signals, and time decay. Upgrades Cold→Warm→Hot. Never downgrades Hot Lead.",
    freqMs:      1 * 60 * 1000,
    freqLabel:   "Every 1 min",
    runFn:       runLeadScoring,
  },
  {
    id:          "appointment",
    name:        "Appointment Loop",
    description: "Scans Appointments tab every 5 min. Sends 24h + 1h WhatsApp reminders. Marks Today/Missed. Queues missed in Follow Up Queue. Updates Pipeline stage.",
    freqMs:      5 * 60 * 1000,
    freqLabel:   "Every 5 min",
    runFn:       runAppointments,
  },
  {
    id:          "healthCheck",
    name:        "Health Check Loop",
    description: "Runs 12 checks every 10 min: webhook, Sheets, 4 sheet tabs, AI reply quality, duplicate/empty replies, API errors, and loop status. Logs to logs/healthCheck.log. Read-only.",
    freqMs:      10 * 60 * 1000,
    freqLabel:   "Every 10 min",
    runFn:       runHealthCheck,
  },
  {
    id:          "memory",
    name:        "Memory Loop",
    description: "Reads Leads, Pipeline, Appointments, FollowUpQueue every 5 min. Merges & upserts 13-column customer memory records. Never deletes existing data.",
    freqMs:      5 * 60 * 1000,
    freqLabel:   "Every 5 min",
    runFn:       runMemory,
  },
  {
    id:          "notification",
    name:        "Notification Loop",
    description: "Scans Pipeline + Appointments every 2 min for 5 alert types: Hot Lead, Appt Confirmed, Missed Appt, System Error, Follow-up Failed. Logs to NotificationLog sheet.",
    freqMs:      2 * 60 * 1000,
    freqLabel:   "Every 2 min",
    runFn:       runNotification,
  },
];

// ── Console tag map ───────────────────────────────────────────────────────────

const LOOP_TAG = {
  followup:     "[FOLLOWUP LOOP]",
  leadScoring:  "[LEAD SCORING LOOP]",
  appointment:  "[APPOINTMENT LOOP]",
  healthCheck:  "[HEALTH CHECK LOOP]",
  memory:       "[MEMORY LOOP]",
  notification: "[NOTIFICATION LOOP]",
};

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Register, start, and force-write all loops to LoopDashboard.
 * Call once from server.js inside app.listen().
 */
async function start() {
  console.log("─────────────────────────────────────────────────────");
  console.log("[START ALL LOOPS] Starting loop system...");
  console.log(`[START ALL LOOPS] ${LOOP_DEFS.length} loops defined`);
  console.log("─────────────────────────────────────────────────────");

  // ── Step 1: Register all loops ────────────────────────────────────────────
  for (const def of LOOP_DEFS) {
    registry.register(def);
    console.log(`[LOOP REGISTRY] Registered ${def.name}`);
    // Extra confirmation log for Memory + Notification (newly added loops)
    if (def.id === "memory")       console.log(`[LOOP DASHBOARD] Memory Loop registered`);
    if (def.id === "notification") console.log(`[LOOP DASHBOARD] Notification Loop registered`);
  }

  // ── Step 2: Start all loops ───────────────────────────────────────────────
  console.log("─────────────────────────────────────────────────────");

  const started = [];
  const failed  = [];

  for (const def of LOOP_DEFS) {
    try {
      registry.start(def.id);
      const tag = LOOP_TAG[def.id] || `[${def.id.toUpperCase()} LOOP]`;
      console.log(`  ${tag} Started — ${def.freqLabel}`);
      started.push(def.id);
    } catch (err) {
      console.error(`  [LOOP ERROR] ${def.name}: ${err.message}`);
      failed.push(def.id);
    }
  }

  // ── Step 3: Force-write all loops to LoopDashboard Google Sheet ───────────
  // Uses clear+rewrite — guaranteed to show all rows even on first boot.
  // Creates the LoopDashboard tab automatically if it does not exist.
  console.log("─────────────────────────────────────────────────────");
  console.log("[LOOP DASHBOARD] Writing all loops to Google Sheet...");

  try {
    await loopDashboardService.writeAll(registry.getAll());
    // Success message is printed inside writeAll() as:
    // "[LOOP DASHBOARD] Successfully updated Google Sheet — 6 loop(s) written to "LoopDashboard" tab"
  } catch (err) {
    console.error("[LOOP DASHBOARD] writeAll error (non-fatal):", err.message);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("─────────────────────────────────────────────────────");
  console.log(`[START ALL LOOPS] ${started.length} loop(s) running`);
  if (failed.length > 0) {
    console.error(`[START ALL LOOPS] Failed to start: ${failed.join(", ")}`);
  }
  console.log("[START ALL LOOPS] Monitor  : GET /api/loops");
  console.log("[START ALL LOOPS] Dashboard: POST /api/loops/sync-dashboard");
  console.log("[START ALL LOOPS] Sheet    : LoopDashboard tab in Google Sheets");
  console.log("─────────────────────────────────────────────────────");
}

module.exports = { start, LOOP_DEFS };
