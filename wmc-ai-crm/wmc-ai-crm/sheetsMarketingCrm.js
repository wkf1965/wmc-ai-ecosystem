/**
 * Marketing CRM tabs: "Marketing Leads", "Campaigns", "Follow Up Queue".
 * UTF-8 via toSheetUtf8String; same spreadsheet as Sheet1.
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

const TAB_LEADS =
  String(process.env.GOOGLE_SHEET_MARKETING_LEADS_TAB || "Marketing Leads").trim() ||
  "Marketing Leads";
const TAB_CAMPAIGNS =
  String(process.env.GOOGLE_SHEET_CAMPAIGNS_TAB || "Campaigns").trim() || "Campaigns";
const TAB_QUEUE =
  String(process.env.GOOGLE_SHEET_FOLLOW_UP_QUEUE_TAB || "Follow Up Queue").trim() ||
  "Follow Up Queue";

const LEADS_HEADERS = [
  "Timestamp",
  "Name",
  "Phone",
  "Source",
  "Campaign",
  "Keyword",
  "Service Interest",
  "LeadType",
  "Marketing Stage",
  "Last Message",
  "AI Reply",
  "Next Action",
  "UpdatedAt",
];

const CAMPAIGN_HEADERS = [
  "Campaign Name",
  "Platform",
  "Service",
  "Budget",
  "Leads",
  "Hot Leads",
  "Appointments",
  "Conversions",
  "Cost Per Lead",
  "Conversion Rate",
];

const QUEUE_HEADERS = [
  "Phone",
  "Name",
  "Service Interest",
  "LeadType",
  "Last Contact",
  "Follow Up Time",
  "Follow Up Message",
  "Status",
];

let tabsEnsured = false;

function marketingCrmConfigured() {
  return sheetsConfigured();
}

function normalizeDigits(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

function escapeTitle(t) {
  return `'${String(t).replace(/'/g, "''")}'`;
}

async function getClient() {
  if (!marketingCrmConfigured()) return null;
  const spreadsheetId = parseSpreadsheetId(process.env.GOOGLE_SHEET_ID || "");
  if (!spreadsheetId) return null;
  const keyFile = resolveKeyFile();
  if (!keyFile || !fs.existsSync(keyFile)) return null;
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const id = await resolveAccessibleSpreadsheetId(sheets, spreadsheetId);
  return { sheets, spreadsheetId: id };
}

/**
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} title
 * @param {string[]} headers
 */
async function ensureTabWithHeader(sheets, spreadsheetId, title, headers) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  const list = meta.data.sheets || [];
  const ex = list.find((s) => s.properties?.title === title);
  if (!ex?.properties?.sheetId) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title,
                gridProperties: { rowCount: 8000, columnCount: Math.max(headers.length + 2, 14) },
              },
            },
          },
        ],
      },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${escapeTitle(title)}!A1:${String.fromCharCode(64 + headers.length)}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { majorDimension: "ROWS", values: [headers] },
  });
}

async function ensureMarketingTabs(sheets, spreadsheetId) {
  if (tabsEnsured) return;
  await ensureTabWithHeader(sheets, spreadsheetId, TAB_LEADS, LEADS_HEADERS);
  await ensureTabWithHeader(sheets, spreadsheetId, TAB_CAMPAIGNS, CAMPAIGN_HEADERS);
  await ensureTabWithHeader(sheets, spreadsheetId, TAB_QUEUE, QUEUE_HEADERS);
  tabsEnsured = true;
}

/**
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} phoneKey
 */
async function loadMarketingLeadByPhone(sheets, spreadsheetId, phoneKey) {
  const want = normalizeDigits(phoneKey);
  if (!want) return null;

  const range = `${escapeTitle(TAB_LEADS)}!A2:M8000`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    majorDimension: "ROWS",
  });
  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const p = normalizeDigits(row[2]);
    if (p && p === want) {
      return {
        rowIndex1Based: i + 2,
        timestamp: String(row[0] ?? "").trim(),
        name: String(row[1] ?? "").trim(),
        phone: String(row[2] ?? "").trim(),
        source: String(row[3] ?? "").trim(),
        campaign: String(row[4] ?? "").trim(),
        keyword: String(row[5] ?? "").trim(),
        serviceInterest: String(row[6] ?? "").trim(),
        leadType: String(row[7] ?? "").trim(),
        marketingStage: String(row[8] ?? "").trim(),
        lastMessage: String(row[9] ?? "").trim(),
        aiReply: String(row[10] ?? "").trim(),
        nextAction: String(row[11] ?? "").trim(),
        updatedAt: String(row[12] ?? "").trim(),
      };
    }
  }
  return null;
}

/**
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} phoneKey
 */
