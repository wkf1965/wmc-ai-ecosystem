/**
 * Creates Marketing CRM tabs + row 1 headers.
 * Run: node scripts/provision-marketing-crm-tabs.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const {
  parseSpreadsheetId,
  resolveAccessibleSpreadsheetId,
} = require("../sheetsAppend");
const {
  TAB_LEADS,
  TAB_CAMPAIGNS,
  TAB_QUEUE,
  LEADS_HEADERS,
  CAMPAIGN_HEADERS,
  QUEUE_HEADERS,
} = require("../sheetsMarketingCrm");

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

function esc(t) {
  return `'${String(t).replace(/'/g, "''")}'`;
}

function colEnd(n) {
  return String.fromCharCode(64 + n);
}

async function ensureTab(sheets, id, title, headers) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: id,
    fields: "sheets(properties(sheetId,title))",
  });
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === title);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title,
                gridProperties: { rowCount: 8000, columnCount: 16 },
              },
            },
          },
        ],
      },
    });
    console.log("[MARKETING CRM SAVE] created tab:", title);
  }
  const c = colEnd(headers.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${esc(title)}!A1:${c}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { majorDimension: "ROWS", values: [headers] },
  });
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

  await ensureTab(sheets, id, TAB_LEADS, LEADS_HEADERS);
  await ensureTab(sheets, id, TAB_CAMPAIGNS, CAMPAIGN_HEADERS);
  await ensureTab(sheets, id, TAB_QUEUE, QUEUE_HEADERS);

  console.log("OK —", `https://docs.google.com/spreadsheets/d/${id}/edit`);
}

main().catch((e) => {
  console.error(e.response?.data || e.message || e);
  process.exit(1);
});
