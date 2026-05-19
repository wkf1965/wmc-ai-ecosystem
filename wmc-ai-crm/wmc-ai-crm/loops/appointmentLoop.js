/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Appointment Loop Controller                              ║
 * ║                                                                          ║
 * ║  Fires every 5 minutes. Each tick calls appointmentService.run()        ║
 * ║  which:                                                                  ║
 * ║    1. Reads all rows from the Appointments Google Sheet tab             ║
 * ║    2. Sends 24h WhatsApp reminder when appointment is tomorrow          ║
 * ║    3. Sends 1h WhatsApp reminder when appointment is in ~1 hour         ║
 * ║    4. Marks appointment as "Today Appointment" on the day               ║
 * ║    5. Marks missed appointments (T+2h, no attendance) → "Missed"       ║
 * ║    6. Adds missed appointments to Follow Up Queue for rescheduling      ║
 * ║    7. Updates Pipeline stage + leadType for confirmed appointments      ║
 * ║    8. Appends cycle entry to logs/appointmentLoop.log                   ║
 * ║                                                                          ║
 * ║  Duplicate-reminder prevention: status is written back to the           ║
 * ║  Appointments sheet after every reminder, so reminders cannot repeat   ║
 * ║  even after a server restart.                                           ║
 * ║                                                                          ║
 * ║  TWO usage modes:                                                        ║
 * ║    Mode A — via loopBootstrap (production):                             ║
 * ║      loopBootstrap registers the runFn; the registry owns the timer.   ║
 * ║    Mode B — standalone (testing):                                       ║
 * ║      node loops/appointmentLoop.js                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();

const fs   = require("fs");
const path = require("path");

const LOOP_NAME   = "Appointment Loop";
const INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

const LOG_FILE = path.join(__dirname, "../logs/appointmentLoop.log");

// Ensure logs directory exists
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ── Structured logger ─────────────────────────────────────────────────────────

function appendLog(entry) {
  try {
    const line = JSON.stringify({ time: new Date().toISOString(), ...entry }) + "\n";
    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch (err) {
    console.error(`[${LOOP_NAME}] Log write failed:`, err.message);
  }
}

// ── Main run function ─────────────────────────────────────────────────────────

/**
 * Single execution cycle — exposed to the LoopRegistry as runFn.
 * Throws on hard failures (auth error, sheet unreadable) so the registry
 * can mark the loop as "error".
 *
 * @returns {Promise<object>} cycle stats from appointmentService
 */
async function run() {
  const appointmentService = require("../services/appointmentService");

  const stats = await appointmentService.run();

  // Append cycle entry to log file
  appendLog({
    action:       "cycle",
    scanned:      stats.scanned,
    reminders24h: stats.reminders24h,
    reminders1h:  stats.reminders1h,
    markedToday:  stats.markedToday,
    markedMissed: stats.markedMissed,
    queued:       stats.queuedReschedule,
    errors:       stats.errors,
  });

  return stats;
}

module.exports = { run, LOOP_NAME, INTERVAL_MS };

// ── Standalone mode ───────────────────────────────────────────────────────────

if (require.main === module) {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  WMC AI CRM — Appointment Loop  (Standalone Mode)");
  console.log(`  Interval : every ${INTERVAL_MS / 60_000} minutes`);
  console.log("  Checks   : 24h reminder | 1h reminder | Today | Missed");
  console.log("  Log file : logs/appointmentLoop.log");
  console.log("═══════════════════════════════════════════════════════");

  let running = false;

  async function tick() {
    if (running) {
      console.log(`[${LOOP_NAME}] Previous cycle still running — skipping tick`);
      return;
    }
    running = true;
    const t0 = Date.now();
    try {
      const stats = await run();
      console.log(
        `[${LOOP_NAME}] Cycle done in ${Date.now() - t0}ms — ` +
        `scanned=${stats.scanned} ` +
        `24h=${stats.reminders24h} 1h=${stats.reminders1h} ` +
        `today=${stats.markedToday} missed=${stats.markedMissed} ` +
        `queued=${stats.queuedReschedule} errors=${stats.errors}`,
      );
    } catch (err) {
      console.error(`[${LOOP_NAME}] ❌ Cycle error:`, err.message);
    } finally {
      running = false;
    }
  }

  // First tick 2s after start, then every INTERVAL_MS
  setTimeout(tick, 2_000);
  const timer = setInterval(tick, INTERVAL_MS);

  process.on("SIGINT",  () => { clearInterval(timer); console.log(`\n[${LOOP_NAME}] Stopped.`); process.exit(0); });
  process.on("SIGTERM", () => { clearInterval(timer); process.exit(0); });
}
