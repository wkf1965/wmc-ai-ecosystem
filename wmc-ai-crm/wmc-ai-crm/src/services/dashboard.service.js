/**
 * Dashboard tab — live CRM summary (one row per phone, upsert).
 *
 * Column layout (A–L):
 *   A  Phone
 *   B  Name
 *   C  Category
 *   D  Lead Status        Cold Lead / Warm Lead / Hot Lead
 *   E  Pipeline Stage     Contacted / Assessment Interested / Appointment Booked
 *   F  Appointment Status Pending / Confirmed / None
 *   G  Appointment Date
 *   H  Follow Up Status   PENDING / SENT / CANCELLED / None
 *   I  Next Action
 *   J  Last Message       (snippet, first 80 chars)
 *   K  First Contact
 *   L  Last Contact
 *
 * Called from crm.service.js after every inbound WhatsApp message.
 * Pure upsert — never duplicates a phone number.
 */

const { google } = require("googleapis");
const fs         = require("fs");
const path       = require("path");
const config     = require("../config");

const TAB = "Dashboard";

const HEADERS = [
  "Phone",
  "Name",
  "Category",
  "Lead Status",
  "Pipeline Stage",
  "Appointment Status",
  "Appointment Date",
  "Follow Up Status",
  "Next Action",
  "Last Message",
  "First Contact",
  "Last Contact",
];

// 0-based column indices — must match HEADERS order above
const COL = {
  phone:             0,
  name:              1,
  category:          2,
  leadStatus:        3,
  pipelineStage:     4,
  appointmentStatus: 5,
  appointmentDate:   6,
  followUpStatus:    7,
  nextAction:        8,
  lastMessage:       9,
  firstContact:      10,
  lastContact:       11,
};

let tabEnsured = false;

// ── Auth ──────────────────────────────────────────────────────────────────────

