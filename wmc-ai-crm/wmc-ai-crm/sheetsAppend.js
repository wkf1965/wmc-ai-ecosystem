/**
 * Append one logical row to Google Sheets (UTF-8 JavaScript strings only).
 * Columns A–I:
 *   timestamp, name, message, source, category, leadType, phone, reply, nextAction
 *
 * Uses spreadsheets.batchUpdate + appendCells so all 9 cells are written in one row
 * (values.append can collapse to a single column when the sheet’s “table” is mis-detected).
 *
 * Tab title: GOOGLE_SHEET_TAB or "Sheet1".
 * Optional GOOGLE_SHEET_RANGE for values.append fallback (e.g. Sheet1!A1:I).
 * Fallback append uses valueInputOption USER_ENTERED so UTF-8 / CJK display correctly.
 * Requires GOOGLE_SHEET_ID and GOOGLE_APPLICATION_CREDENTIALS.
 */

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const DEFAULT_TAB = process.env.GOOGLE_SHEET_TAB || "Sheet1";

/**
 * @param {unknown} s
 * @returns {string}
 */
function trimEnv(s) {
  if (s == null) return "";
  return String(s)
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

/**
 * Spreadsheet id only, or full `https://docs.google.com/spreadsheets/d/<id>/...` URL.
 * @param {string} raw
 * @returns {string}
 */
function parseSpreadsheetId(raw) {
  const t = trimEnv(raw);
  if (!t) return "";
  const fromUrl = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];
  return t;
}

/**
 * `values.append` range must cover 9 columns (A:I). Fix common `A:H` mistake from .env.
 * @param {string} tabTitle
 * @returns {string}
 */
function resolveValuesAppendRange(tabTitle) {
  const tab = trimEnv(tabTitle) || "Sheet1";
  const env = trimEnv(process.env.GOOGLE_SHEET_RANGE || "");
  if (!env) return `${tab}!A1:I`;

  const bang = env.indexOf("!");
  if (bang === -1) {
    console.warn(
      `[google-sheets] GOOGLE_SHEET_RANGE has no sheet tab (got "${env}"); using ${tab}!A:I`,
    );
    return `${tab}!A:I`;
  }

  const rngTab = trimEnv(env.slice(0, bang));
  const rest = trimEnv(env.slice(bang + 1)).toUpperCase();
  if (!rest) return `${rngTab || tab}!A:I`;

  const wrong8 =
    /^A:H$/.test(rest) ||
    /^A1:H$/.test(rest) ||
    /^A1:H1$/.test(rest);
  if (wrong8) {
    console.warn(
      "[google-sheets] GOOGLE_SHEET_RANGE used 8 columns (A:H); coercing to A:I for 9-column payload",
    );
    return `${rngTab || tab}!A:I`;
  }

  return env;
}

function log404Hint(spreadsheetId) {
  const sa = getServiceAccountEmail();
  console.error(
    "[google-sheets] 404 NOT_FOUND: spreadsheet id is invalid, or the file was deleted.",
    "Copy ONLY the id from the browser URL: .../spreadsheets/d/<THIS_PART>/edit",
    sa
      ? `Share the spreadsheet with this editor: ${sa}`
      : "Share the spreadsheet with the service account (client_email in credentials JSON).",
    `Tried id (len=${spreadsheetId.length}): ${spreadsheetId.slice(0, 16)}…`,
  );
}

/**
 * @returns {string | null}
 */
function getServiceAccountEmail() {
  try {
    const p = resolveKeyFile();
    if (!p || !fs.existsSync(p)) return null;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return typeof j.client_email === "string" ? j.client_email : null;
  } catch {
    return null;
  }
}

/**
 * Build ids to try against spreadsheets.get (404 until one works).
 * - Leading `1-` is often a stray hyphen after the first digit.
 * - `1cN8` vs `icN8` is a common 1 vs i copy/OCR mistake in the middle of the id.
 * @param {string} parsedId
 * @returns {string[]}
 */
function orderedSpreadsheetIdCandidates(parsedId) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  const add = (s) => {
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  add(parsedId);
  if (parsedId.includes("1cN8")) {
    add(parsedId.replace(/1cN8/g, "icN8"));
  }
  if (parsedId.length > 2 && parsedId[1] === "-") {
    add(parsedId[0] + parsedId.slice(2));
  }
  const noEarlyHyphen =
    parsedId.length > 2 && parsedId[1] === "-"
      ? parsedId[0] + parsedId.slice(2)
      : "";
  if (noEarlyHyphen.includes("1cN8")) {
    add(noEarlyHyphen.replace(/1cN8/g, "icN8"));
  }
  return out;
}

