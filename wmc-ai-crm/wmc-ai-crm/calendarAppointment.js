/**
 * Optional Google Calendar event when GOOGLE_CALENDAR_ID is set.
 * Share the calendar with the service account (client_email) as "Make changes to events".
 */

const fs = require("fs");
const { google } = require("googleapis");
const { resolveKeyFile } = require("./sheetsAppend");
const { DEFAULT_TZ } = require("./appointmentParser");

function trimEnv(s) {
  if (s == null) return "";
  return String(s)
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function calendarConfigured() {
  const cal = trimEnv(process.env.GOOGLE_CALENDAR_ID || "");
  const key = resolveKeyFile();
  return Boolean(cal && key && fs.existsSync(key));
}

/**
 * @param {{
 *   summary: string;
 *   description: string;
 *   startIso: string;
 *   endIso: string;
 * }} p
 * @returns {Promise<string | null>} event id or null
 */
async function createAppointmentCalendarEvent(p) {
  if (!calendarConfigured()) return null;

  const keyFile = resolveKeyFile();
  if (!keyFile) return null;

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  });

  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = trimEnv(process.env.GOOGLE_CALENDAR_ID || "");

  try {
    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: p.summary,
        description: p.description,
        start: { dateTime: p.startIso, timeZone: DEFAULT_TZ },
        end: { dateTime: p.endIso, timeZone: DEFAULT_TZ },
      },
    });
    return res.data.id || null;
  } catch (e) {
    console.warn(
      "[APPOINTMENT] calendar insert failed",
      e.response?.data || e.message || e,
    );
    return null;
  }
}

module.exports = {
  calendarConfigured,
  createAppointmentCalendarEvent,
};
