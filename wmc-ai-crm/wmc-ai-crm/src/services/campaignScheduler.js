/**
 * WMC Campaign Scheduler
 *
 * Campaigns tab columns (A–I):
 *   A  Campaign Name
 *   B  Target Category
 *   C  Message
 *   D  Total Leads
 *   E  Sent
 *   F  Pending
 *   G  Status          Active | Running | Completed | Paused
 *   H  Created Time
 *   I  Last Run Date   (YYYY-MM-DD, updated each run to prevent same-day resend)
 *
 * Schedule: runs once daily at 10:00 AM (Asia/Kuala_Lumpur, UTC+8).
 * Reads matching leads from Memory tab, sends WhatsApp, updates counts.
 */

const { google }      = require("googleapis");
const path            = require("path");
const fs              = require("fs");
const config          = require("../config");
const { sendMessage } = require("./whatsapp.service");

// ── Constants ──────────────────────────────────────────────────────────────

const CAMPAIGNS_TAB = "Campaigns";
const MEMORY_TAB    = "Memory";

const HEADERS = [
  "Campaign Name",
  "Target Category",
  "Message",
  "Total Leads",
  "Sent",
  "Pending",
  "Status",
  "Created Time",
  "Last Run Date",
];

// Column indices (0-based)
const C = {
  name:        0,
  category:    1,
  message:     2,
  totalLeads:  3,
  sent:        4,
  pending:     5,
  status:      6,
  createdTime: 7,
  lastRunDate: 8,
};

// Delay between sends to avoid WhatsApp rate-limiting (ms)
const SEND_DELAY_MS = 3000;

// ── Default campaigns seeded on first boot ─────────────────────────────────

const DEFAULT_CAMPAIGNS = [
  {
    name:     "腰痛康复推广",
    category: "Pain Rehabilitation Lead",
    message:  "您好 😊 Wong Medical Centre 目前提供腰痛康复评估，如您最近仍有疼痛问题，可以安排检查与治疗。\n\n📍 14 Jalan Lapangan Siber 1, Bandar Cyber, 31350 Ipoh, Perak\n📞 012-4520077",
  },
  {
    name:     "中风康复推广",
    category: "Stroke Rehabilitation Lead",
    message:  "您好 😊 Wong Medical Centre 专业中风康复团队可协助患者逐步恢复行动能力。如有需要，欢迎安排康复评估。\n\n📍 14 Jalan Lapangan Siber 1, Bandar Cyber, 31350 Ipoh, Perak\n📞 012-4520077",
  },
  {
    name:     "心理辅导推广",
    category: "Psychology / Hypnosis Lead",
    message:  "您好 😊 如果您最近感到焦虑、失眠或情绪困扰，Wong Medical Centre 的心理辅导与临床催眠治疗可以帮助您。欢迎预约咨询。\n\n📍 14 Jalan Lapangan Siber 1, Bandar Cyber, 31350 Ipoh, Perak\n📞 012-4520077",
  },
  {
    name:     "疗养院护理推广",
    category: "Nursing Home Lead",
    message:  "您好 😊 Wong Medical Centre 提供专业的护理中心服务，包括老人护理、失智症照顾及出院后长期护理。如有需要，欢迎联系了解详情。\n\n📍 14 Jalan Lapangan Siber 1, Bandar Cyber, 31350 Ipoh, Perak\n📞 012-4520077",
  },
];

let tabEnsured    = false;
let campaignsSeeded = false;

// ── Auth ───────────────────────────────────────────────────────────────────

