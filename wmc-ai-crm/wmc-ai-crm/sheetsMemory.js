/**
 * Persistent CRM "Memory" tab (UTF-8 safe, same spreadsheet as append).
 * Columns A–G: Phone, Name, Category, LeadType, LastMessage, LastReply, UpdatedAt
 *
 * Env: GOOGLE_SHEET_ID, GOOGLE_APPLICATION_CREDENTIALS (same as Sheet1 append).
 * Optional: GOOGLE_SHEET_MEMORY_TAB (default "Memory").
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

const MEMORY_TAB = String(
  process.env.GOOGLE_SHEET_MEMORY_TAB || "Memory",
).trim() || "Memory";

const HEADERS = [
  "Phone",
  "Name",
  "Category",
  "LeadType",
  "LastMessage",
  "LastReply",
  "UpdatedAt",
];

let memorySheetEnsured = false;

function memorySheetsConfigured() {
  return sheetsConfigured();
}

function normalizeDigits(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

/**
 * @returns {Promise<{ sheets: import("googleapis").sheets_v4.Sheets; spreadsheetId: string } | null>}
 */
async function getSheetsClient() {
  if (!memorySheetsConfigured()) return null;
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

/**
 * Create "Memory" tab + header row if missing.
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 */
async function ensureMemorySheet(sheets, spreadsheetId) {
  if (memorySheetEnsured) return;

  const dataTab = process.env.GOOGLE_SHEET_TAB || "Sheet1";
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title,index))",
  });
  const list = meta.data.sheets || [];
  const existing = list.find((s) => s.properties?.title === MEMORY_TAB);
  const sheet1 = list.find((s) => s.properties?.title === dataTab);
  const insertIndex =
    sheet1?.properties?.index != null
      ? /** @type {number} */ (sheet1.properties.index) + 1
      : 0;

  if (!existing?.properties?.sheetId) {
    const add = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: MEMORY_TAB,
                index: insertIndex,
                gridProperties: { rowCount: 5000, columnCount: 12 },
              },
            },
          },
        ],
      },
    });
    const newId = add.data.replies?.[0]?.addSheet?.properties?.sheetId;
    if (newId == null) throw new Error("addSheet Memory: missing sheetId");

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
      range: `'${MEMORY_TAB.replace(/'/g, "''")}'!A1:G1`,
    });
    const first = res.data.values?.[0]?.[0];
    if (String(first || "").trim() !== "Phone") {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${MEMORY_TAB.replace(/'/g, "''")}'!A1:G1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { majorDimension: "ROWS", values: [HEADERS] },
      });
    }
  }

  memorySheetEnsured = true;
}

function escapeSheetTitle(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

/**
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} phoneKey digits
 * @returns {Promise<{ rowIndex1Based: number; phone: string; name: string; category: string; leadType: string; lastMessage: string; lastReply: string; updatedAt: string } | null>}
 */
async function loadMemoryByPhone(sheets, spreadsheetId, phoneKey) {
  const want = normalizeDigits(phoneKey);
  if (!want) return null;

  await ensureMemorySheet(sheets, spreadsheetId);

  const range = `${escapeSheetTitle(MEMORY_TAB)}!A2:G5000`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    majorDimension: "ROWS",
  });
  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const p = normalizeDigits(row[0]);
    if (p && p === want) {
      const rowIndex1Based = i + 2;
      return {
        rowIndex1Based,
        phone: String(row[0] ?? "").trim(),
        name: String(row[1] ?? "").trim(),
        category: String(row[2] ?? "").trim(),
        leadType: String(row[3] ?? "").trim(),
        lastMessage: String(row[4] ?? "").trim(),
        lastReply: String(row[5] ?? "").trim(),
        updatedAt: String(row[6] ?? "").trim(),
      };
    }
  }
  return null;
}

/**
 * Append a new Memory row (new phone).
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {{
 *   phone: string;
 *   name?: string;
 *   category?: string;
 *   leadType?: string;
 *   lastMessage?: string;
 *   lastReply?: string;
 *   updatedAt?: string;
 * }} rec
 */
async function saveMemoryByPhone(sheets, spreadsheetId, rec) {
  await ensureMemorySheet(sheets, spreadsheetId);

  const row = [
    toSheetUtf8String(rec.phone || ""),
    toSheetUtf8String(rec.name || ""),
    toSheetUtf8String(rec.category || ""),
    toSheetUtf8String(rec.leadType || ""),
    toSheetUtf8String(rec.lastMessage || ""),
    toSheetUtf8String(rec.lastReply || ""),
    toSheetUtf8String(rec.updatedAt || ""),
  ];

  const appendRange = `${escapeSheetTitle(MEMORY_TAB)}!A:G`;
  console.log("─── [MEMORY DEBUG NEW ROW] ─────────────────────────────");
  console.log("  UPDATED SHEET :", MEMORY_TAB);
  console.log("  UPDATED ROW   : (append — next empty row)");
  console.log("  UPDATED RANGE :", appendRange);
  console.log("  UPDATED VALUES:", JSON.stringify(row));
  console.log("────────────────────────────────────────────────────────");
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: appendRange,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { majorDimension: "ROWS", values: [row] },
  });
  console.log("  [MEMORY] Appended → actualRange:", res.data.updates?.updatedRange);
}