/**
 * Wrong copy/paste often yields `1-AbCd...` instead of `1AbCd...` (extra hyphen after leading digit).
 * Try each candidate with spreadsheets.get until one returns 200.
 * @param {any} sheets
 * @param {string} parsedId
 * @returns {Promise<string>}
 */
async function resolveAccessibleSpreadsheetId(sheets, parsedId) {
  const candidates = orderedSpreadsheetIdCandidates(parsedId);

  /** @type {unknown} */
  let lastErr = null;
  for (const sid of candidates) {
    try {
      await sheets.spreadsheets.get({
        spreadsheetId: sid,
        fields: "spreadsheetId,properties(title)",
      });
      if (sid !== parsedId) {
        console.warn(
          "[google-sheets] GOOGLE_SHEET_ID was corrected to reach your spreadsheet.",
          "Update .env to this value to skip retries:",
          sid,
        );
      }
      return sid;
    } catch (e) {
      lastErr = e;
      const status = e.response?.status;
      if (status !== 404) throw e;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("No spreadsheet id candidates");
}

/**
 * When UTF-8 bytes were wrongly interpreted as ISO-8859-1 (Latin-1), Chinese shows as
 * "Ã¤Â¸Â­" style mojibake. Recover by re-interpreting code units as bytes, then UTF-8 decode.
 * Only applies when the result plausibly contains Han characters and no replacement chars.
 * @param {string} s
 * @returns {string}
 */
function repairUtf8MisreadAsLatin1(s) {
  if (!s || typeof s !== "string") return s;
  if (/[\u4E00-\u9FFF]/.test(s)) return s;
  if (!/[^\x00-\x7F]/.test(s)) return s;
  try {
    const recovered = Buffer.from(s, "latin1").toString("utf8");
    if (recovered.includes("\uFFFD")) return s;
    if (/[\u4E00-\u9FFF\u3000-\u303F]/.test(recovered)) return recovered;
    return s;
  } catch {
    return s;
  }
}

/**
 * Remove C0 controls (except TAB/LF/CR) that can garble or truncate in Sheets / CSV.
 * @param {string} s
 * @returns {string}
 */
function stripProblematicControls(s) {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/**
 * Coerce to a JavaScript UTF-16 string (Sheets API JSON is UTF-8 on the wire).
 * Normalizes to NFC so CJK displays consistently; fixes common Latin-1 mojibake on CJK.
 * @param {unknown} v
 * @returns {string}
 */
function toSheetUtf8String(v) {
  if (v == null) return "";
  let s;
  if (typeof v === "string") s = v;
  else if (Buffer.isBuffer(v)) s = v.toString("utf8");
  else s = String(v);
  s = s.replace(/^\uFEFF/, "");
  try {
    s = s.normalize("NFC");
  } catch {
    /* keep s */
  }
  s = repairUtf8MisreadAsLatin1(s);
  return stripProblematicControls(s);
}

/** @type {Map<string, number>} key: `${spreadsheetId}\t${tabTitle}` → sheetId */
const sheetIdBySpreadsheetTab = new Map();

/**
 * @param {any} sheets google.sheets({ version: "v4", auth })
 * @param {string} spreadsheetId
 * @param {string} tabTitle
 * @returns {Promise<number>}
 */
async function resolveSheetId(sheets, spreadsheetId, tabTitle) {
  const cacheKey = `${spreadsheetId}\t${tabTitle}`;
  const cached = sheetIdBySpreadsheetTab.get(cacheKey);
  if (cached != null) return cached;

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });

  const list = res.data.sheets || [];
  const sh =
    list.find((s) => s.properties?.title === tabTitle) ?? list[0] ?? null;
  const sid = sh?.properties?.sheetId;
  if (sid === undefined || sid === null) {
    throw new Error(`Google Sheet tab not found: "${tabTitle}"`);
  }

  sheetIdBySpreadsheetTab.set(cacheKey, sid);
  return sid;
}

/**
 * Build the A→I row in order (explicit mapping for Sheets).
 * @param {{
 *   timestamp: string;
 *   name: string;
 *   message: string;
 *   source: string;
 *   category: string;
 *   leadType: string;
 *   phone: string;
 *   reply: string;
 *   nextAction: string;
 * }} payload
 * @returns {string[]}
 */
function appendRow(payload) {
  /** Must match Sheet columns A→I: timestamp … nextAction */
  return [
    toSheetUtf8String(payload.timestamp || ""),
    toSheetUtf8String(payload.name || ""),
    toSheetUtf8String(payload.message || ""),
    toSheetUtf8String(payload.source || ""),
    toSheetUtf8String(payload.category || ""),
    toSheetUtf8String(payload.leadType || ""),
    toSheetUtf8String(payload.phone || ""),
    toSheetUtf8String(payload.reply || ""),
    toSheetUtf8String(payload.nextAction || ""),
  ];
}

function sheetsConfigured() {
  return Boolean(
    parseSpreadsheetId(process.env.GOOGLE_SHEET_ID || "") &&
      trimEnv(process.env.GOOGLE_APPLICATION_CREDENTIALS || ""),
  );
}

function resolveKeyFile() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile) return null;
  return path.isAbsolute(keyFile) ? keyFile : path.join(process.cwd(), keyFile);
}

