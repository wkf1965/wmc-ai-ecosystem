/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Follow-Up Loop Controller                                ║
 * ║                                                                          ║
 * ║  Runs every 1 minute. Each tick calls followupService.run() which:      ║
 * ║    1. Scans "Follow Up Queue" Google Sheet for PENDING rows past due     ║
 * ║    2. Generates a personalized AI follow-up message (DeepSeek)          ║
 * ║    3. Sends via WhatsApp (WHAPI)                                         ║
 * ║    4. Marks row SENT in Follow Up Queue                                  ║
 * ║    5. Updates Pipeline "LastFollowUp"                                    ║
 * ║    6. Writes to logs/followup.log                                        ║
 * ║    7. Updates LoopDashboard via the registry                             ║
 * ║                                                                          ║
 * ║  TWO usage modes:                                                        ║
 * ║                                                                          ║
 * ║  Mode A — via loopBootstrap (recommended, used in production):           ║
 * ║    The bootstrap registers this loop's runFn in loopRegistry.            ║
 * ║    The registry owns the setInterval, LoopDashboard sync, error count.  ║
 * ║                                                                          ║
 * ║  Mode B — standalone (for testing):                                      ║
 * ║    node loops/followupLoop.js                                             ║
 * ║    Starts its own timer without needing the full server.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();

const followupService = require("../services/followupService");

// ── Interval ──────────────────────────────────────────────────────────────────

/** How often the loop fires (1 minute as requested). */
const INTERVAL_MS = 1 * 60 * 1000;

/**
 * Single execution cycle exposed to the registry.
 * Throws on hard failures so the registry can mark status = "error".
 */
async function run() {
  const result = await followupService.run();
  // Attach stats to the thrown error or return them for logging
  return result;
}

module.exports = { run, INTERVAL_MS };

// ── Standalone mode ───────────────────────────────────────────────────────────

if (require.main === module) {
  console.log("══════════════════════════════════════════");
  console.log("  WMC Follow-Up Loop — Standalone Mode");
  console.log(`  Interval : ${INTERVAL_MS / 1000}s (every 1 minute)`);
  console.log("══════════════════════════════════════════");

  let running = false;

  async function tick() {
    if (running) {
      console.log("[FOLLOWUP_LOOP] Previous cycle still running — skipping tick");
      return;
    }
    running = true;
    const t0 = Date.now();
    try {
      const result = await run();
      console.log(
        `[FOLLOWUP_LOOP] Cycle done in ${Date.now() - t0}ms — sent=${result.sent} errors=${result.errors}`,
      );
    } catch (err) {
      console.error("[FOLLOWUP_LOOP] ❌ Cycle error:", err.message);
    } finally {
      running = false;
    }
  }

  // First tick immediately, then every INTERVAL_MS
  tick();
  const timer = setInterval(tick, INTERVAL_MS);

  // Graceful shutdown
  process.on("SIGINT",  () => { clearInterval(timer); console.log("\n[FOLLOWUP_LOOP] Stopped."); process.exit(0); });
  process.on("SIGTERM", () => { clearInterval(timer); process.exit(0); });
}
