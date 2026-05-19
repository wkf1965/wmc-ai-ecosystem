const express = require("express");
const webhookRouter  = require("./routes/webhook");
const loopStatusApi  = require("../api/loopStatusApi");
const { router: healthRouter } = require("../health/index");

const app = express();

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * Health endpoint — returns latest systemHealth snapshot (updated every 10 min
 * by the Health Check Loop). Also exposes GET /health/suggestions.
 */
app.use("/health", healthRouter);

/** WHAPI webhook — verification (GET) + incoming messages (POST). */
app.use("/webhook", webhookRouter);

/** Loop Management API — GET /api/loops, POST /api/loops/:id/restart … */
app.use("/api/loops", loopStatusApi);

/** 404 fallback. */
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

module.exports = app;