/**
 * @param {{
 *   timestamp: string;
 *   name: string;
 *   message: string;
 *   source: string;
 *   category: string;
 *   leadType: string;
 *   phone: string;
 *   reply: string;
 *   nextAction: string;
 * }} payload
 * @returns {Promise<{ skipped: boolean }>}
 */
async function appendToSheet(payload) {
  if (!sheetsConfigured()) {
    console.warn(
      "[google-sheets] skipped: set GOOGLE_SHEET_ID and GOOGLE_APPLICATION_CREDENTIALS",
    );
    return { skipped: true };
  }

  const spreadsheetId = parseSpreadsheetId(process.env.GOOGLE_SHEET_ID || "");
  if (!spreadsheetId) {
    console.error("[google-sheets] GOOGLE_SHEET_ID is empty after trim/parse");
    throw new Error("GOOGLE_SHEET_ID is not set");
  }

  const keyFile = resolveKeyFile();
  if (keyFile && !fs.existsSync(keyFile)) {
    console.error("[google-sheets] credentials file not found:", keyFile);
    throw new Error(`GOOGLE_APPLICATION_CREDENTIALS not found: ${keyFile}`);
  }

  console.log("[APPEND TO SHEET START]", payload);
  console.log("[GOOGLE_SHEET_ID]", spreadsheetId);
  console.log(
    "[GOOGLE_SHEET_RANGE]",
    resolveValuesAppendRange(DEFAULT_TAB),
    "(append fallback; env raw:",
    trimEnv(process.env.GOOGLE_SHEET_RANGE || "") || "(none)",
    ")",
  );

  const row = appendRow(payload);
  const values = [row];
  if (row.length !== 9) {
    throw new Error(`Sheets row must have 9 columns; got ${row.length}`);
  }

  console.log(
    "[google-sheets] appendCells A:I",
    "lens",
    row.map((c) => c.length).join(","),
  );

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  let spreadsheetIdResolved;
  try {
    spreadsheetIdResolved = await resolveAccessibleSpreadsheetId(
      sheets,
      spreadsheetId,
    );
  } catch (err) {
    const errData = err.response?.data || err.message || err;
    console.error("[APPEND TO SHEET ERROR]", errData);
    if (err.response?.status === 404) {
      log404Hint(spreadsheetId);
    }
    throw err;
  }

  /** @type {{ data?: unknown } | undefined} */
  let result;

  try {
    const sheetId = await resolveSheetId(
      sheets,
      spreadsheetIdResolved,
      DEFAULT_TAB,
    );

    result = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetIdResolved,
      requestBody: {
        requests: [
          {
            appendCells: {
              sheetId,
              rows: [
                {
                  values: row.map((cell) => ({
                    userEnteredValue: { stringValue: cell },
                  })),
                },
              ],
              fields: "userEnteredValue",
            },
          },
        ],
      },
    });
    console.log(
      "[APPEND TARGET]",
      `spreadsheet=${spreadsheetIdResolved} tab="${DEFAULT_TAB}" sheetId=${sheetId} method=batchUpdate.appendCells`,
    );
  } catch (err) {
    const errData = err.response?.data || err.message || err;
    console.error("[APPEND TO SHEET ERROR]", errData);
    if (err.response?.status === 404) {
      log404Hint(spreadsheetIdResolved);
    }
    const appendRange = resolveValuesAppendRange(DEFAULT_TAB);
    try {
      result = await sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetIdResolved,
        range: appendRange,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          majorDimension: "ROWS",
          values,
        },
      });
      console.log(
        "[APPEND TARGET]",
        `spreadsheet=${spreadsheetIdResolved} range="${appendRange}" method=values.append`,
      );
    } catch (err2) {
      console.error(
        "[APPEND TO SHEET ERROR]",
        err2.response?.data || err2.message || err2,
      );
      if (err2.response?.status === 404) {
        log404Hint(spreadsheetIdResolved);
      }
      throw err2;
    }
  }

  console.log("[APPEND TO SHEET SUCCESS]", result?.data);
  console.log("[APPEND VALUES]", values);

  return { skipped: false };
}

module.exports = {
  appendToSheet,
  appendRow,
  sheetsConfigured,
  APPEND_RANGE: `${DEFAULT_TAB}!A:I`,
  toSheetUtf8String,
  parseSpreadsheetId,
  resolveAccessibleSpreadsheetId,
  resolveSheetId,
  resolveKeyFile,
};