function createSheetsClient() {
  const keyFile = path.resolve(config.google.credentials);
  if (!fs.existsSync(keyFile)) {
    throw new Error(`[CAMPAIGN] Credentials not found: ${keyFile}`);
  }
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function esc(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Tab bootstrap ──────────────────────────────────────────────────────────

async function ensureCampaignsTab(sheets) {
  if (tabEnsured) return;

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.google.sheetId,
    fields: "sheets.properties.title",
  });
  const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title);

  if (!titles.includes(CAMPAIGNS_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.sheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: CAMPAIGNS_TAB } } }],
      },
    });
    console.log(`[CAMPAIGN] ✅ Tab "${CAMPAIGNS_TAB}" created`);
  }

  // Write header if A1 is empty or wrong
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range: `${esc(CAMPAIGNS_TAB)}!A1`,
  });
  if ((check.data.values?.[0]?.[0] ?? "") !== "Campaign Name") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.sheetId,
      range: `${esc(CAMPAIGNS_TAB)}!A1:I1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [HEADERS] },
    });
    console.log(`[CAMPAIGN] ✅ Header row written`);
  }

  tabEnsured = true;
}

// ── Seed default campaigns ─────────────────────────────────────────────────

async function seedDefaultCampaigns(sheets) {
  if (campaignsSeeded) return;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range: `${esc(CAMPAIGNS_TAB)}!A2:A10`,
  });
  const existingNames = (res.data.values ?? []).map((r) => String(r[0] ?? "").trim());

  const now = new Date().toISOString();
  const toInsert = [];

  for (const c of DEFAULT_CAMPAIGNS) {
    if (!existingNames.includes(c.name)) {
      toInsert.push([c.name, c.category, c.message, 0, 0, 0, "Active", now, ""]);
    }
  }

  if (toInsert.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.sheetId,
      range: `${esc(CAMPAIGNS_TAB)}!A:I`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { majorDimension: "ROWS", values: toInsert },
    });
    console.log(`[CAMPAIGN] ✅ Seeded ${toInsert.length} default campaign(s)`);
  }

  campaignsSeeded = true;
}

// ── Read Memory tab leads ──────────────────────────────────────────────────

/**
 * Returns all phone numbers from Memory tab matching a given category.
 * Memory columns: Phone(A), Name(B), Category(C), LeadType(D), ...
 */
async function getLeadsForCategory(sheets, targetCategory) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetId,
      range: `${esc(MEMORY_TAB)}!A2:D5000`,
      majorDimension: "ROWS",
    });
    const rows = res.data.values ?? [];
    return rows
      .filter((r) => String(r[2] ?? "").trim() === targetCategory)
      .map((r) => ({
        phone: String(r[0] ?? "").trim(),
        name:  String(r[1] ?? "").trim(),
      }))
      .filter((l) => l.phone);
  } catch (e) {
    console.warn(`[CAMPAIGN] Could not read Memory tab:`, e.message);
    return [];
  }
}

// ── Update campaign row counts ─────────────────────────────────────────────

async function updateCampaignRow(sheets, sheetRow1Based, { totalLeads, sent, pending, status, lastRunDate }) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.sheetId,
    range: `${esc(CAMPAIGNS_TAB)}!D${sheetRow1Based}:I${sheetRow1Based}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        String(totalLeads ?? 0),
        String(sent  ?? 0),
        String(pending ?? 0),
        String(status  ?? "Active"),
        "",               // Created Time — skip (col H, not updating)
        String(lastRunDate ?? ""),
      ]],
    },
  });
}

// Simpler targeted update (just Status + counts, preserving Created Time)
async function patchCampaignCounts(sheets, sheetRow1Based, totalLeads, sent, pending, status, lastRunDate) {
  // Columns D, E, F, G, I (skip H = Created Time)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.google.sheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${esc(CAMPAIGNS_TAB)}!D${sheetRow1Based}`, values: [[String(totalLeads)]] },
        { range: `${esc(CAMPAIGNS_TAB)}!E${sheetRow1Based}`, values: [[String(sent)]] },
        { range: `${esc(CAMPAIGNS_TAB)}!F${sheetRow1Based}`, values: [[String(pending)]] },
        { range: `${esc(CAMPAIGNS_TAB)}!G${sheetRow1Based}`, values: [[status]] },
        { range: `${esc(CAMPAIGNS_TAB)}!I${sheetRow1Based}`, values: [[lastRunDate]] },
      ],
    },
  });
}

// ── Main campaign run ──────────────────────────────────────────────────────

