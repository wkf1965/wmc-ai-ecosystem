/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Loop Status API                               ║
 * ║                                                              ║
 * ║  REST endpoints for querying and controlling AI loops.      ║
 * ║                                                              ║
 * ║  Mount in src/app.js:                                        ║
 * ║    const loopApi = require('../api/loopStatusApi');          ║
 * ║    app.use('/api/loops', loopApi);                           ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Endpoints:
 *   GET  /api/loops            — list all loops + runtime state
 *   GET  /api/loops/:id        — single loop detail
 *   GET  /api/loops/:id/logs   — recent log entries for one loop
 *   POST /api/loops/:id/start  — start a stopped loop
 *   POST /api/loops/:id/stop   — stop a running loop
 *   POST /api/loops/:id/restart — restart a loop
 */

"use strict";

const { Router } = require("express");
const router     = Router();

// Registry singleton — safe to require (it is not yet started by this file)
let registry;
try {
  registry = require("../services/loopRegistry");
} catch (e) {
  console.warn("[LoopStatusApi] Could not load loopRegistry:", e.message);
}

/** CORS helper for local dev (localhost:5173 / 3000) */
router.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});
router.options("*", (_req, res) => res.sendStatus(204));

// ── Helpers ──────────────────────────────────────────────────────────────────

function notFound(res, id) {
  return res.status(404).json({ error: `Loop "${id}" not found` });
}

function registryError(res) {
  return res.status(503).json({ error: "Loop registry not available" });
}

// ── Routes ───────────────────────────────────────────────────────────────────

/** GET /api/loops — list all loops */
router.get("/", (_req, res) => {
  if (!registry) return registryError(res);

  const loops = registry.getAll();
  const running = loops.filter((l) => l.status === "running").length;
  const errored = loops.filter((l) => l.status === "error").length;
  const stopped = loops.filter((l) => l.status === "stopped").length;

  res.json({
    summary: { total: loops.length, running, errored, stopped },
    loops,
    timestamp: new Date().toISOString(),
  });
});

/** GET /api/loops/:id — single loop */
router.get("/:id", (req, res) => {
  if (!registry) return registryError(res);
  try {
    const loop = registry.get(req.params.id);
    res.json(loop);
  } catch {
    notFound(res, req.params.id);
  }
});

/** GET /api/loops/:id/logs — last 50 log entries for a loop */
router.get("/:id/logs", (req, res) => {
  if (!registry) return registryError(res);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const logs = registry.getLogs(req.params.id, limit);
    res.json({ id: req.params.id, count: logs.length, logs });
  } catch {
    notFound(res, req.params.id);
  }
});

/** POST /api/loops/:id/start */
router.post("/:id/start", (req, res) => {
  if (!registry) return registryError(res);
  try {
    registry.start(req.params.id);
    res.json({ ok: true, action: "start", id: req.params.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** POST /api/loops/:id/stop */
router.post("/:id/stop", (req, res) => {
  if (!registry) return registryError(res);
  try {
    registry.stop(req.params.id);
    res.json({ ok: true, action: "stop", id: req.params.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** POST /api/loops/:id/restart */
router.post("/:id/restart", (req, res) => {
  if (!registry) return registryError(res);
  try {
    registry.restart(req.params.id);
    res.json({ ok: true, action: "restart", id: req.params.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/loops/sync-dashboard
 * Force-writes ALL registered loops to the LoopDashboard Google Sheet.
 * Use this to refresh the sheet without restarting the server.
 * Useful when rows are missing or stale.
 */
router.post("/sync-dashboard", async (_req, res) => {
  if (!registry) return registryError(res);
  try {
    const result = await registry.syncAllToSheet();
    res.json({
      ok:      true,
      action:  "sync-dashboard",
      synced:  result.synced,
      errors:  result.errors,
      loops:   registry.getAll(),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
