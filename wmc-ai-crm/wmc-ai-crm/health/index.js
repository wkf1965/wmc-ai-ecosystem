/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Health Endpoint                              ║
 * ║                                                              ║
 * ║  GET /health  — returns the latest structured health       ║
 * ║  snapshot from systemHealth.js (updated every 10 min by   ║
 * ║  the Health Check Loop).                                   ║
 * ║                                                              ║
 * ║  Also exposes GET /health/suggestions for a quick list     ║
 * ║  of actionable fix recommendations.                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Response shape (GET /health):
 *   {
 *     status:        "OK" | "Warning" | "Critical" | "Unknown",
 *     uptime:        123456,    // seconds since server start
 *     version:       "1.0.0",
 *     memory:        { heapUsedMB: 45, heapTotalMB: 128, rssMB: 72 },
 *     lastCheckedAt: "2026-05-16T03:40:00.000Z",
 *     totalChecks:   12,
 *     okCount:       11,
 *     warningCount:  1,
 *     criticalCount: 0,
 *     checks:        [ { name, status, note, suggestion } ... ]
 *   }
 */

"use strict";

const { Router } = require("express");
const router     = Router();
const startTime  = Date.now();

const pkg = (() => {
  try { return require("../package.json"); } catch { return { version: "unknown" }; }
})();

// ── GET /health ───────────────────────────────────────────────────────────────

router.get("/", (_req, res) => {
  const systemHealth = require("./systemHealth");
  const snapshot     = systemHealth.getStatus();

  const mem = process.memoryUsage();
  const memory = {
    heapUsedMB:  Math.round(mem.heapUsed  / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    rssMB:       Math.round(mem.rss       / 1024 / 1024),
  };

  const httpStatus =
    snapshot.overallStatus === "Critical" ? 503 :
    snapshot.overallStatus === "Warning"  ? 200 : 200;

  res.status(httpStatus).json({
    status:        snapshot.overallStatus,
    uptime:        Math.round((Date.now() - startTime) / 1000),
    version:       pkg.version,
    memory,
    lastCheckedAt: snapshot.checkedAt ?? null,
    totalChecks:   snapshot.totalChecks,
    okCount:       snapshot.okCount,
    warningCount:  snapshot.warningCount,
    criticalCount: snapshot.criticalCount,
    checks:        snapshot.checks,
  });
});

// ── GET /health/suggestions ───────────────────────────────────────────────────

router.get("/suggestions", (_req, res) => {
  const systemHealth  = require("./systemHealth");
  const suggestions   = systemHealth.getSuggestions();

  res.json({
    count:       suggestions.length,
    suggestions,
  });
});

module.exports = { router };