async function runCampaigns() {
  if (!config.google.sheetId) return;

  console.log("[CAMPAIGN] ─── Daily campaign run starting ───");

  let sheets;
  try {
    sheets = createSheetsClient();
    await ensureCampaignsTab(sheets);
    await seedDefaultCampaigns(sheets);
  } catch (e) {
    console.error("[CAMPAIGN] Setup error:", e.message);
    return;
  }

  // Read all campaign rows
  let rows;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetId,
      range: `${esc(CAMPAIGNS_TAB)}!A2:I500`,
      majorDimension: "ROWS",
    });
    rows = res.data.values ?? [];
  } catch (e) {
    console.error("[CAMPAIGN] Read error:", e.message);
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  for (let i = 0; i < rows.length; i++) {
    const row         = rows[i];
    const sheetRow    = i + 2; // 1-based, offset by header
    const campaignName = String(row[C.name]     ?? "").trim();
    const category     = String(row[C.category] ?? "").trim();
    const message      = String(row[C.message]  ?? "").trim();
    const status       = String(row[C.status]   ?? "").trim();
    const lastRunDate  = String(row[C.lastRunDate] ?? "").trim();

    if (!campaignName || !category || !message) continue;
    if (status === "Paused" || status === "Completed") {
      console.log(`[CAMPAIGN] Skipping "${campaignName}" (${status})`);
      continue;
    }
    if (lastRunDate === todayStr) {
      console.log(`[CAMPAIGN] Skipping "${campaignName}" — already ran today`);
      continue;
    }

    console.log(`[CAMPAIGN] Running: "${campaignName}" → category: ${category}`);

    // Find matching leads in Memory tab
    const leads = await getLeadsForCategory(sheets, category);
    const totalLeads = leads.length;

    if (totalLeads === 0) {
      console.log(`[CAMPAIGN] No leads found for category: ${category}`);
      await patchCampaignCounts(sheets, sheetRow, 0, 0, 0, "Active", todayStr);
      continue;
    }

    console.log(`[CAMPAIGN] Found ${totalLeads} lead(s) for "${campaignName}"`);

    // Update status to Running
    await patchCampaignCounts(sheets, sheetRow, totalLeads, 0, totalLeads, "Running", todayStr);

    let sent = 0;

    for (const lead of leads) {
      try {
        await sendMessage(lead.phone, message);
        sent++;
        console.log(`[CAMPAIGN] ✅ Sent to ${lead.phone} (${lead.name || "unknown"})`);
      } catch (e) {
        console.error(`[CAMPAIGN] ❌ Failed to send to ${lead.phone}:`, e.message);
      }
      await sleep(SEND_DELAY_MS); // Rate-limit delay
    }

    const finalStatus  = sent >= totalLeads ? "Completed" : sent > 0 ? "Running" : "Active";
    const finalPending = totalLeads - sent;

    await patchCampaignCounts(sheets, sheetRow, totalLeads, sent, finalPending, finalStatus, todayStr);
    console.log(`[CAMPAIGN] "${campaignName}" done — ${sent}/${totalLeads} sent, status: ${finalStatus}`);
  }

  console.log("[CAMPAIGN] ─── Daily campaign run complete ───");
}

// ── Scheduler ─────────────────────────────────────────────────────────────

/**
 * Calculates milliseconds until the next 10:00 AM (UTC+8 / MYT).
 */
function msUntilNext10AM() {
  const now = new Date();
  // Malaysia is UTC+8
  const offsetMs   = 8 * 60 * 60 * 1000;
  const nowMYT     = new Date(now.getTime() + offsetMs);

  const next10AM   = new Date(nowMYT);
  next10AM.setUTCHours(2, 0, 0, 0); // 10:00 MYT = 02:00 UTC

  // If 10am today has already passed, schedule for tomorrow
  if (next10AM <= nowMYT) {
    next10AM.setUTCDate(next10AM.getUTCDate() + 1);
  }

  return next10AM.getTime() - nowMYT.getTime();
}

/**
 * Starts the daily campaign scheduler.
 * First run at next 10:00 AM MYT, then every 24 hours.
 * Called once from server.js.
 */
function startCampaignScheduler() {
  const ms = msUntilNext10AM();
  const hh = Math.floor(ms / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);

  console.log(`[CAMPAIGN] Scheduler started — next run in ${hh}h ${mm}m (10:00 AM MYT)`);

  setTimeout(() => {
    runCampaigns().catch((e) => console.error("[CAMPAIGN] Run error:", e.message));

    // After first run, repeat every 24 hours
    setInterval(() => {
      runCampaigns().catch((e) => console.error("[CAMPAIGN] Run error:", e.message));
    }, 24 * 60 * 60 * 1000);
  }, ms);
}

module.exports = { startCampaignScheduler, runCampaigns };
