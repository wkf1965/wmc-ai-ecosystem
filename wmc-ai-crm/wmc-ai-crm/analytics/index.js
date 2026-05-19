/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Analytics Module                              ║
 * ║                                                              ║
 * ║  Purpose: Aggregates CRM data into actionable insights      ║
 * ║  for the clinic management team.                            ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Reports planned:
 *
 *   📊 Daily Summary
 *     - New leads today
 *     - Appointments booked today
 *     - Follow-ups sent
 *     - Conversion rate (inquiry → appointment)
 *
 *   📈 Weekly Funnel Report
 *     Cold → Warm → Hot → Converted → Patient
 *     Shows where leads are dropping off
 *
 *   🗂️ Category Breakdown
 *     Pain / Psychology / TCM / Stroke / Nursing Home
 *     Which service generates the most leads?
 *
 *   ⏱️ Response Time Analysis
 *     Average time between customer message and AI reply
 *
 *   📅 Appointment No-show Rate
 *     Confirmed appointments vs actual Patient Visit conversions
 *
 * TODO:
 *   - Schedule daily summary to run at 11 PM MYT
 *   - Write summary to Analytics Google Sheet tab
 *   - Send daily summary to clinic WhatsApp group
 */

"use strict";

/**
 * Generate a daily summary report.
 *
 * @param {Date} [date] — defaults to today
 * @returns {Promise<object>}
 */
async function getDailySummary(date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10);
  console.log(`[Analytics] ⚠️  getDailySummary(${dateStr}) — stub`);

  // TODO: Query Pipeline, Appointments, Follow Up Queue sheets for today's activity
  return {
    date:              dateStr,
    newLeads:          0,
    appointmentsBooked: 0,
    followUpsSent:     0,
    conversions:       0,
    conversionRate:    "0%",
  };
}

/**
 * Generate a lead funnel breakdown.
 *
 * @returns {Promise<object>}
 */
async function getFunnelReport() {
  console.log("[Analytics] ⚠️  getFunnelReport() — stub");

  return {
    cold:      0,
    warm:      0,
    hot:       0,
    converted: 0,
    patient:   0,
  };
}

/**
 * Generate a category breakdown.
 *
 * @returns {Promise<object>}
 */
async function getCategoryBreakdown() {
  console.log("[Analytics] ⚠️  getCategoryBreakdown() — stub");
  return {};
}

module.exports = { getDailySummary, getFunnelReport, getCategoryBreakdown };
