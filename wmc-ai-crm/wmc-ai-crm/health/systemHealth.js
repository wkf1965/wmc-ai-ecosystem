/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — System Health State                          ║
 * ║                                                              ║
 * ║  Lightweight in-process singleton that holds the latest    ║
 * ║  health check summary produced by healthCheckService.      ║
 * ║                                                              ║
 * ║  Updated every 10 minutes by loops/healthCheckLoop.js.     ║
 * ║  Read by health/index.js for the GET /health endpoint.     ║
 * ║                                                              ║
 * ║  POLICY: read-only store. Never edits or deletes data.     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

"use strict";

const STATUS = {
  OK:       "OK",
  WARNING:  "Warning",
  CRITICAL: "Critical",
  UNKNOWN:  "Unknown",
};

let _lastSummary    = null;
let _lastUpdatedAt  = null;

// ── Write side (called by healthCheckLoop) ────────────────────────────────────

/**
 * Store the latest health summary from healthCheckService.run().
 *
 * @param {object} summary  — return value of healthCheckService.run()
 */
function update(summary) {
  _lastSummary   = summary;
  _lastUpdatedAt = new Date().toISOString();
}

// ── Read side ─────────────────────────────────────────────────────────────────

/**
 * Return the full latest health summary, or a "not yet checked" placeholder.
 *
 * @returns {{
 *   overallStatus:  string;
 *   checkedAt:      string | null;
 *   completedAt:    string | null;
 *   lastUpdatedAt:  string | null;
 *   totalChecks:    number;
 *   okCount:        number;
 *   warningCount:   number;
 *   criticalCount:  number;
 *   checks:         Array<{ name: string; status: string; note: string; suggestion: string }>;
 * }}
 */
function getStatus() {
  if (!_lastSummary) {
    return {
      overallStatus: STATUS.UNKNOWN,
      note:          "Health check has not run yet — first cycle runs within 3 seconds of server start",
      checkedAt:     null,
      completedAt:   null,
      lastUpdatedAt: null,
      totalChecks:   0,
      okCount:       0,
      warningCount:  0,
      criticalCount: 0,
      checks:        [],
    };
  }

  return {
    ..._lastSummary,
    lastUpdatedAt: _lastUpdatedAt,
  };
}

/** @returns {"OK" | "Warning" | "Critical" | "Unknown"} */
function getOverallStatus() {
  return _lastSummary?.overallStatus ?? STATUS.UNKNOWN;
}

/** @returns {boolean} true if the last check completed without Critical items */
function isHealthy() {
  const s = getOverallStatus();
  return s === STATUS.OK || s === STATUS.WARNING;
}

/** @returns {Array} checks that are in Critical state */
function getCriticalChecks() {
  return (_lastSummary?.checks ?? []).filter((c) => c.status === STATUS.CRITICAL);
}

/** @returns {Array} checks that are in Warning state */
function getWarningChecks() {
  return (_lastSummary?.checks ?? []).filter((c) => c.status === STATUS.WARNING);
}

/**
 * Return all actionable suggestions from failed checks.
 *
 * @returns {Array<{ check: string; status: string; suggestion: string }>}
 */
function getSuggestions() {
  return (_lastSummary?.checks ?? [])
    .filter((c) => c.suggestion && c.suggestion.trim() !== "")
    .map((c) => ({
      check:      c.name,
      status:     c.status,
      suggestion: c.suggestion,
    }));
}

module.exports = {
  update,
  getStatus,
  getOverallStatus,
  isHealthy,
  getCriticalChecks,
  getWarningChecks,
  getSuggestions,
  STATUS,
};
