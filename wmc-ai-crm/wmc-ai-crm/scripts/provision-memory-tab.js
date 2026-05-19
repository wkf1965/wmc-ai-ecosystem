/**
 * Creates the "Memory" tab (A–G headers) and places it between Sheet1 and Dashboard.
 * Same credentials as webhook / provision-dashboard. Does not delete Sheet1 or Dashboard.
 *
 * Run: node scripts/provision-memory-tab.js
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

const HEADERS = [
  "Phone",
  "Name",
  "Category",
  "LeadType",
  "LastMessage",
  "LastReply",
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

/**
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 */
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

  console.log("[MEMORY LOAD]", "spreadsheet", id);

  let list = await listSheetsIndexed(sheets, id);
  const sheet1 = list.find((s) => s.title === DATA_TAB);
  if (!sheet1) {
    throw new Error(`Tab "${DATA_TAB}" not found — cannot anchor Memory.`);
  }

  let memory = list.find((s) => s.title === MEMORY_TAB);
  const targetMemoryIndex = sheet1.index + 1;

  if (!memory) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: MEMORY_TAB,
                index: targetMemoryIndex,
                gridProperties: { rowCount: 5000, columnCount: 12 },
                tabColor: { red: 0.12, green: 0.52, blue: 0.32 },
              },
            },
          },
        ],
      },
    });
    list = await listSheetsIndexed(sheets, id);
    memory = list.find((s) => s.title === MEMORY_TAB);
    if (!memory) throw new Error("Memory tab add failed");
    console.log("[MEMORY SAVE]", `created tab "${MEMORY_TAB}" at index ${memory.index}`);
  } else if (memory.index !== targetMemoryIndex) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId: memory.sheetId, index: targetMemoryIndex },
              fields: "index",
            },
          },
        ],
      },
    });
    list = await listSheetsIndexed(sheets, id);
    memory = list.find((s) => s.title === MEMORY_TAB) || memory;
    console.log("[MEMORY SAVE]", `moved "${MEMORY_TAB}" to index ${targetMemoryIndex}`);
  } else {
    console.log("[MEMORY LOAD]", `"${MEMORY_TAB}" already at index ${memory.index}`);
  }

  list = await listSheetsIndexed(sheets, id);
  memory = list.find((s) => s.title === MEMORY_TAB);
  const dash = list.find((s) => s.title === DASH_TAB);
  if (memory && dash && dash.index !== memory.index + 1) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId: dash.sheetId, index: memory.index + 1 },
              fields: "index",
            },
          },
        ],
      },
    });
    console.log("[MEMORY SAVE]", `placed "${DASH_TAB}" immediately after "${MEMORY_TAB}"`);
  }

  const rng = `${escapeTitle(MEMORY_TAB)}!A1:G1`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: rng,
    valueInputOption: "USER_ENTERED",
    requestBody: { majorDimension: "ROWS", values: [HEADERS] },
  });
  console.log("[MEMORY SAVE]", "header row A1:G1 (Phone … UpdatedAt)");

  const final = await listSheetsIndexed(sheets, id);
  console.log(
    "[MEMORY LOAD]",
    "tab order:",
    final.map((s) => `${s.index}:${s.title}`).join(" | "),
  );

  const url = `https://docs.google.com/spreadsheets/d/${id}/edit`;
  console.log("OK — open:", url);
}

main().catch((e) => {
  console.error(e.response?.data || e.message || e);
  process.exit(1);
});
