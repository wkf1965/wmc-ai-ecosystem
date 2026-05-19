/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — API Module                                    ║
 * ║                                                              ║
 * ║  Purpose: Express router definitions for all HTTP           ║
 * ║  endpoints beyond the core WhatsApp webhook.                ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Planned endpoints:
 *
 *   GET  /health              — server + dependency health
 *   GET  /api/dashboard       — live CRM metrics JSON
 *   GET  /api/leads           — list all leads (paginated)
 *   GET  /api/leads/:phone    — single lead detail
 *   POST /api/leads/:phone    — manually update lead
 *   GET  /api/appointments    — list today's appointments
 *   POST /api/send            — manual WhatsApp send (staff tool)
 *   GET  /api/campaigns       — list campaigns + stats
 *   POST /api/campaigns/run   — trigger campaign immediately
 *   GET  /api/memory/:phone   — fetch customer memory
 *
 * Current routes in src/app.js:
 *   POST /webhook  — WHAPI inbound handler
 *   GET  /health   — basic health check
 *
 * TODO:
 *   - Create api/leads.js, api/appointments.js, api/campaigns.js
 *   - Add JWT auth middleware for staff-only endpoints
 *   - Register routes in src/app.js
 */

"use strict";

const { Router } = require("express");
const router     = Router();

// ── Placeholder routes ────────────────────────────────────────────────────────

router.get("/dashboard", async (_req, res) => {
  // TODO: Wire to dashboard/index.js → getDashboardMetrics()
  res.json({ status: "stub", message: "Dashboard API not yet implemented" });
});

router.get("/leads", async (_req, res) => {
  // TODO: Read Pipeline sheet and return paginated list
  res.json({ status: "stub", leads: [], total: 0 });
});

router.get("/leads/:phone", async (req, res) => {
  // TODO: loadPipelineByPhone + loadMemoryByPhone
  res.json({ status: "stub", phone: req.params.phone, data: null });
});

router.get("/appointments", async (_req, res) => {
  // TODO: Read Appointments sheet, filter today's
  res.json({ status: "stub", appointments: [] });
});

router.post("/send", async (req, res) => {
  // TODO: Validate staff auth, call whatsapp.service.sendMessage()
  res.json({ status: "stub", message: "Manual send not yet implemented" });
});

module.exports = router;
