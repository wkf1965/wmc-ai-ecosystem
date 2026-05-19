/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Health Check Loop                            ║
 * ║                                                              ║
 * ║  Runs every 10 minutes. Calls healthCheckService.run()     ║
 * ║  then:                                                      ║
 * ║    • Updates health/systemHealth.js (in-memory state)      ║
 * ║    • Appends a JSON line to logs/healthCheck.log           ║
 * ║    • Prints a one-line console summary                     ║
 * ║    • Prints [CRITICAL] / [WARNING] details if needed       ║
 * ║                                                              ║
 * ║  POLICY: read-only checks only. Never edits or deletes     ║
 * ║           any CRM data, sheet rows, or code files.         ║
 * ║                                                              ║
 * ║  Called from: services/loopBootstrap.js (via LoopRegistry) ║
 * ║  Can also be run standalone: node loops/healthCheckLoop.js ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();

const fs   = require("fs");
const path = require("path");

const LOOP_NAME   = "Health Check Loop";
const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const LOG_FILE = path.join(__dirname, "../logs/healthCheck.log");

// Ensure logs directory exists before writing
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ── Log helpers ───────────────────────────────────────────────────────────────

/**
 * Append one JSON line to logs/healthCheck.log.
 * Each line is a self-contained health snapshot.
 */
function appendLog(summary) {
  try {
    const entry = {
      time:          summary.checkedAt,
      overallStatus: summary.overallStatus,
      ok:            summary.okCount,
      warning:       summary.warningCount,
      critical:      summary.criticalCount,
      checks:        summary.checks.map((c) => ({
        name:       c.name,
        status:     c.status,
        note:       c.note,
        suggestion: c.suggestion || undefined,
      })),
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    console.error(`[${LOOP_NAME}] Log write failed:`, err.message);
  }
}

// ── Console reporter ──────────────────────────────────────────────────────────

function printSummary(summary) {
  const { STATUS } = require("../services/healthCheckService");

  const tag =
    summary.overallStatus === STATUS.CRITICAL ? "[CRITICAL]" :
    summary.overallStatus === STATUS.WARNING  ? "[WARNING]"  :
                                                "[OK]";

  const ts = new Date(summary.checkedAt).toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    hour12: false,
  });

  console.log(
    `[${LOOP_NAME}] ${tag} ${summary.okCount} OK | ` +
    `${summary.warningCount} Warning | ${summary.criticalCount} Critical ` +
    `— checked at ${ts}`,
  );

  if (summary.criticalCount > 0) {
    const criticals = summary.checks.filter((c) => c.status === STATUS.CRITICAL);
    for (const c of criticals) {
      console.error(`  [CRITICAL] ${c.name}: ${c.note}`);
      if (c.suggestion) console.error(`             Suggestion: ${c.suggestion}`);
    }
  }

  if (summary.warningCount > 0) {
    const warnings = summary.checks.filter((c) => c.status === STATUS.WARNING);
    for (const c of warnings) {
      console.warn(`  [WARNING]  ${c.name}: ${c.note}`);
      if (c.suggestion) console.warn(`             Suggestion: ${c.suggestion}`);
    }
  }
}

// ── Main run function ─────────────────────────────────────────────────────────

/**
 * Execute one full health check cycle.
 * Called directly by the LoopRegistry on each interval tick.
 *
 * @returns {Promise<object>} the health summary object
 */
async function run() {
  const healthCheckService = require("../services/healthCheckService");
  const systemHealth       = require("../health/systemHealth");

  const summary = await healthCheckService.run();

  // 1. Update in-memory state (for /health endpoint)
  systemHealth.update(summary);

  // 2. Write to log file
  appendLog(summary);

  // 3. Print to console
  printSummary(summary);

  return summary;
}

// ── Standalone timer (used when NOT managed by LoopRegistry) ─────────────────

/** Start the loop on a standalone setInterval (skips LoopRegistry). */
function start() {
  if (global._healthCheckLoopTimer) {
    console.warn(`[${LOOP_NAME}] Already running — skipped duplicate start`);
    return;
  }

  console.log(`[${LOOP_NAME}] Starting — interval: ${INTERVAL_MS / 60_000} min`);

  // First cycle runs 3 s after startup to let the server fully boot
  setTimeout(
    () => run().catch((err) => console.error(`[${LOOP_NAME}] Run error:`, err.message)),
    3_000,
  );

  global._healthCheckLoopTimer = setInterval(
    () => run().catch((err) => console.error(`[${LOOP_NAME}] Run error:`, err.message)),
    INTERVAL_MS,
  );
}

/** Stop the standalone timer. */
function stop() {
  if (global._healthCheckLoopTimer) {
    clearInterval(global._healthCheckLoopTimer);
    global._healthCheckLoopTimer = null;
  }
  console.log(`[${LOOP_NAME}] Stopped`);
}

module.exports = { start, stop, run, LOOP_NAME, INTERVAL_MS };

// ── Standalone entry point ────────────────────────────────────────────────────
// Run once immediately if called directly: node loops/healthCheckLoop.js

if (require.main === module) {
  console.log(`[${LOOP_NAME}] Running standalone one-shot check…`);
  run()
    .then((summary) => {
      console.log(`\n[${LOOP_NAME}] Done — overall: ${summary.overallStatus}`);
      process.exit(summary.overallStatus === "Critical" ? 1 : 0);
    })
    .catch((err) => {
      console.error(`[${LOOP_NAME}] Fatal:`, err.message);
      process.exit(1);
    });
}
