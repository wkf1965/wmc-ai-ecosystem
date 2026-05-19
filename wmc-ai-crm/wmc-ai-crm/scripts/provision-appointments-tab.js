/**
 * Creates "Appointments" tab (A–I headers). Run: node scripts/provision-appointments-tab.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const {
  parseSpreadsheetId,
  resolveAccessibleSpreadsheetId,
} = require("../sheetsAppend");

const TAB =
  String(process.env.GOOGLE_SHEET_APPOINTMENTS_TAB || "Appointments").trim() ||
  "Appointments";

const HEADERS = [
  "Timestamp",
  "Name",
  "Phone",
  "Category",
  "SlotRequested",
  "ParsedStart",
  "ParsedEnd",
  "Status",
  "CalendarEventId",
];

function trimEnv(s) {
  if (s == null) return "";
  return String(s)
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function resolveKeyFile() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw) return null;
  const p = trimEnv(raw);
  return path.isAbsolute(p) ? p : path.join(__dirname, "..", p.replace(/^\.\//, ""));
}

function escapeTitle(t) {
  return `'${String(t).replace(/'/g, "''")}'`;
}

async function main() {
  const spreadsheetId = parseSpreadsheetId(process.env.GOOGLE_SHEET_ID || "");
  if (!spreadsheetId) {
    console.error("Missing GOOGLE_SHEET_ID");
    process.exit(1);
  }
  const keyFile = resolveKeyFile();
  if (!keyFile || !fs.existsSync(keyFile)) {
    console.error("Missing credentials");
    process.exit(1);
  }
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const id = await resolveAccessibleSpreadsheetId(sheets, spreadsheetId);

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: id,
    fields: "sheets(properties(sheetId,title))",
  });
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: TAB,
                gridProperties: { rowCount: 5000, columnCount: 12 },
              },
            },
          },
        ],
      },
    });
    console.log("[APPOINTMENT] created tab", TAB);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${escapeTitle(TAB)}!A1:I1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { majorDimension: "ROWS", values: [HEADERS] },
  });
  console.log("[APPOINTMENT] headers A1:I1 OK");
  console.log("https://docs.google.com/spreadsheets/d/" + id + "/edit");
}

main().catch((e) => {
  console.error(e.response?.data || e.message || e);
  process.exit(1);
});
