/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Dashboard Module                              ║
 * ║                                                              ║
 * ║  Purpose: Provides real-time CRM metrics, charts, and       ║
 * ║  data for an optional web-based admin dashboard.            ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Current dashboard output: Google Sheets "Dashboard" tab
 *   → Managed by: src/services/dashboard.service.js
 *
 * Future web dashboard (planned):
 *   - Express routes in api/dashboard.js
 *   - Real-time metrics via Server-Sent Events or WebSocket
 *   - Charts: Lead funnel, conversion rate, appointment rate
 *   - Accessible at: http://localhost:3000/dashboard
 *
 * Metrics planned:
 *   totalLeads          — all unique phones in Pipeline
 *   coldLeads           — Lead Status = Cold Lead
 *   warmLeads           — Lead Status = Warm Lead
 *   hotLeads            — Lead Status = Hot Lead
 *   converted           — Lead Status = Converted
 *   patients            — Lead Status = Patient
 *   appointmentsToday   — Appointments with parsedStart = today
 *   followUpsPending    — Follow Up Queue status = PENDING
 *   campaignsSent       — Campaigns sent today
 *
 * TODO:
 *   - Implement getDashboardMetrics() pulling from Google Sheets
 *   - Build Express router in api/dashboard.js
 *   - Add a simple HTML/JS frontend (optional, lightweight)
 */

"use strict";

/**
 * Aggregate CRM metrics from all sheets.
 *
 * @returns {Promise<object>}
 */
async function getDashboardMetrics() {
  // TODO: Read Pipeline, Appointments, Follow Up Queue, Campaigns sheets
  // TODO: Aggregate counts by status/stage
  console.log("[Dashboard] ⚠️  getDashboardMetrics() stub — not yet wired to sheets");

  return {
    timestamp:         new Date().toISOString(),
    totalLeads:        0,
    coldLeads:         0,
    warmLeads:         0,
    hotLeads:          0,
    converted:         0,
    patients:          0,
    appointmentsToday: 0,
    followUpsPending:  0,
    campaignsSent:     0,
  };
}

module.exports = { getDashboardMetrics };
