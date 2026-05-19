/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Treatment Pipeline                            ║
 * ║                                                              ║
 * ║  Purpose: Tracks a patient's ongoing treatment journey      ║
 * ║  across multiple sessions and service types.                ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * WMC Service lines (each has its own treatment sub-pipeline):
 *
 *   🏃 Pain Rehabilitation
 *        Initial Assessment → Treatment Plan → Sessions (N) → Discharge / Maintenance
 *
 *   🧠 Psychology / Hypnotherapy
 *        Initial Consultation → Goal Setting → Sessions (N) → Review → Completion
 *
 *   🌿 TCM / Acupuncture
 *        Consultation → Herb Prescription → Acupuncture Sessions → Review
 *
 *   ♿ Stroke Rehabilitation
 *        Assessment → Intensive Rehab → Maintenance → Discharge Planning
 *
 *   🏥 Nursing Home / Long-term Care
 *        Admission Assessment → Care Plan → Weekly Reviews → Family Updates
 *
 * Patient record shape:
 *   { phone, name, serviceType, startDate, sessions[], currentStage, notes }
 *
 * TODO:
 *   - Create Patients (treatment) sheet tab with this schema
 *   - Wire session tracking to appointment completions
 *   - Auto-generate monthly progress reports
 *   - Integrate with Marketing Leads for re-engagement campaigns
 */

"use strict";

const SERVICE_TYPES = [
  "Pain Rehabilitation",
  "Psychology / Hypnotherapy",
  "TCM / Acupuncture",
  "Stroke Rehabilitation",
  "Nursing Home / Long-term Care",
  "General",
];

const TREATMENT_STAGES = {
  "Pain Rehabilitation":          ["Assessment", "Treatment Plan", "Active Sessions", "Maintenance", "Discharged"],
  "Psychology / Hypnotherapy":    ["Initial Consult", "Goal Setting", "Active Sessions", "Review", "Completed"],
  "TCM / Acupuncture":            ["Consultation", "Prescribed", "Active Sessions", "Review", "Completed"],
  "Stroke Rehabilitation":        ["Assessment", "Intensive Rehab", "Maintenance", "Discharge Planning", "Discharged"],
  "Nursing Home / Long-term Care":["Admission", "Care Plan Active", "Weekly Review", "Family Update", "Discharged"],
  "General":                      ["Assessment", "Active", "Completed"],
};

/**
 * Create a new treatment record for a patient.
 *
 * @param {{ phone: string; name: string; serviceType: string; notes?: string }} data
 */
function createTreatmentRecord(data) {
  const stages = TREATMENT_STAGES[data.serviceType] || TREATMENT_STAGES["General"];
  return {
    id:           `tx_${Date.now()}`,
    phone:        data.phone,
    name:         data.name        || "",
    serviceType:  data.serviceType || "General",
    stages,
    currentStage: stages[0],
    sessions:     [],
    startDate:    new Date().toISOString(),
    notes:        data.notes || "",
    updatedAt:    new Date().toISOString(),
  };
}

/**
 * Log one completed session against a treatment record.
 *
 * @param {object} record
 * @param {{ date?: Date; notes?: string; therapist?: string }} session
 */
function logSession(record, session) {
  record.sessions.push({
    seq:       record.sessions.length + 1,
    date:      (session.date || new Date()).toISOString(),
    notes:     session.notes     || "",
    therapist: session.therapist || "",
  });
  record.updatedAt = new Date().toISOString();
  console.log(`[TreatmentPipeline] Session #${record.sessions.length} logged for ${record.phone}`);
  return record;
}

/**
 * Advance to the next stage in the treatment plan.
 *
 * @param {object} record
 */
function advanceStage(record) {
  const idx = record.stages.indexOf(record.currentStage);
  if (idx >= 0 && idx < record.stages.length - 1) {
    record.currentStage = record.stages[idx + 1];
    record.updatedAt    = new Date().toISOString();
    console.log(`[TreatmentPipeline] ${record.phone}: advanced to "${record.currentStage}"`);
  }
  return record;
}

module.exports = {
  createTreatmentRecord,
  logSession,
  advanceStage,
  SERVICE_TYPES,
  TREATMENT_STAGES,
};
