/**
 * Creates the "Pipeline" tab (A–I headers) after Dashboard when possible.
 * Run: node scripts/provision-pipeline-tab.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const {
  parseSpreadsheetId,
  resolveAccessibleSpreadsheetId,
} = require("../sheetsAppend");

const DATA_TAB = process.env.GOOGLE_SHEET_TAB || "Sheet1";
const MEMORY_TAB =
  String(process.env.GOOGLE_SHEET_MEMORY_TAB || "Memory").trim() || "Memory";
const DASH_TAB = "Dashboard";
const PIPELINE_TAB =
  String(process.env.GOOGLE_SHEET_PIPELINE_TAB || "Pipeline").trim() ||
  "Pipeline";

const HEADERS = [
  "Name",
  "Phone",
  "Category",
  "LeadType",
  "PipelineStage",
  "LastFollowUp",
  "Appointment",
  "Status",
  "UpdatedAt",
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

async function listSheetsIndexed(sheets, spreadsheetId) {
  const r = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title,index))",
  });
  return (r.data.sheets || [])
    .map((s) => ({
      sheetId: /** @type {number} */ (s.properties.sheetId),
      title: String(s.properties.title || ""),
      index: s.properties.index ?? 0,
    }))
    .sort((a, b) => a.index - b.index);
}

async function main() {
  const spreadsheetId = parseSpreadsheetId(process.env.GOOGLE_SHEET_ID || "");
  if (!spreadsheetId) {
    console.error("Missing GOOGLE_SHEET_ID in .env");
    process.exit(1);
  }
  const keyFile = resolveKeyFile();
  if (!keyFile || !fs.existsSync(keyFile)) {
    console.error("Missing GOOGLE_APPLICATION_CREDENTIALS file:", keyFile);
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const id = await resolveAccessibleSpreadsheetId(sheets, spreadsheetId);

  console.log("[PIPELINE UPDATE]", "provision spreadsheet", id);

  let list = await listSheetsIndexed(sheets, id);
  const sheet1 = list.find((s) => s.title === DATA_TAB);
  if (!sheet1) throw new Error(`Tab "${DATA_TAB}" not found.`);

  const dash = list.find((s) => s.title === DASH_TAB);
  const mem = list.find((s) => s.title === MEMORY_TAB);
  const targetIndex = dash
    ? dash.index + 1
    : mem
      ? mem.index + 1
      : sheet1.index + 1;

  let pl = list.find((s) => s.title === PIPELINE_TAB);

  if (!pl) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: PIPELINE_TAB,
                index: targetIndex,
                gridProperties: { rowCount: 5000, columnCount: 14 },
                tabColor: { red: 0.35, green: 0.22, blue: 0.65 },
              },
            },
          },
        ],
      },
    });
    list = await listSheetsIndexed(sheets, id);
    pl = list.find((s) => s.title === PIPELINE_TAB);
    console.log("[PIPELINE CREATE]", `tab "${PIPELINE_TAB}" at index ${pl?.index}`);
  } else if (pl.index !== targetIndex) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId: pl.sheetId, index: targetIndex },
              fields: "index",
            },
          },
        ],
      },
    });
    console.log("[PIPELINE MOVE]", `tab to index ${targetIndex}`);
  } else {
    console.log("[PIPELINE UPDATE]", `"${PIPELINE_TAB}" already at index ${pl.index}`);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${escapeTitle(PIPELINE_TAB)}!A1:I1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { majorDimension: "ROWS", values: [HEADERS] },
  });
  console.log("[PIPELINE UPDATE]", "header row A1:I1");

  const final = await listSheetsIndexed(sheets, id);
  console.log(
    "[PIPELINE UPDATE]",
    "tab order:",
    final.map((s) => `${s.index}:${s.title}`).join(" | "),
  );
  console.log("OK —", `https://docs.google.com/spreadsheets/d/${id}/edit`);
}

main().catch((e) => {
  console.error(e.response?.data || e.message || e);
  process.exit(1);
});
