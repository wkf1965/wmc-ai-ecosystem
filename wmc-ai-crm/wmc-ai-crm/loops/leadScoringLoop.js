/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Lead Scoring Loop Controller                             ║
 * ║                                                                          ║
 * ║  Fires every 1 minute. Each tick calls leadScoringService.run()         ║
 * ║  which:                                                                  ║
 * ║    1. Bulk-reads Pipeline + Memory tabs from Google Sheets              ║
 * ║    2. Computes a fresh score (0-100) for every lead using:              ║
 * ║         • Category base score                                            ║
 * ║         • Pipeline stage bonus                                           ║
 * ║         • Message behaviour signals (price, appt intent, confirmations) ║
 * ║         • Time decay (silent ≥ 3 days → −20, ≥ 7 days → −10)          ║
 * ║         • Recency bonus (active ≤ 1 day → +10)                         ║
 * ║    3. Classifies: score ≥ 70 → Hot, ≥ 35 → Warm, < 35 → Cold          ║
 * ║    4. Applies never-downgrade rule (Hot Lead cannot revert)             ║
 * ║    5. Writes updated leadType back to Pipeline only if upgraded         ║
 * ║    6. Appends structured entry to logs/leadScoring.log                  ║
 * ║    7. LoopDashboard updated automatically via loopRegistry              ║
 * ║                                                                          ║
 * ║  TWO usage modes:                                                        ║
 * ║    Mode A — via loopBootstrap (production): registry owns the timer     ║
 * ║    Mode B — standalone: node loops/leadScoringLoop.js                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Scoring table (quick reference):
 *   Confirmed appointment              +50
 *   Appointment intent in message      +30
 *   Pipeline: Appointment Booked       +30
 *   Specialist category (Stroke/NH)    +20
 *   Hot confirmation keywords          +20
 *   Specialist category (Pain/Psych)   +15
 *   Asked about price                  +10
 *   Pipeline: Assessment Interested    +10
 *   Fast reply (≤ 1 day)               +10
 *   General inquiry base               +5
 *   Silent 3–6 days                    −20
 *   Silent 7+ days (stacked)           −30
 *
 *   Score ≥ 70  → Hot Lead
 *   Score ≥ 35  → Warm Lead
 *   Score <  35 → Cold Lead
 */

"use strict";

require("dotenv").config();

const leadScoringService = require("../services/leadScoringService");

// ── Interval ──────────────────────────────────────────────────────────────────

/** Every 1 minute as requested. */
const INTERVAL_MS = 1 * 60 * 1000;

/**
 * Single execution cycle — exposed to the loopRegistry as runFn.
 * Throws on hard failures so the registry marks the loop as "error".
 */
async function run() {
  return await leadScoringService.run();
}

module.exports = { run, INTERVAL_MS };

// ── Standalone mode ───────────────────────────────────────────────────────────

if (require.main === module) {
  console.log("══════════════════════════════════════════════════");
  console.log("  WMC Lead Scoring Loop — Standalone Mode");
  console.log(`  Interval  : ${INTERVAL_MS / 1000}s (every 1 minute)`);
  console.log(`  Thresholds: Hot ≥ ${leadScoringService.HOT_THRESHOLD} | Warm ≥ ${leadScoringService.WARM_THRESHOLD}`);
  console.log("══════════════════════════════════════════════════");

  let running = false;

  async function tick() {
    if (running) {
      console.log("[SCORING_LOOP] Previous cycle still running — skipping tick");
      return;
    }
    running = true;
    const t0 = Date.now();
    try {
      const result = await run();
      console.log(
        `[SCORING_LOOP] Cycle done in ${Date.now() - t0}ms — ` +
        `total=${result.total} upgraded=${result.upgraded} ` +
        `protected=${result.protected} unchanged=${result.unchanged} errors=${result.errors}`,
      );
    } catch (err) {
      console.error("[SCORING_LOOP] ❌ Cycle error:", err.message);
    } finally {
      running = false;
    }
  }

  // Immediate first tick, then every INTERVAL_MS
  tick();
  const timer = setInterval(tick, INTERVAL_MS);

  process.on("SIGINT",  () => { clearInterval(timer); console.log("\n[SCORING_LOOP] Stopped."); process.exit(0); });
  process.on("SIGTERM", () => { clearInterval(timer); process.exit(0); });
}
