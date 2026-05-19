/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Loop Registry                                 ║
 * ║                                                              ║
 * ║  Singleton that tracks runtime state for every AI loop:     ║
 * ║  status, timing, error count, last log entry.               ║
 * ║                                                              ║
 * ║  After every state change (start / stop / cycle complete /  ║
 * ║  error) the registry fires a fire-and-forget sync to the   ║
 * ║  "LoopDashboard" Google Sheet tab via loopDashboardSheet.  ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   const registry = require('./services/loopRegistry');
 *   registry.register({ id: 'followup', name: 'Follow-up Loop', ... });
 *   registry.start('followup');
 */

"use strict";

const EventEmitter = require("events");

class LoopRegistry extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, import('./loopRegistry').LoopEntry>} */
    this._loops = new Map();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Register a loop definition (does NOT start it automatically).
   *
   * @param {{
   *   id:          string;
   *   name:        string;
   *   description?: string;
   *   freqMs:      number;
   *   freqLabel?:  string;
   *   runFn:       () => Promise<void>;
   * }} config
   */
  register(config) {
    if (this._loops.has(config.id)) {
      console.warn(`[LoopRegistry] Loop "${config.id}" already registered — skipping`);
      return this;
    }

    const entry = {
      id:          config.id,
      name:        config.name,
      description: config.description || "",
      freqMs:      config.freqMs,
      freqLabel:   config.freqLabel || `${Math.round(config.freqMs / 60000)} min`,
      runFn:       config.runFn,
      // Runtime state
      status:      "stopped",
      lastRun:     null,
      nextRun:     null,
      totalRuns:   0,
      errorCount:  0,
      lastError:   null,
      // Private
      _timer:      null,
      _running:    false,
      _logs:       [],
    };

    this._loops.set(config.id, entry);
    console.log(`[LoopRegistry] Registered: ${config.name}`);
    return this;
  }

  /** Start a loop by id. */
  start(id) {
    const entry = this._require(id);
    if (entry._timer) {
      console.warn(`[LoopRegistry] "${id}" is already running`);
      return;
    }

    entry.status  = "running";
    entry.nextRun = new Date(Date.now() + entry.freqMs).toISOString();

    // First cycle fires after 1 second (let server finish booting)
    const cycle = () => this._cycle(id);
    setTimeout(cycle, 1000);
    entry._timer = setInterval(cycle, entry.freqMs);

    this.emit("start", { id, name: entry.name });
    this._syncSheet(entry); // update sheet: status = running
    console.log(`[LoopRegistry] Started: ${entry.name}`);
  }

  /** Stop a loop by id. */
  stop(id) {
    const entry = this._require(id);
    if (entry._timer) { clearInterval(entry._timer); entry._timer = null; }
    entry.status  = "stopped";
    entry.nextRun = null;
    this.emit("stop", { id, name: entry.name });
    this._syncSheet(entry); // update sheet: status = stopped
    console.log(`[LoopRegistry] Stopped: ${entry.name}`);
  }

  /** Restart a loop (stop + start after 200 ms). */
  restart(id) {
    this.stop(id);
    setTimeout(() => this.start(id), 200);
    console.log(`[LoopRegistry] Restarting: ${id}`);
  }

  /** Get safe view of one loop's state. */
  get(id) {
    return this._safeView(this._require(id));
  }

  /** Get safe views for all loops. */
  getAll() {
    return [...this._loops.values()].map((e) => this._safeView(e));
  }

  /** Get all log entries for one loop (last N, newest first). */
  getLogs(id, limit = 50) {
    const entry = this._require(id);
    return [...(entry._logs || [])].reverse().slice(0, limit);
  }

  /**
   * Write every registered loop to the LoopDashboard sheet immediately.
   * Call this once on server startup so all rows are seeded.
   */
  async initDashboard() {
    const entries = [...this._loops.values()];
    if (entries.length === 0) return;
    try {
      const { syncAll } = require("./loopDashboardSheet");
      await syncAll(entries);
    } catch (err) {
      console.error("[LoopRegistry] initDashboard error:", err.message);
    }
  }

  /**
   * Force-sync ALL registered loops to the LoopDashboard Google Sheet.
   * Safe to call at any time — useful for a manual refresh via the API.
   *
   * @returns {Promise<{ synced: number; errors: string[] }>}
   */
  async syncAllToSheet() {
    const entries = [...this._loops.values()];
    const errors  = [];
    let synced    = 0;

    const { syncLoopRow } = require("./loopDashboardSheet");

    for (const entry of entries) {
      try {
        await syncLoopRow(entry);
        synced++;
      } catch (err) {
        errors.push(`${entry.name}: ${err.message}`);
        console.error(`[LoopRegistry] syncAllToSheet failed for "${entry.name}":`, err.message);
      }
    }

    console.log(`[LoopRegistry] Force-sync done — ${synced}/${entries.length} loops written to LoopDashboard`);
    return { synced, errors };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  async _cycle(id) {
    const entry = this._loops.get(id);
    if (!entry || entry._running) return; // skip overlapping run

    entry._running = true;
    const start    = Date.now();

    try {
      await entry.runFn();

      const elapsed   = Date.now() - start;
      entry.lastRun   = new Date().toISOString();
      entry.nextRun   = new Date(Date.now() + entry.freqMs).toISOString();
      entry.totalRuns++;
      entry.status    = "running";

      this._addLog(entry, "info", `Cycle completed in ${elapsed}ms`);
      this.emit("cycle-complete", { id, name: entry.name, elapsed });
    } catch (err) {
      entry.errorCount++;
      entry.lastError = err.message;
      entry.status    = "error";
      entry.lastRun   = new Date().toISOString();
      entry.nextRun   = new Date(Date.now() + entry.freqMs).toISOString();

      this._addLog(entry, "error", err.message);
      this.emit("error", { id, name: entry.name, error: err.message });
      console.error(`[LoopRegistry] Error in ${entry.name}:`, err.message);
    } finally {
      entry._running = false;
      this._syncSheet(entry); // update sheet after every cycle (success or error)
    }
  }

  /** Fire-and-forget sheet sync — never blocks the loop. */
  _syncSheet(entry) {
    try {
      const { syncLoopRow } = require("./loopDashboardSheet");
      syncLoopRow(entry).catch((err) =>
        console.error(`[LoopRegistry] Sheet sync failed for "${entry.name}":`, err.message),
      );
    } catch (err) {
      // loopDashboardSheet may not be resolvable in test environments
      console.warn("[LoopRegistry] Could not load loopDashboardSheet:", err.message);
    }
  }

  _addLog(entry, level, message) {
    entry._logs.push({
      time:    new Date().toISOString(),
      loop:    entry.name,
      level,
      message,
    });
    // Keep last 200 entries per loop
    if (entry._logs.length > 200) entry._logs.splice(0, entry._logs.length - 200);
  }

  _require(id) {
    const entry = this._loops.get(id);
    if (!entry) throw new Error(`Loop "${id}" not registered`);
    return entry;
  }

  _safeView(entry) {
    return {
      id:          entry.id,
      name:        entry.name,
      description: entry.description,
      freqLabel:   entry.freqLabel,
      status:      entry.status,
      lastRun:     entry.lastRun,
      nextRun:     entry.nextRun,
      totalRuns:   entry.totalRuns,
      errorCount:  entry.errorCount,
      lastError:   entry.lastError,
    };
  }
}

module.exports = new LoopRegistry();
