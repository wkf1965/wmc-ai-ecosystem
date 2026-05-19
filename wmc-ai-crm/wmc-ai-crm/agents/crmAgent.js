/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — CRM Agent                                     ║
 * ║                                                              ║
 * ║  Role: Manages all CRM data operations triggered by         ║
 * ║  inbound messages. Orchestrates writes across all Google    ║
 * ║  Sheet tabs and ensures data consistency.                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Responsibilities:
 *   - Upsert Sheet1 (master CRM row per customer)
 *   - Upsert Memory tab (conversation context)
 *   - Upsert Pipeline tab (sales stage + lead status)
 *   - Upsert Dashboard tab (live summary)
 *   - Append Appointments tab (when confirmed)
 *   - Upsert Patients tab (patient record)
 *   - Upsert Marketing Leads tab
 *   - Manage Follow Up Queue (upsert PENDING / CANCELLED)
 *
 * Current implementation: src/services/crm.service.js
 * This agent is a future wrapper that adds:
 *   - Transaction-like consistency (all tabs or rollback)
 *   - Event emission for other agents to react
 *   - Audit log of every write
 *
 * TODO:
 *   - Replace syncAllTabs() with this agent's process()
 *   - Add optimistic locking to prevent concurrent write conflicts
 *   - Emit "crm:updated", "crm:appointment", "crm:converted" events
 */

"use strict";

const AGENT_NAME = "CRMAgent";

const EventEmitter = require("events");
const events = new EventEmitter();

/**
 * Process one CRM update cycle for an inbound message.
 *
 * @param {{
 *   phone:          string;
 *   name:           string;
 *   message:        string;
 *   category:       string;
 *   reply:          string;
 *   leadStatus:     string;
 *   pipelineStage:  string;
 *   nextAction:     string;
 *   appointmentTime?: string;
 *   timestamp:      string;
 * }} input
 */
async function process(input) {
  const { phone, leadStatus, pipelineStage } = input;

  console.log(`[${AGENT_NAME}] Processing ${phone} — status:${leadStatus} stage:${pipelineStage}`);

  try {
    // TODO: Call src/services/crm.service.js → syncAllTabs() (already wired)
    // TODO: Emit events after each write
    events.emit("crm:updated", { phone, leadStatus, pipelineStage });

    if (pipelineStage === "Appointment Booked") {
      events.emit("crm:appointment", { phone, ...input });
    }
    if (leadStatus === "Converted") {
      events.emit("crm:converted", { phone });
    }
    if (leadStatus === "Patient") {
      events.emit("crm:admitted", { phone });
    }

    console.log(`[${AGENT_NAME}] ⚠️  Stub — wire to crm.service.syncAllTabs()`);
    return { success: true };
  } catch (err) {
    console.error(`[${AGENT_NAME}] ❌ Error for ${phone}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { process, events, AGENT_NAME };
