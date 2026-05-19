/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Notification Loop Controller                             ║
 * ║                                                                          ║
 * ║  Runs every 2 minutes. Each tick calls notificationService.run()       ║
 * ║  which:                                                                  ║
 * ║    1. Detects Hot Leads from Pipeline                                  ║
 * ║    2. Detects Appointment Confirmed from Appointments                  ║
 * ║    3. Detects Missed Appointments from Appointments                    ║
 * ║    4. Detects System Errors from Health Check Loop                     ║
 * ║    5. Detects Follow-up Loop failures from LoopRegistry                ║
 * ║    6. Logs all new events to console + NotificationLog Google Sheet    ║
 * ║    7. WhatsApp admin alert (disabled by default — set in .env)         ║
 * ║    8. Appends to logs/notificationLoop.log                             ║
 * ║                                                                          ║
 * ║  Duplicate prevention:                                                  ║
 * ║    Each event has a unique key (e.g. HOT_LEAD|{phone}).                ║
 * ║    Keys are loaded from NotificationLog sheet on startup, so no        ║
 * ║    duplicate notifications survive a server restart.                   ║
 * ║                                                                          ║
 * ║  TWO usage modes:                                                        ║
 * ║    Mode A — via startAllLoops (production): registry owns timing        ║
 * ║    Mode B — standalone (testing): node loops/notificationLoop.js       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();

const notificationService = require("../services/notificationService");

const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Single execution cycle — exposed to the LoopRegistry.
 * Returns stats; throws on hard failure so registry marks status = "error".
 */
async function run() {
  return await notificationService.run();
}

module.exports = { run, INTERVAL_MS };

// ── Standalone mode ───────────────────────────────────────────────────────────

if (require.main === module) {
  console.log("══════════════════════════════════════════════════════");
  console.log("  WMC Notification Loop — Standalone Mode");
  console.log(`  Interval : ${INTERVAL_MS / 1000}s (every 2 minutes)`);
  console.log("══════════════════════════════════════════════════════");

  let running = false;

  async function tick() {
    if (running) {
      console.log("[NOTIFICATION_LOOP] Previous cycle still running — skipping tick");
      return;
    }
    running = true;
    const t0 = Date.now();
    try {
      const result = await run();
      console.log(
        `[NOTIFICATION_LOOP] Cycle done in ${Date.now() - t0}ms — ` +
        `dispatched=${result.dispatched} errors=${result.errors}`,
      );
    } catch (err) {
      console.error("[NOTIFICATION_LOOP] Cycle error:", err.message);
    } finally {
      running = false;
    }
  }

  tick();
  const timer = setInterval(tick, INTERVAL_MS);

  process.on("SIGINT",  () => { clearInterval(timer); console.log("\n[NOTIFICATION_LOOP] Stopped."); process.exit(0); });
  process.on("SIGTERM", () => { clearInterval(timer); process.exit(0); });
}
