/**
 * CRM Orchestrator — called once per inbound WhatsApp message.
 *
 * Writes to all Google Sheet tabs in parallel (fire-and-forget):
 *   Sheet1          — master log (handled by sheets.service.js, already called from webhook)
 *   Memory          — per-phone upsert (last contact, category, last message)
 *   Pipeline        — per-phone sales stage upsert
 *   Appointments    — append row when patient shows appointment intent
 *   Marketing Leads — upsert lead record + Follow Up Queue via marketingCrmSync
 *   Patients        — append patient record (name + symptoms)
 *
 * Each section is independently try/caught so one tab failure never blocks others.
 */

const path = require("path");

// ── Root-level sheet modules (use relative path from src/services/) ────────────
const { updateMemory }         = require(path.join(__dirname, "../../sheetsMemory"));
const { updatePipeline }       = require(path.join(__dirname, "../../sheetsPipeline"));
const { appendAppointmentRow } = require(path.join(__dirname, "../../sheetsAppointments"));
const { syncMarketingCrm }     = require(path.join(__dirname, "../../marketingCrmSync"));
const { appendToFollowUpQueue, cancelFollowUpsForPhone } = require("./followUpScheduler");
const { getLeadStatus }   = require("./classify.service");
const { syncDashboard }   = require("./dashboard.service");

// ── Google Sheets client (for Patients tab) ───────────────────────────────────
const { google }  = require("googleapis");
const fs          = require("fs");
const config      = require("../config");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps leadStatus / nextAction to a Pipeline stage.
 * Full ladder: Contacted → Assessment Interested → Appointment Booked → Patient Visit → Long-term Care
 */
function getPipelineStage(category, nextAction, leadStatus) {
  if (leadStatus === "Patient")   return "Long-term Care";
  if (leadStatus === "Converted") return "Patient Visit";
  if (nextAction === "Prepare Appointment" ||
      nextAction === "Confirm Appointment Time") return "Appointment Booked";
  if (category === "Appointment Confirmed")      return "Appointment Booked";
  if (category === "General Inquiry")            return "Contacted";
  return "Assessment Interested";
}

/**
 * No follow-up needed once appointment is booked or customer is at/beyond clinic visit.
 */
function getFollowUpNeeded(nextAction, pipelineStage) {
  const doneStages = ["Appointment Booked", "Patient Visit", "Long-term Care"];
  if (doneStages.includes(pipelineStage)) return "No";
  return "Yes";
}

// ─────────────────────────────────────────────────────────────────────────────
// Patients tab (simple dedicated append)
// ─────────────────────────────────────────────────────────────────────────────

const PATIENTS_TAB     = "Patients";
const PATIENTS_HEADERS = ["Phone", "Name", "Category", "Symptoms / Last Message", "First Contact", "Last Contact"];
let   patientsEnsured  = false;

function createAuth() {
  const keyFile = path.resolve(config.google.credentials);
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function esc(t) { return `'${String(t).replace(/'/g, "''")}'`; }

async function ensurePatientsTab(sheets) {
  if (patientsEnsured) return;
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.google.sheetId,
    fields: "sheets.properties.title",
  });
  const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title);
  if (!titles.includes(PATIENTS_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: PATIENTS_TAB } } }] },
    });
    console.log("[PATIENTS] ✅ Tab created");
  }
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId, range: `${esc(PATIENTS_TAB)}!A1`,
  });
  if ((check.data.values?.[0]?.[0] ?? "") !== "Phone") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.sheetId,
      range: `${esc(PATIENTS_TAB)}!A1:F1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [PATIENTS_HEADERS] },
    });
  }
  patientsEnsured = true;
}

/** Upsert patient row (one record per phone). */
async function upsertPatientRow({ timestamp, name, phone, category, message }) {
  if (!config.google.sheetId) return;
  const sheets = google.sheets({ version: "v4", auth: createAuth() });
  await ensurePatientsTab(sheets);

  const cleanPhone = String(phone || "").replace(/\s/g, "");
  const now        = timestamp || new Date().toISOString();

  // Find existing row
  let existingRow = null;
  let firstContact = now;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetId,
      range: `${esc(PATIENTS_TAB)}!A2:F5000`,
      majorDimension: "ROWS",
    });
    const rows = res.data.values ?? [];
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0] ?? "").replace(/\s/g, "") === cleanPhone) {
        existingRow  = i + 2;
        firstContact = rows[i][4] || now;
        break;
      }
    }
  } catch (e) { /* fallback to append */ }

  const row = [
    String(phone    || ""),
    String(name     || ""),
    String(category || ""),
    String(message  || ""),
    firstContact,
    now,
  ];

  if (existingRow) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.sheetId,
      range: `${esc(PATIENTS_TAB)}!A${existingRow}:F${existingRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { majorDimension: "ROWS", values: [row] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.sheetId,
      range: `${esc(PATIENTS_TAB)}!A:F`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { majorDimension: "ROWS", values: [row] },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   phone:           string;
 *   name:            string;
 *   message:         string;
 *   category:        string;
 *   reply:           string;
 *   leadScore:       number;
 *   nextAction:      string;
 *   timestamp:       string;
 *   appointmentTime?: string;
 *   pipelineStage?:  string;
 *   leadStatus?:     string;
 * }} opts
 */
