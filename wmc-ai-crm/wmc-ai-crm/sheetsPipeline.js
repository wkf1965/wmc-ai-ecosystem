/**
 * Sales "Pipeline" tab — UTF-8 safe, same spreadsheet as Sheet1 / Memory.
 * Columns A–I: Name, Phone, Category, LeadType, PipelineStage, LastFollowUp, Appointment, Status, UpdatedAt
 *
 * Env: GOOGLE_SHEET_ID, GOOGLE_APPLICATION_CREDENTIALS
 * Optional: GOOGLE_SHEET_PIPELINE_TAB (default "Pipeline")
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

let pipelineSheetEnsured = false;

function pipelineSheetsConfigured() {
  return sheetsConfigured();
}

function normalizeDigits(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

async function getSheetsClient() {
  if (!pipelineSheetsConfigured()) return null;
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

function escapeSheetTitle(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

async function ensurePipelineSheet(sheets, spreadsheetId) {
  if (pipelineSheetEnsured) return;

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  const list = meta.data.sheets || [];
  const existing = list.find((s) => s.properties?.title === PIPELINE_TAB);

  if (!existing?.properties?.sheetId) {
    const add = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: PIPELINE_TAB,
                gridProperties: { rowCount: 5000, columnCount: 14 },
              },
            },
          },
        ],
      },
    });
    const newId = add.data.replies?.[0]?.addSheet?.properties?.sheetId;
    if (newId == null) throw new Error("addSheet Pipeline: missing sheetId");

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
      range: `${escapeSheetTitle(PIPELINE_TAB)}!A1:I1`,
    });
    const first = res.data.values?.[0]?.[0];
    if (String(first || "").trim() !== "Name") {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${escapeSheetTitle(PIPELINE_TAB)}!A1:I1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { majorDimension: "ROWS", values: [HEADERS] },
      });
    }
  }

  pipelineSheetEnsured = true;
}

/**
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} phoneKey
 */
async function loadPipelineByPhone(sheets, spreadsheetId, phoneKey) {
  const want = normalizeDigits(phoneKey);
  if (!want) return null;

  await ensurePipelineSheet(sheets, spreadsheetId);

  const range = `${escapeSheetTitle(PIPELINE_TAB)}!A2:I5000`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    majorDimension: "ROWS",
  });
  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const p = normalizeDigits(row[1]);
    if (p && p === want) {
      const rowIndex1Based = i + 2;
      return {
        rowIndex1Based,
        name: String(row[0] ?? "").trim(),
        phone: String(row[1] ?? "").trim(),
        category: String(row[2] ?? "").trim(),
        leadType: String(row[3] ?? "").trim(),
        pipelineStage: String(row[4] ?? "").trim(),
        lastFollowUp: String(row[5] ?? "").trim(),
        appointment: String(row[6] ?? "").trim(),
        status: String(row[7] ?? "").trim(),
        updatedAt: String(row[8] ?? "").trim(),
      };
    }
  }
  return null;
}

/**
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {{
 *   name?: string;
 *   phone: string;
 *   category?: string;
 *   leadType?: string;
 *   pipelineStage?: string;
 *   lastFollowUp?: string;
 *   appointment?: string;
 *   status?: string;
 *   updatedAt?: string;
 * }} rec
 */
async function createPipelineLead(sheets, spreadsheetId, rec) {
  await ensurePipelineSheet(sheets, spreadsheetId);

  const row = [
    toSheetUtf8String(rec.name || ""),
    toSheetUtf8String(rec.phone || ""),
    toSheetUtf8String(rec.category || ""),
    toSheetUtf8String(rec.leadType || ""),
    toSheetUtf8String(rec.pipelineStage || "New Inquiry"),
    toSheetUtf8String(rec.lastFollowUp || ""),
    toSheetUtf8String(rec.appointment || ""),
    toSheetUtf8String(rec.status || ""),
    toSheetUtf8String(rec.updatedAt || new Date().toISOString()),
  ];

  const appendRange = `${escapeSheetTitle(PIPELINE_TAB)}!A:I`;
  console.log("─── [PIPELINE DEBUG NEW ROW] ───────────────────────────");
  console.log("  UPDATED SHEET :", PIPELINE_TAB);
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
  console.log("  [PIPELINE] Appended → actualRange:", res.data.updates?.updatedRange);
}

async function updatePipelineRowAt(sheets, spreadsheetId, rowIndex1Based, cells) {
  const range = `${escapeSheetTitle(PIPELINE_TAB)}!A${rowIndex1Based}:I${rowIndex1Based}`;
  console.log("─── [PIPELINE DEBUG] ───────────────────────────────────");
  console.log("  UPDATED SHEET :", PIPELINE_TAB);
  console.log("  UPDATED ROW   :", rowIndex1Based);
  console.log("  UPDATED RANGE :", range);
  console.log("  UPDATED VALUES:", JSON.stringify(cells));
  console.log("────────────────────────────────────────────────────────");
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { majorDimension: "ROWS", values: [cells] },
  });
  console.log("  [PIPELINE] API response updatedCells:", res.data.updatedCells, "updatedRange:", res.data.updatedRange);
}

