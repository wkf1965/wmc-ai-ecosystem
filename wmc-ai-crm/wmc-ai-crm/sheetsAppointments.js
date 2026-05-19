/**
 * "Appointments" tab — auto booking log (UTF-8 safe).
 * Columns A–I: Timestamp, Name, Phone, Category, SlotRequested, ParsedStart, ParsedEnd, Status, CalendarEventId
 */

const fs = require("fs");
const { google } = require("googleapis");
const {
  sheetsConfigured,
  parseSpreadsheetId,
  resolveAccessibleSpreadsheetId,
  toSheetUtf8String,
  resolveKeyFile,
} = require("./sheetsAppend");

const APPOINTMENTS_TAB =
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

let appointmentsSheetEnsured = false;

function appointmentsConfigured() {
  return sheetsConfigured();
}

function escapeSheetTitle(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

async function getSheetsClient() {
  if (!appointmentsConfigured()) return null;
  const spreadsheetId = parseSpreadsheetId(process.env.GOOGLE_SHEET_ID || "");
  if (!spreadsheetId) return null;
  const keyFile = resolveKeyFile();
  if (!keyFile || !fs.existsSync(keyFile)) return null;

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetIdResolved = await resolveAccessibleSpreadsheetId(
    sheets,
    spreadsheetId,
  );
  return { sheets, spreadsheetId: spreadsheetIdResolved };
}

async function ensureAppointmentsSheet(sheets, spreadsheetId) {
  if (appointmentsSheetEnsured) return;

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  const list = meta.data.sheets || [];
  const existing = list.find((s) => s.properties?.title === APPOINTMENTS_TAB);

  if (!existing?.properties?.sheetId) {
    const add = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: APPOINTMENTS_TAB,
                gridProperties: { rowCount: 5000, columnCount: 12 },
              },
            },
          },
        ],
      },
    });
    const newId = add.data.replies?.[0]?.addSheet?.properties?.sheetId;
    if (newId == null) throw new Error("addSheet Appointments: missing sheetId");

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateCells: {
              range: {
                sheetId: newId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: HEADERS.length,
              },
              fields: "userEnteredValue",
              rows: [
                {
                  values: HEADERS.map((h) => ({
                    userEnteredValue: { stringValue: h },
                  })),
                },
              ],
            },
          },
        ],
      },
    });
  } else {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${escapeSheetTitle(APPOINTMENTS_TAB)}!A1:I1`,
    });
    const first = res.data.values?.[0]?.[0];
    if (String(first || "").trim() !== "Timestamp") {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${escapeSheetTitle(APPOINTMENTS_TAB)}!A1:I1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { majorDimension: "ROWS", values: [HEADERS] },
      });
    }
  }

  appointmentsSheetEnsured = true;
}

/**
 * @param {{
 *   name: string;
 *   phone: string;
 *   category: string;
 *   slotRequested: string;
 *   parsedStart: string;
 *   parsedEnd: string;
 *   status: string;
 *   calendarEventId: string;
 * }} row
 */
async function appendAppointmentRow(sheets, spreadsheetId, row) {
  await ensureAppointmentsSheet(sheets, spreadsheetId);

  const ts = new Date().toISOString();
  const values = [
    toSheetUtf8String(ts),
    toSheetUtf8String(row.name || ""),
    toSheetUtf8String(row.phone || ""),
    toSheetUtf8String(row.category || ""),
    toSheetUtf8String(row.slotRequested || ""),
    toSheetUtf8String(row.parsedStart || ""),
    toSheetUtf8String(row.parsedEnd || ""),
    toSheetUtf8String(row.status || "Pending"),
    toSheetUtf8String(row.calendarEventId || ""),
  ];

  const appendRange = `${escapeSheetTitle(APPOINTMENTS_TAB)}!A:I`;
  console.log("─── [APPOINTMENTS DEBUG] ───────────────────────────────");
  console.log("  UPDATED SHEET :", APPOINTMENTS_TAB);
  console.log("  UPDATED ROW   : (append — next empty row)");
  console.log("  UPDATED RANGE :", appendRange);
  console.log("  UPDATED VALUES:", JSON.stringify(values));
  console.log("────────────────────────────────────────────────────────");
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: appendRange,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { majorDimension: "ROWS", values: [values] },
  });
  console.log("  [APPOINTMENTS] Appended → actualRange:", res.data.updates?.updatedRange);
}

/**
 * @param {Parameters<typeof appendAppointmentRow>[2]} row
 */
async function appendAppointmentRowExported(row) {
  const ctx = await getSheetsClient();
  if (!ctx) return null;
  await appendAppointmentRow(ctx.sheets, ctx.spreadsheetId, row);
  return true;
}

module.exports = {
  APPOINTMENTS_TAB,
  HEADERS,
  appointmentsConfigured,
  appendAppointmentRow: appendAppointmentRowExported,
  getSheetsClient,
};