function createSheetsClient() {
  const keyFile = path.resolve(config.google.credentials);
  if (!fs.existsSync(keyFile)) {
    throw new Error(`[DASHBOARD] Credentials not found: ${keyFile}`);
  }
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// ── Tab bootstrap ──────────────────────────────────────────────────────────────

async function ensureTab(sheets) {
  if (tabEnsured) return;

  // Create tab if missing
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.google.sheetId,
    fields: "sheets.properties.title",
  });
  const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "");
  if (!titles.includes(TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
    console.log(`[DASHBOARD] ✅ Tab "${TAB}" created`);
  }

  // Write headers if A1 is not "Phone"
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range: `'${TAB}'!A1`,
  });
  if ((check.data.values?.[0]?.[0] ?? "") !== "Phone") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.sheetId,
      range: `'${TAB}'!A1:L1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [HEADERS] },
    });
    console.log(`[DASHBOARD] ✅ Headers written`);
  }

  tabEnsured = true;
}

// ── Find existing row by phone ────────────────────────────────────────────────

async function findRowByPhone(sheets, phone) {
  const cleanPhone = String(phone || "").replace(/\s/g, "");
  if (!cleanPhone) return null;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range: `'${TAB}'!A2:L5000`,
    majorDimension: "ROWS",
  });

  const rows = res.data.values ?? [];
  for (let i = 0; i < rows.length; i++) {
    const rowPhone = String(rows[i][COL.phone] ?? "").replace(/\s/g, "");
    if (rowPhone === cleanPhone) {
      return {
        rowIndex1Based:    i + 2,
        firstContact:      String(rows[i][COL.firstContact]      ?? ""),
        storedLeadStatus:  String(rows[i][COL.leadStatus]        ?? ""),
        storedStage:       String(rows[i][COL.pipelineStage]     ?? ""),
        followUpStatus:    String(rows[i][COL.followUpStatus]    ?? "None"),
        appointmentStatus: String(rows[i][COL.appointmentStatus] ?? "None"),
        appointmentDate:   String(rows[i][COL.appointmentDate]   ?? ""),
        storedNextAction:  String(rows[i][COL.nextAction]        ?? ""),
      };
    }
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

// ── Status/stage rank tables (mirrors classify.service) ─────────────────────

const STATUS_RANK = {
  "Cold Lead": 1,
  "Warm Lead": 2,
  "Hot Lead":  3,
  "Converted": 4,
  "Patient":   5,
};

const STAGE_RANK = {
  "Contacted":             1,
  "Assessment Interested": 2,
  "Appointment Booked":    3,
  "Patient Visit":         4,
  "Long-term Care":        5,
};

function maxByRank(a, b, rankTable) {
  return (rankTable[a] ?? 0) >= (rankTable[b] ?? 0) ? a : b;
}

/**
 * Upserts one Dashboard row.
 *
 * @param {{
 *   phone:          string;
 *   name?:          string;
 *   category:       string;
 *   leadStatus:     string;
 *   pipelineStage:  string;
 *   appointmentDate?: string;
 *   nextAction:     string;
 *   message:        string;
 *   timestamp?:     string;
 *   followUpStatus?: string;
 * }} data
 */
async function syncDashboard({
  phone,
  name,
  category,
  leadStatus,
  pipelineStage,
  appointmentDate,
  nextAction,
  message,
  timestamp,
  followUpStatus,
}) {
  if (!config.google.sheetId) return;

  const tag = `[DASHBOARD][${phone}]`;
  const now  = timestamp || new Date().toISOString();

  let sheets;
  try {
    sheets = createSheetsClient();
    await ensureTab(sheets);
  } catch (e) {
    console.error(`${tag} ❌ Auth/tab error:`, e.message);
    return;
  }

  // Find existing row (carries forward preserved fields)
  let existing = null;
  try {
    existing = await findRowByPhone(sheets, phone);
  } catch (e) {
    console.warn(`${tag} Could not read existing rows:`, e.message);
  }

  const firstContact = existing?.firstContact || now;

  // ── Never-downgrade: Lead Status ─────────────────────────────────────────
  // Keep whichever is higher: incoming value OR what's already in the sheet.
  let resolvedLeadStatus = maxByRank(
    leadStatus       || "Cold Lead",
    existing?.storedLeadStatus || "Cold Lead",
    STATUS_RANK,
  );

  // If appointment was previously confirmed, Lead Status must be Hot Lead minimum
  const apptWasConfirmed = existing?.appointmentStatus === "Confirmed"
                        || pipelineStage === "Appointment Booked";
  if (apptWasConfirmed) {
    resolvedLeadStatus = maxByRank(resolvedLeadStatus, "Hot Lead", STATUS_RANK);
  }

  // ── Never-downgrade: Pipeline Stage ──────────────────────────────────────
  let resolvedStage = maxByRank(
    pipelineStage     || "Contacted",
    existing?.storedStage || "Contacted",
    STAGE_RANK,
  );

  // Hot Lead always implies at minimum Appointment Booked stage
  if (STATUS_RANK[resolvedLeadStatus] >= STATUS_RANK["Hot Lead"]) {
    resolvedStage = maxByRank(resolvedStage, "Appointment Booked", STAGE_RANK);
  }

  // ── Appointment Status: once Confirmed, never downgrade ──────────────────
  let appointmentStatus = "None";
  if (resolvedStage === "Appointment Booked" || apptWasConfirmed) {
    appointmentStatus = "Confirmed";
  } else if (existing?.appointmentStatus === "Pending") {
    appointmentStatus = "Pending";
  }

  // ── Next Action: appointment confirmed always = Prepare Appointment ───────
  let resolvedNextAction = nextAction || "Ask More";
  if (appointmentStatus === "Confirmed" && resolvedNextAction === "Ask More") {
    resolvedNextAction = "Prepare Appointment";
  }

  // ── Appointment date: keep old date if no new one provided ───────────────
  const resolvedApptDate =
    appointmentDate
    || (resolvedStage === "Appointment Booked" ? now.slice(0, 10) : "")
    || existing?.appointmentDate
    || "";

  // ── Follow Up Status: confirmed appointment stops follow-ups ─────────────
  const resolvedFollowUp =
    appointmentStatus === "Confirmed" ? "CANCELLED"
    : followUpStatus || existing?.followUpStatus || "PENDING";

  console.log(`${tag} leadStatus: ${existing?.storedLeadStatus || "—"} → ${resolvedLeadStatus} | stage: ${existing?.storedStage || "—"} → ${resolvedStage} | appt: ${appointmentStatus}`);

  const row = [
    String(phone              || ""),
    String(name               || ""),
    String(category           || "General Inquiry"),
    resolvedLeadStatus,
    resolvedStage,
    appointmentStatus,
    resolvedApptDate,
    resolvedFollowUp,
    resolvedNextAction,
    String((message || "").slice(0, 80)),
    firstContact,
    now,
  ];

  try {
    if (existing) {
      const range = `'${TAB}'!A${existing.rowIndex1Based}:L${existing.rowIndex1Based}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.google.sheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { majorDimension: "ROWS", values: [row] },
      });
      console.log(`${tag} ✅ Updated row ${existing.rowIndex1Based} | status="${resolvedLeadStatus}" stage="${resolvedStage}" appt="${appointmentStatus}" next="${resolvedNextAction}"`);
    } else {
      const res = await sheets.spreadsheets.values.append({
        spreadsheetId: config.google.sheetId,
        range: `'${TAB}'!A:L`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { majorDimension: "ROWS", values: [row] },
      });
      const actualRange = res.data.updates?.updatedRange || TAB;
      console.log(`${tag} ✅ New row → ${actualRange} | status="${resolvedLeadStatus}" stage="${resolvedStage}" appt="${appointmentStatus}"`);
    }
  } catch (err) {
    const apiErr = err?.response?.data?.error;
    if (apiErr) {
      console.error(`${tag} ❌ Google API ${apiErr.code}: ${apiErr.message}`);
    } else {
      console.error(`${tag} ❌`, err?.message || err);
    }
  }
}

module.exports = { syncDashboard };
