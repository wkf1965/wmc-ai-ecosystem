/**
 * Sheet1 — CRM Dashboard (one row per phone number, upsert).
 *
 * Column layout (A–K):
 *   A  Phone
 *   B  Name
 *   C  Category
 *   D  Lead Status        Cold Lead / Warm Lead / Hot Lead
 *   E  Pipeline Stage     Contacted / Assessment Interested / Appointment Booked
 *   F  Appointment Date
 *   G  Next Action
 *   H  Customer Message   (latest)
 *   I  Auto Reply         (latest)
 *   J  First Contact
 *   K  Last Contact
 */

const { google } = require("googleapis");
const fs         = require("fs");
const path       = require("path");
const config     = require("../config");

const TAB     = "Sheet1";
const HEADERS = [
  "Phone",
  "Name",
  "Category",
  "Lead Status",
  "Pipeline Stage",
  "Appointment Date",
  "Next Action",
  "Customer Message",
  "Auto Reply",
  "First Contact",
  "Last Contact",
];

// Column indices (0-based)
const COL = {
  phone:           0,
  name:            1,
  category:        2,
  leadStatus:      3,
  pipelineStage:   4,
  appointmentDate: 5,
  nextAction:      6,
  message:         7,
  reply:           8,
  firstContact:    9,
  lastContact:     10,
};

// ── Auth ──────────────────────────────────────────────────────────────────────

function createSheetsClient() {
  const keyFile = path.resolve(config.google.credentials);
  if (!fs.existsSync(keyFile)) {
    throw new Error(`[SHEETS] Credentials file not found: ${keyFile}`);
  }
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// ── Header bootstrap ──────────────────────────────────────────────────────────

let headersEnsured = false;

async function ensureHeaders(sheets) {
  if (headersEnsured) return;
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range: `${TAB}!A1`,
  });
  const a1 = check.data.values?.[0]?.[0] ?? "";
  if (a1 !== "Phone") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.sheetId,
      range: `${TAB}!A1:K1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [HEADERS] },
    });
    console.log("[SHEETS] ✅ Header row written to Sheet1!A1:K1");
    headersEnsured = true;
  } else {
    headersEnsured = true;
  }
}

// ── Find existing row by phone ────────────────────────────────────────────────

/**
 * @param {object} sheets
 * @param {string} phone
 * @returns {Promise<{ rowIndex1Based: number; firstContact: string } | null>}
 */
async function findRowByPhone(sheets, phone) {
  const cleanPhone = String(phone || "").replace(/\s/g, "");
  if (!cleanPhone) return null;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range: `${TAB}!A2:K5000`,
    majorDimension: "ROWS",
  });

  const rows = res.data.values ?? [];
  for (let i = 0; i < rows.length; i++) {
    const rowPhone = String(rows[i][COL.phone] ?? "").replace(/\s/g, "");
    if (rowPhone === cleanPhone) {
      return {
        rowIndex1Based: i + 2,
        firstContact: String(rows[i][COL.firstContact] ?? ""),
      };
    }
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Upserts one row in Sheet1 (update if phone exists, append if new).
 *
 * @param {{
 *   phone:          string;
 *   name?:          string;
 *   message:        string;
 *   category:       string;
 *   reply:          string;
 *   leadStatus:     string;
 *   pipelineStage:  string;
 *   appointmentDate?: string;
 *   nextAction:     string;
 *   timestamp?:     string;
 * }} data
 */
async function savePatientMessage({
  phone,
  name,
  message,
  category,
  reply,
  leadStatus,
  pipelineStage,
  appointmentDate,
  nextAction,
  timestamp,
}) {
  const tag = `[SHEETS][${phone}]`;

  if (!config.google.sheetId) {
    console.warn(`${tag} GOOGLE_SHEET_ID not set — skipping save`);
    return;
  }

  const now = timestamp || new Date().toISOString();

  console.log(
    `${tag} Upsert → cat="${category}" status="${leadStatus}" stage="${pipelineStage}" next="${nextAction}"`,
  );

  const sheets = createSheetsClient();
  await ensureHeaders(sheets);

  let existing = null;
  try {
    existing = await findRowByPhone(sheets, phone);
  } catch (e) {
    console.warn(`${tag} Could not read existing rows:`, e.message);
  }

  const firstContact = existing?.firstContact || now;

  const row = [
    String(phone            || ""),
    String(name             || ""),
    String(category         || "General Inquiry"),
    String(leadStatus       || "Cold Lead"),
    String(pipelineStage    || "Contacted"),
    String(appointmentDate  || ""),
    String(nextAction       || "Ask More"),
    String(message          || ""),
    String(reply            || ""),
    firstContact,
    now,
  ];

  try {
    if (existing) {
      // UPDATE existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.google.sheetId,
        range: `${TAB}!A${existing.rowIndex1Based}:K${existing.rowIndex1Based}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { majorDimension: "ROWS", values: [row] },
      });
      console.log(
        `${tag} ✅ Updated row ${existing.rowIndex1Based} | status="${leadStatus}" stage="${pipelineStage}"`,
      );
    } else {
      // APPEND new row
      const result = await sheets.spreadsheets.values.append({
        spreadsheetId: config.google.sheetId,
        range: `${TAB}!A:K`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { majorDimension: "ROWS", values: [row] },
      });
      const updated = result.data.updates?.updatedRange || "Sheet1";
      console.log(`${tag} ✅ New row appended → ${updated} | status="${leadStatus}"`);
    }
  } catch (err) {
    const apiErr = err?.response?.data?.error;
    if (apiErr) {
      console.error(`${tag} ❌ Google API ${apiErr.code}: ${apiErr.message}`);
    } else {
      console.error(`${tag} ❌ Error:`, err?.message || err);
    }
    throw err;
  }
}

module.exports = { savePatientMessage };
