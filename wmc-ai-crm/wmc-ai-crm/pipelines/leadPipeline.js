/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Lead Pipeline                                 ║
 * ║                                                              ║
 * ║  Purpose: Defines the full lifecycle of a lead from first   ║
 * ║  WhatsApp contact through to becoming a patient.            ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Pipeline stages:
 *
 *   [New Inquiry]
 *        │  classify message → category, score
 *        ▼
 *   [Contacted]
 *        │  AI reply sent, lead saved to Sheet1 + Pipeline
 *        ▼
 *   [Assessment Interested]
 *        │  lead asks about price / treatment / timing
 *        ▼
 *   [Appointment Booked]
 *        │  lead confirms date/time
 *        ▼
 *   [Patient Visit]       ← Converted: arrived at clinic
 *        │
 *        ▼
 *   [Long-term Care]      ← Patient: admitted / ongoing treatment
 *        │
 *        ▼
 *   [Closed / Won]
 *
 * Each stage transition may:
 *   - Update Pipeline sheet
 *   - Cancel Follow-Up Queue
 *   - Trigger a campaign message
 *   - Notify clinical staff
 */

"use strict";

const STAGES = [
  "New Inquiry",
  "Contacted",
  "Assessment Interested",
  "Appointment Booked",
  "Patient Visit",
  "Long-term Care",
  "Closed / Won",
  "Closed / Lost",
];

const STAGE_RANK = Object.fromEntries(STAGES.map((s, i) => [s, i]));

/**
 * Advance a lead to a new stage (never downgrade).
 *
 * @param {{ phone: string; currentStage: string }} lead
 * @param {string} targetStage
 * @returns {{ phone: string; stage: string; changed: boolean }}
 */
function advanceStage(lead, targetStage) {
  const curRank = STAGE_RANK[lead.currentStage] ?? 0;
  const tgtRank = STAGE_RANK[targetStage]        ?? 0;

  if (tgtRank <= curRank) {
    return { phone: lead.phone, stage: lead.currentStage, changed: false };
  }

  console.log(`[LeadPipeline] ${lead.phone}: ${lead.currentStage} → ${targetStage}`);
  return { phone: lead.phone, stage: targetStage, changed: true };
}

/**
 * Full pipeline run for one incoming WhatsApp message.
 *
 * @param {{
 *   phone:         string;
 *   message:       string;
 *   category:      string;
 *   leadStatus:    string;
 *   nextAction:    string;
 *   pipelineStage: string;
 *   existingLead:  object | null;
 * }} opts
 */
async function process(opts) {
  const { phone, category, leadStatus, nextAction, pipelineStage, existingLead } = opts;

  // TODO: Load existing lead from Pipeline sheet (done in crm.service.js today)
  // TODO: Compute target stage from classify.service results
  // TODO: Call advanceStage()
  // TODO: If changed: updatePipeline(), cancelFollowUps(), trigger notifications

  console.log(`[LeadPipeline] ⚠️  Stub process() — phone:${phone} stage:${pipelineStage} status:${leadStatus}`);
  return { phone, stage: pipelineStage, leadStatus };
}

module.exports = { process, advanceStage, STAGES, STAGE_RANK };
