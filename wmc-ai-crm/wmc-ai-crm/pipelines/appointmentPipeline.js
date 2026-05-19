/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Appointment Pipeline                          ║
 * ║                                                              ║
 * ║  Purpose: Manages the full lifecycle of a single            ║
 * ║  appointment from first intent signal to completion.        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Appointment states:
 *   Pending        → slot requested but not yet confirmed
 *   Confirmed      → patient explicitly confirmed date/time
 *   Reminded-24h   → 24-hour reminder sent
 *   Reminded-1h    → 1-hour reminder sent
 *   In Progress    → patient has arrived at clinic
 *   Completed      → appointment successfully finished
 *   Missed         → no-show, not cancelled in advance
 *   Cancelled      → patient cancelled
 *   Rescheduled    → new slot set
 *
 * State machine rules:
 *   Confirmed → Reminded-24h → Reminded-1h → In Progress → Completed
 *   Any state → Cancelled
 *   Any state → Rescheduled → Confirmed
 *   In Progress → Missed (if no check-in after 30 min)
 */

"use strict";

const APPT_STATES = [
  "Pending",
  "Confirmed",
  "Reminded-24h",
  "Reminded-1h",
  "In Progress",
  "Completed",
  "Missed",
  "Cancelled",
  "Rescheduled",
];

/**
 * Create a new appointment record.
 *
 * @param {{
 *   phone:        string;
 *   name:         string;
 *   category:     string;
 *   slotRaw:      string;  raw text from message e.g. "明天下午3点"
 *   parsedStart?: Date;
 * }} data
 */
function createAppointment(data) {
  return {
    id:          `appt_${Date.now()}`,
    phone:       data.phone,
    name:        data.name         || "",
    category:    data.category     || "General",
    slotRaw:     data.slotRaw      || "",
    parsedStart: data.parsedStart  || null,
    status:      "Confirmed",
    reminders:   [],
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };
}

/**
 * Process an inbound message for appointment intent.
 *
 * @param {{ phone: string; message: string; appointmentTime: string; pipelineStage: string }} opts
 */
async function process(opts) {
  const { phone, message, appointmentTime, pipelineStage } = opts;

  if (pipelineStage !== "Appointment Booked") {
    return null; // not an appointment message
  }

  const appt = createAppointment({
    phone,
    slotRaw: appointmentTime || message,
  });

  // TODO: Save to Appointments sheet (done in crm.service.js → appendAppointmentRow)
  // TODO: Schedule reminder jobs via appointmentLoop.js
  // TODO: Notify clinical staff via notificationLoop.enqueue()

  console.log(`[AppointmentPipeline] ⚠️  Stub — created appt ${appt.id} for ${phone} at "${appt.slotRaw}"`);
  return appt;
}

module.exports = { process, createAppointment, APPT_STATES };
