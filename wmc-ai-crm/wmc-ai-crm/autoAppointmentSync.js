/**
 * When pipeline reaches "Appointment Booked", append Appointments row + optional Calendar.
 */

const { parseAppointmentSlot } = require("./appointmentParser");
const {
  appointmentsConfigured,
  appendAppointmentRow,
} = require("./sheetsAppointments");
const {
  calendarConfigured,
  createAppointmentCalendarEvent,
} = require("./calendarAppointment");

const dedupe = new Map();
const DEDUPE_MS = 120_000;

function shouldDedupe(phoneKey, startIso, label) {
  const key = `${phoneKey}|${startIso || label.slice(0, 120)}`;
  const now = Date.now();
  const last = dedupe.get(key);
  if (last && now - last < DEDUPE_MS) return true;
  dedupe.set(key, now);
  if (dedupe.size > 5000) {
    for (const [k, ts] of dedupe) {
      if (now - ts > DEDUPE_MS * 4) dedupe.delete(k);
    }
  }
  return false;
}

/**
 * @param {{
 *   phoneKey: string;
 *   pipelineStage: string;
 *   name: string;
 *   category: string;
 *   phone: string;
 *   userMessage: string;
 *   reply: string;
 *   appointmentHint?: string;
 * }} opts
 * @returns {Promise<{ ok: boolean; reason?: string; calendarEventId?: string }>}
 */
async function syncAutomaticAppointment(opts) {
  const {
    phoneKey,
    pipelineStage,
    name,
    category,
    phone,
    userMessage,
    reply,
    appointmentHint,
  } = opts;

  if (!phoneKey || !appointmentsConfigured()) {
    return { ok: false, reason: "not_configured" };
  }
  if (pipelineStage !== "Appointment Booked") {
    return { ok: false, reason: "stage" };
  }

  const textForParse = `${userMessage || ""}\n${appointmentHint || ""}`;
  const parsed = parseAppointmentSlot(textForParse, reply || "");

  if (shouldDedupe(phoneKey, parsed.startIso || "", parsed.label)) {
    console.log("[APPOINTMENT] dedupe skip", phoneKey);
    return { ok: false, reason: "dedupe" };
  }

  let calendarEventId = "";
  if (parsed.startIso && parsed.endIso && calendarConfigured()) {
    const id = await createAppointmentCalendarEvent({
      summary: `WMC 预约 · ${name || phone || phoneKey}`,
      description: `电话：${phone || phoneKey}\n类别：${category || "—"}\n摘要：${(parsed.label || "").slice(0, 800)}`,
      startIso: parsed.startIso,
      endIso: parsed.endIso,
    });
    calendarEventId = id || "";
  }

  const status = calendarEventId
    ? "CalendarSynced"
    : parsed.startIso
      ? "ParsedTime"
      : "Pending";

  await appendAppointmentRow({
    name: name || "",
    phone: phone || phoneKey,
    category: category || "",
    slotRequested: parsed.label,
    parsedStart: parsed.startIso || "",
    parsedEnd: parsed.endIso || "",
    status,
    calendarEventId,
  });

  console.log(
    "[APPOINTMENT]",
    "recorded",
    phoneKey,
    status,
    calendarEventId ? `event=${calendarEventId}` : "",
  );

  return { ok: true, calendarEventId: calendarEventId || undefined };
}

module.exports = { syncAutomaticAppointment };
