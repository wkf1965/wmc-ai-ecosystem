/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Memory Loop Controller                                   ║
 * ║                                                                          ║
 * ║  Runs every 5 minutes. Each tick calls memoryService.run() which:      ║
 * ║    1. Reads Sheet1 (Leads) — latest message per customer               ║
 * ║    2. Reads Pipeline       — lead status, pipeline stage               ║
 * ║    3. Reads Appointments   — most recent appointment date              ║
 * ║    4. Reads FollowUpQueue  — main problem, follow-up status            ║
 * ║    5. Merges into one record per phone (keeps existing if new empty)   ║
 * ║    6. Batch-updates Memory sheet (A–M) via single API call             ║
 * ║    7. Appends new rows for first-time customers                        ║
 * ║    8. Logs results to logs/memoryLoop.log                              ║
 * ║                                                                          ║
 * ║  Memory schema (A–M):                                                   ║
 * ║    A  Phone     B  Name         C  ServiceInterest   D  LeadStatus     ║
 * ║    E  LastMessageSummary        F  LastReply (webhook-managed)          ║
 * ║    G  LastContactTime  H  MainProblem   I  PipelineStage               ║
 * ║    J  AppointmentDate  K  PreferredLanguage  L  FollowUpStatus         ║
 * ║    M  Notes (user-managed — never overwritten)                          ║
 * ║                                                                          ║
 * ║  TWO usage modes:                                                        ║
 * ║    Mode A — via startAllLoops (production): registry owns timing        ║
 * ║    Mode B — standalone (testing): node loops/memoryLoop.js             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();

const memoryService = require("../services/memoryService");

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Single execution cycle — exposed to the LoopRegistry.
 * Returns stats for logging; throws on hard failure so registry marks "error".
 */
async function run() {
  return await memoryService.run();
}

module.exports = { run, INTERVAL_MS };

// ── Standalone mode ───────────────────────────────────────────────────────────

if (require.main === module) {
  console.log("══════════════════════════════════════════════════");
  console.log("  WMC Memory Loop — Standalone Mode");
  console.log(`  Interval : ${INTERVAL_MS / 1000}s (every 5 minutes)`);
  console.log("══════════════════════════════════════════════════");

  let running = false;

  async function tick() {
    if (running) {
      console.log("[MEMORY_LOOP] Previous cycle still running — skipping tick");
      return;
    }
    running = true;
    const t0 = Date.now();
    try {
      const result = await run();
      console.log(
        `[MEMORY_LOOP] Cycle done in ${Date.now() - t0}ms — ` +
        `updated=${result.updated} created=${result.created} errors=${result.errors}`,
      );
    } catch (err) {
      console.error("[MEMORY_LOOP] Cycle error:", err.message);
    } finally {
      running = false;
    }
  }

  // First tick immediately, then every INTERVAL_MS
  tick();
  const timer = setInterval(tick, INTERVAL_MS);

  process.on("SIGINT",  () => { clearInterval(timer); console.log("\n[MEMORY_LOOP] Stopped."); process.exit(0); });
  process.on("SIGTERM", () => { clearInterval(timer); process.exit(0); });
}