/**
 * Overwrite one row by 1-based sheet row index.
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {number} rowIndex1Based
 * @param {string[]} sevenCells
 */
async function updateMemoryRowAt(
  sheets,
  spreadsheetId,
  rowIndex1Based,
  sevenCells,
) {
  const range = `${escapeSheetTitle(MEMORY_TAB)}!A${rowIndex1Based}:G${rowIndex1Based}`;
  console.log("─── [MEMORY DEBUG] ─────────────────────────────────────");
  console.log("  UPDATED SHEET :", MEMORY_TAB);
  console.log("  UPDATED ROW   :", rowIndex1Based);
  console.log("  UPDATED RANGE :", range);
  console.log("  UPDATED VALUES:", JSON.stringify(sevenCells));
  console.log("────────────────────────────────────────────────────────");
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { majorDimension: "ROWS", values: [sevenCells] },
  });
  console.log("  [MEMORY] API response updatedCells:", res.data.updatedCells, "updatedRange:", res.data.updatedRange);
}

/**
 * Update Memory row for phone (merge with existing cells when patch omits a field).
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} phoneKey
 * @param {{
 *   name?: string;
 *   category?: string;
 *   leadType?: string;
 *   lastMessage?: string;
 *   lastReply?: string;
 *   updatedAt?: string;
 * }} patch
 */
async function updateMemory(sheets, spreadsheetId, phoneKey, patch) {
  const want = normalizeDigits(phoneKey);
  if (!want) return;

  await ensureMemorySheet(sheets, spreadsheetId);

  const existing = await loadMemoryByPhone(sheets, spreadsheetId, phoneKey);
  if (!existing) {
    await saveMemoryByPhone(sheets, spreadsheetId, {
      phone: phoneKey,
      name: patch.name ?? "",
      category: patch.category ?? "",
      leadType: patch.leadType ?? "",
      lastMessage: patch.lastMessage ?? "",
      lastReply: patch.lastReply ?? "",
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    });
    return;
  }

  const merged = {
    phone: existing.phone || phoneKey,
    name: patch.name !== undefined ? patch.name : existing.name,
    category: patch.category !== undefined ? patch.category : existing.category,
    leadType: patch.leadType !== undefined ? patch.leadType : existing.leadType,
    lastMessage:
      patch.lastMessage !== undefined ? patch.lastMessage : existing.lastMessage,
    lastReply: patch.lastReply !== undefined ? patch.lastReply : existing.lastReply,
    updatedAt:
      patch.updatedAt !== undefined ? patch.updatedAt : new Date().toISOString(),
  };

  const row = [
    toSheetUtf8String(merged.phone),
    toSheetUtf8String(merged.name),
    toSheetUtf8String(merged.category),
    toSheetUtf8String(merged.leadType),
    toSheetUtf8String(merged.lastMessage),
    toSheetUtf8String(merged.lastReply),
    toSheetUtf8String(merged.updatedAt),
  ];

  await updateMemoryRowAt(
    sheets,
    spreadsheetId,
    existing.rowIndex1Based,
    row,
  );
}

/**
 * @param {string} phoneKey
 * @returns {Promise<null | { rowIndex1Based: number; phone: string; name: string; category: string; leadType: string; lastMessage: string; lastReply: string; updatedAt: string }>}
 */
async function loadMemoryByPhoneExported(phoneKey) {
  const ctx = await getSheetsClient();
  if (!ctx) return null;
  try {
    return await loadMemoryByPhone(ctx.sheets, ctx.spreadsheetId, phoneKey);
  } catch (e) {
    console.warn("[MEMORY LOAD] error", e?.message || e);
    return null;
  }
}

/**
 * @param {Parameters<typeof saveMemoryByPhone>[2]} rec
 */
async function saveMemoryByPhoneExported(rec) {
  const ctx = await getSheetsClient();
  if (!ctx) return;
  try {
    await saveMemoryByPhone(ctx.sheets, ctx.spreadsheetId, rec);
  } catch (e) {
    console.warn("[MEMORY SAVE] error", e?.message || e);
  }
}

/**
 * @param {string} phoneKey
 * @param {Parameters<typeof updateMemory>[3]} patch
 */
async function updateMemoryExported(phoneKey, patch) {
  const ctx = await getSheetsClient();
  if (!ctx) return;
  try {
    await updateMemory(ctx.sheets, ctx.spreadsheetId, phoneKey, patch);
  } catch (e) {
    console.warn("[MEMORY SAVE] error", e?.message || e);
  }
}

module.exports = {
  MEMORY_TAB,
  memorySheetsConfigured,
  normalizeDigits,
  ensureMemorySheet,
  loadMemoryByPhone: loadMemoryByPhoneExported,
  saveMemoryByPhone: saveMemoryByPhoneExported,
  updateMemory: updateMemoryExported,
  /** Lower-level: same client as append; for tests or batching */
  getSheetsClient,
  loadMemoryByPhoneRaw: loadMemoryByPhone,
  saveMemoryByPhoneRaw: saveMemoryByPhone,
  updateMemoryRaw: updateMemory,
};