/**
 * Merge-update an existing pipeline row by phone.
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} phoneKey
 * @param {{
 *   name?: string;
 *   category?: string;
 *   leadType?: string;
 *   pipelineStage?: string;
 *   lastFollowUp?: string;
 *   appointment?: string;
 *   status?: string;
 *   updatedAt?: string;
 * }} patch
 * @param {{ silent?: boolean }} [opts]
 */
async function updatePipeline(sheets, spreadsheetId, phoneKey, patch, opts) {
  const want = normalizeDigits(phoneKey);
  if (!want) return;

  await ensurePipelineSheet(sheets, spreadsheetId);

  const existing = await loadPipelineByPhone(sheets, spreadsheetId, phoneKey);
  if (!existing) {
    await createPipelineLead(sheets, spreadsheetId, {
      phone: phoneKey,
      name: patch.name ?? "",
      category: patch.category ?? "",
      leadType: patch.leadType ?? "",
      pipelineStage: patch.pipelineStage ?? "New Inquiry",
      lastFollowUp: patch.lastFollowUp ?? "",
      appointment: patch.appointment ?? "",
      status: patch.status ?? "",
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    });
    if (!opts?.silent) console.log("[PIPELINE CREATE]", phoneKey);
    return;
  }

  const merged = {
    name: patch.name !== undefined ? patch.name : existing.name,
    phone: existing.phone || phoneKey,
    category: patch.category !== undefined ? patch.category : existing.category,
    leadType: patch.leadType !== undefined ? patch.leadType : existing.leadType,
    pipelineStage:
      patch.pipelineStage !== undefined
        ? patch.pipelineStage
        : existing.pipelineStage,
    lastFollowUp:
      patch.lastFollowUp !== undefined
        ? patch.lastFollowUp
        : existing.lastFollowUp,
    appointment:
      patch.appointment !== undefined ? patch.appointment : existing.appointment,
    status: patch.status !== undefined ? patch.status : existing.status,
    updatedAt:
      patch.updatedAt !== undefined ? patch.updatedAt : new Date().toISOString(),
  };

  const row = [
    toSheetUtf8String(merged.name),
    toSheetUtf8String(merged.phone),
    toSheetUtf8String(merged.category),
    toSheetUtf8String(merged.leadType),
    toSheetUtf8String(merged.pipelineStage),
    toSheetUtf8String(merged.lastFollowUp),
    toSheetUtf8String(merged.appointment),
    toSheetUtf8String(merged.status),
    toSheetUtf8String(merged.updatedAt),
  ];

  await updatePipelineRowAt(
    sheets,
    spreadsheetId,
    existing.rowIndex1Based,
    row,
  );
  if (!opts?.silent) console.log("[PIPELINE UPDATE]", phoneKey);
}

/**
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} phoneKey
 * @param {string} newStage
 * @param {Parameters<typeof updatePipeline>[3]} [patch]
 */
async function movePipelineStage(sheets, spreadsheetId, phoneKey, newStage, patch) {
  console.log("[PIPELINE MOVE]", phoneKey, "→", newStage);
  const p = { ...(patch || {}), pipelineStage: newStage };
  await updatePipeline(sheets, spreadsheetId, phoneKey, p, { silent: true });
}

/* ---------- exported wrappers ---------- */

async function loadPipelineByPhoneExported(phoneKey) {
  const ctx = await getSheetsClient();
  if (!ctx) return null;
  try {
    return await loadPipelineByPhone(ctx.sheets, ctx.spreadsheetId, phoneKey);
  } catch (e) {
    console.warn("[pipeline] load error", e?.message || e);
    return null;
  }
}

async function createPipelineLeadExported(rec) {
  const ctx = await getSheetsClient();
  if (!ctx) return;
  try {
    await createPipelineLead(ctx.sheets, ctx.spreadsheetId, rec);
    console.log("[PIPELINE CREATE]", rec.phone || "");
  } catch (e) {
    console.warn("[PIPELINE CREATE] error", e?.message || e);
  }
}

async function updatePipelineExported(phoneKey, patch) {
  const ctx = await getSheetsClient();
  if (!ctx) return;
  try {
    await updatePipeline(ctx.sheets, ctx.spreadsheetId, phoneKey, patch, {});
  } catch (e) {
    console.warn("[PIPELINE UPDATE] error", e?.message || e);
  }
}

async function movePipelineStageExported(phoneKey, newStage, patch) {
  const ctx = await getSheetsClient();
  if (!ctx) return;
  try {
    await movePipelineStage(
      ctx.sheets,
      ctx.spreadsheetId,
      phoneKey,
      newStage,
      patch,
    );
  } catch (e) {
    console.warn("[PIPELINE MOVE] error", e?.message || e);
  }
}

module.exports = {
  PIPELINE_TAB,
  HEADERS,
  pipelineSheetsConfigured,
  loadPipelineByPhone: loadPipelineByPhoneExported,
  createPipelineLead: createPipelineLeadExported,
  updatePipeline: updatePipelineExported,
  movePipelineStage: movePipelineStageExported,
  getSheetsClient,
};