async function syncAllTabs(opts) {
  const { phone, name, message, category, reply, leadScore, nextAction, timestamp, appointmentTime } = opts;

  // Use pre-computed values from webhook when available (already includes never-downgrade logic)
  const leadType      = opts.leadStatus   || getLeadStatus({ category, score: leadScore, nextAction, message });
  const pipelineStage = opts.pipelineStage || getPipelineStage(category, nextAction, leadType);
  const followUpNeeded = getFollowUpNeeded(nextAction, pipelineStage);
  const casualGreet   = category === "General Inquiry" && message.length < 12;
  const now           = timestamp || new Date().toISOString();

  console.log(`[CRM][${phone}] leadStatus="${leadType}" stage="${pipelineStage}" followUp="${followUpNeeded}"`);

  const tag = `[CRM][${phone}]`;

  // ── 1. Memory ───────────────────────────────────────────────────────────────
  try {
    await updateMemory(phone, {
      name,
      category,
      leadType,
      lastMessage:  message,
      lastReply:    reply,
      updatedAt:    now,
    });
    console.log(`${tag} Memory ✅`);
  } catch (e) {
    console.error(`${tag} Memory ❌`, e?.message || e);
  }

  // ── 2. Pipeline ─────────────────────────────────────────────────────────────
  try {
    await updatePipeline(phone, {
      name,
      category,
      leadType,
      pipelineStage,
      lastFollowUp:  now,
      appointment:   pipelineStage === "Appointment Booked" ? `${appointmentTime || message} (${now.slice(0,10)})` : "",
      status: {
        "Appointment Booked": "Appointment Confirmed",
        "Patient Visit":      "Converted — At Clinic",
        "Long-term Care":     "Admitted Patient",
      }[pipelineStage] || `Follow Up: ${followUpNeeded}`,
      updatedAt:     now,
    });
    console.log(`${tag} Pipeline ✅ (${pipelineStage} | ${leadType} | FollowUp:${followUpNeeded})`);
  } catch (e) {
    console.error(`${tag} Pipeline ❌`, e?.message || e);
  }

  // ── 3. Appointments + cancel follow-ups when confirmed/converted/patient ────
  if (pipelineStage === "Appointment Booked") {
    try {
      await appendAppointmentRow({
        name,
        phone,
        category,
        slotRequested: appointmentTime || message,
        parsedStart:   appointmentTime || "",
        parsedEnd:     "",
        status:        "Confirmed",
        calendarEventId: "",
      });
      console.log(`${tag} Appointments ✅`);
    } catch (e) {
      console.error(`${tag} Appointments ❌`, e?.message || e);
    }

    // Cancel pending follow-ups — customer already booked, no need to chase
    try {
      await cancelFollowUpsForPhone(phone);
    } catch (e) {
      console.error(`${tag} Cancel follow-ups ❌`, e?.message || e);
    }
  }

  // Also cancel follow-ups when customer is physically at clinic or admitted
  if (pipelineStage === "Patient Visit" || pipelineStage === "Long-term Care") {
    try { await cancelFollowUpsForPhone(phone); } catch (_) { /* silent */ }
  }

  // ── 4. Marketing Leads + Follow Up Queue ────────────────────────────────────
  try {
    await syncMarketingCrm({
      phoneKey: phone,
      sheetPayload: {
        name,
        phone,
        message,
        reply,
        category,
        leadType,
        source:     "WhatsApp",
        timestamp:  now,
        nextAction,
      },
      trimmedMessage:  message,
      casualGreet,
      pipelineNextStage: pipelineStage,
      campaign:    "",
      platform:    "WhatsApp",
      budgetStr:   "0",
      sourceLabel: "WhatsApp",
    });
    console.log(`${tag} Marketing Leads ✅`);
  } catch (e) {
    console.error(`${tag} Marketing Leads ❌`, e?.message || e);
  }

  // ── 5. Patients tab (upsert) ────────────────────────────────────────────────
  try {
    await upsertPatientRow({ timestamp: now, name, phone, category, message });
    console.log(`${tag} Patients ✅`);
  } catch (e) {
    console.error(`${tag} Patients ❌`, e?.message || e);
  }

  // ── 6. Follow Up Queue (24-hour scheduler) ───────────────────────────────
  let followUpStatus = "PENDING";
  try {
    await appendToFollowUpQueue({ phone, message, category, leadScore, reply, timestamp: now });
    followUpStatus = pipelineStage === "Appointment Booked" ? "CANCELLED" : "PENDING";
    console.log(`${tag} Follow Up Queue ✅`);
  } catch (e) {
    console.error(`${tag} Follow Up Queue ❌`, e?.message || e);
  }

  // ── 7. Dashboard (live CRM summary) ──────────────────────────────────────
  try {
    await syncDashboard({
      phone,
      name,
      category,
      leadStatus:      leadType,
      pipelineStage,
      appointmentDate: pipelineStage === "Appointment Booked" ? now.slice(0, 10) : "",
      nextAction,
      message,
      timestamp:       now,
      followUpStatus,
    });
    console.log(`${tag} Dashboard ✅`);
  } catch (e) {
    console.error(`${tag} Dashboard ❌`, e?.message || e);
  }
}

module.exports = { syncAllTabs };