async function loadFollowUpQueueByPhone(sheets, spreadsheetId, phoneKey) {
  const want = normalizeDigits(phoneKey);
  if (!want) return null;
  const range = `${escapeTitle(TAB_QUEUE)}!A2:H3000`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    majorDimension: "ROWS",
  });
  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    const p = normalizeDigits(rows[i][0]);
    if (p && p === want) {
      const row = rows[i];
      return {
        rowIndex1Based: i + 2,
        phone: String(row[0] ?? "").trim(),
        name: String(row[1] ?? "").trim(),
        serviceInterest: String(row[2] ?? "").trim(),
        leadType: String(row[3] ?? "").trim(),
        lastContact: String(row[4] ?? "").trim(),
        followUpTime: String(row[5] ?? "").trim(),
        followUpMessage: String(row[6] ?? "").trim(),
        status: String(row[7] ?? "").trim(),
      };
    }
  }
  return null;
}

/**
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} campaignName
 */
async function loadCampaignRow(sheets, spreadsheetId, campaignName) {
  const want = String(campaignName || "").trim();
  if (!want) return null;
  const range = `${escapeTitle(TAB_CAMPAIGNS)}!A2:J500`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    majorDimension: "ROWS",
  });
  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] ?? "").trim() === want) {
      const r = rows[i];
      return {
        rowIndex1Based: i + 2,
        name: String(r[0] ?? "").trim(),
        platform: String(r[1] ?? "").trim(),
        service: String(r[2] ?? "").trim(),
        budget: String(r[3] ?? "").trim(),
        leads: Number(r[4]) || 0,
        hotLeads: Number(r[5]) || 0,
        appointments: Number(r[6]) || 0,
        conversions: Number(r[7]) || 0,
      };
    }
  }
  return null;
}

function formatCplAndRate(budgetNum, leads, conversions) {
  const cpl =
    budgetNum > 0 && leads > 0 ? (budgetNum / leads).toFixed(2) : "";
  const rate =
    leads > 0 ? `${((conversions / leads) * 100).toFixed(1)}%` : "";
  return { cpl, rate };
}

/**
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {{
 *   campaignName: string;
 *   platform: string;
 *   service: string;
 *   budgetStr: string;
 *   leadsDelta: number;
 *   hotDelta: number;
 *   apptDelta: number;
 *   convDelta: number;
 * }} bump
 */
async function bumpCampaignRow(sheets, spreadsheetId, bump) {
  const name = String(bump.campaignName || "").trim();
  if (!name) return;

  let row = await loadCampaignRow(sheets, spreadsheetId, name);
  const budgetNum = Number(String(bump.budgetStr || "").replace(/[^\d.]/g, "")) || 0;

  if (!row) {
    const leads = Math.max(0, bump.leadsDelta);
    const hotLeads = Math.max(0, bump.hotDelta);
    const appointments = Math.max(0, bump.apptDelta);
    const conversions = Math.max(0, bump.convDelta);
    const { cpl, rate } = formatCplAndRate(budgetNum, leads, conversions);
    const newRow = [
      toSheetUtf8String(name),
      toSheetUtf8String(bump.platform || "WhatsApp"),
      toSheetUtf8String(bump.service || ""),
      toSheetUtf8String(bump.budgetStr || "0"),
      String(leads),
      String(hotLeads),
      String(appointments),
      String(conversions),
      toSheetUtf8String(cpl),
      toSheetUtf8String(rate),
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${escapeTitle(TAB_CAMPAIGNS)}!A:J`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { majorDimension: "ROWS", values: [newRow] },
    });
    return;
  }

  const leads = Math.max(0, row.leads + bump.leadsDelta);
  const hotLeads = Math.max(0, row.hotLeads + bump.hotDelta);
  const appointments = Math.max(0, row.appointments + bump.apptDelta);
  const conversions = Math.max(0, row.conversions + bump.convDelta);
  const budgetStored = row.budget || bump.budgetStr || "0";
  const budgetParse =
    Number(String(budgetStored).replace(/[^\d.]/g, "")) || budgetNum;
  const { cpl, rate } = formatCplAndRate(budgetParse, leads, conversions);

  const out = [
    toSheetUtf8String(row.name),
    toSheetUtf8String(row.platform || bump.platform || "WhatsApp"),
    toSheetUtf8String(bump.service || row.service),
    toSheetUtf8String(String(budgetStored)),
    String(leads),
    String(hotLeads),
    String(appointments),
    String(conversions),
    toSheetUtf8String(cpl),
    toSheetUtf8String(rate),
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${escapeTitle(TAB_CAMPAIGNS)}!A${row.rowIndex1Based}:J${row.rowIndex1Based}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { majorDimension: "ROWS", values: [out] },
  });
}

const DEFAULT_FOLLOWUP_MSG =
  "您好，我是黄氏医疗中心市场跟进：看到您近期咨询较积极，若仍想了解评估或预约时段，请直接回复本消息或致电 012-4520077。";

module.exports = {
  marketingCrmConfigured,
  TAB_LEADS,
  TAB_CAMPAIGNS,
  TAB_QUEUE,
  ensureMarketingTabs,
  loadMarketingLeadByPhone,
  loadFollowUpQueueByPhone,
  loadCampaignRow,
  bumpCampaignRow,
  getClient,
  DEFAULT_FOLLOWUP_MSG,
  LEADS_HEADERS,
  CAMPAIGN_HEADERS,
  QUEUE_HEADERS,
};
