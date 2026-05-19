/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Follow-up Service                                        ║
 * ║                                                                          ║
 * ║  Orchestrates the full follow-up pipeline for leads that have gone      ║
 * ║  silent after initial contact:                                           ║
 * ║                                                                          ║
 * ║  1. Read "Follow Up Queue" tab — find PENDING rows past their due time  ║
 * ║  2. Generate personalized AI follow-up message via DeepSeek             ║
 * ║     (message tone & content vary by lead status + category)             ║
 * ║  3. Send WhatsApp via WHAPI                                              ║
 * ║  4. Mark row SENT in Follow Up Queue                                    ║
 * ║  5. Update Pipeline "LastFollowUp" date                                  ║
 * ║  6. Append structured entry to logs/followup.log                        ║
 * ║                                                                          ║
 * ║  Called from: loops/followupLoop.js (via loopBootstrap or standalone)   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

const { google }      = require("googleapis");
const fs              = require("fs");
const path            = require("path");
const OpenAI          = require("openai");

require("dotenv").config();

const { sendMessage }    = require("../src/services/whatsapp.service");
const { updatePipeline } = require("../sheetsPipeline");

// ── Config ────────────────────────────────────────────────────────────────────

const SHEET_ID   = process.env.GOOGLE_SHEET_ID || "";
const CREDS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./google-credentials.json";

const AI_BASE_URL = (process.env.OPENAI_API_BASE  || "https://api.deepseek.com").replace(/\/$/, "");
const AI_API_KEY  = process.env.DEEPSEEK_API_KEY  || process.env.OPENAI_API_KEY || "";
const AI_MODEL    = process.env.OPENAI_MODEL       || "deepseek-chat";

const WMC_ADDRESS = "14 Jalan Lapangan Siber 1, Bandar Cyber, 31350 Ipoh, Perak";
const WMC_PHONE   = "012-4520077";

// ── Follow Up Queue schema (must stay in sync with followUpScheduler.js) ─────

const FUQ_TAB = "Follow Up Queue";
const FUQ_COL = {
  createdTime:    0,
  phone:          1,
  customerMessage: 2,
  category:       3,
  leadScore:      4,
  lastAiReply:    5,
  followUpTime:   6,
  followUpStatus: 7,
  followUpMessage: 8,
};

// ── Pipeline patch field names (matches sheetsPipeline.js HEADERS) ──────────

// When a follow-up is sent, we update: LastFollowUp + Status columns.
const PIPELINE_FOLLOW_UP_STATUS = "Follow Up Sent";

// ── Log file ──────────────────────────────────────────────────────────────────

const LOG_FILE = path.join(__dirname, "../logs/followup.log");

// ── AI client ─────────────────────────────────────────────────────────────────

const aiClient = AI_API_KEY
  ? new OpenAI({ apiKey: AI_API_KEY, baseURL: AI_BASE_URL })
  : null;

// ── Category → service description map (for AI context) ──────────────────────

const CATEGORY_DESC = {
  "Pain Rehabilitation Lead":   "pain rehabilitation, physiotherapy and acupuncture",
  "Stroke Rehabilitation Lead": "stroke rehabilitation and physical recovery",
  "Psychology / Hypnosis Lead": "psychological counselling and clinical hypnotherapy",
  "Nursing Home Lead":          "nursing home care, elderly care and long-term residential rehabilitation",
  "General Inquiry":            "WMC's full range of medical services",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function createSheetsClient() {
  const keyFile = path.resolve(CREDS_PATH);
  if (!fs.existsSync(keyFile)) throw new Error(`Credentials not found: ${keyFile}`);
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function esc(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

function daysSince(isoString) {
  if (!isoString) return null;
  const ms = Date.now() - new Date(isoString).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// ── Structured logger ─────────────────────────────────────────────────────────

function appendLog(entry) {
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ ...entry, time: new Date().toISOString() }) + "\n";
    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch (err) {
    console.warn("[FOLLOWUP_SVC] Could not write log:", err.message);
  }
}

// ── AI follow-up message generation ──────────────────────────────────────────

/**
 * Builds the system prompt for follow-up message generation.
 * Tone and content vary by lead status so each type gets relevant outreach.
 */
function buildFollowUpSystemPrompt(leadStatus, category) {
  const service     = CATEGORY_DESC[category] || CATEGORY_DESC["General Inquiry"];
  const statusLower = (leadStatus || "Cold Lead").toLowerCase();

  let toneLine = "";
  let strategyLine = "";

  if (statusLower.includes("hot")) {
    toneLine = "This is a Hot Lead who has shown strong intent and may have an appointment pending.";
    strategyLine = `Gently remind them about their upcoming appointment or ask if they are ready to confirm a visit date. Be encouraging and warm.`;
  } else if (statusLower.includes("warm")) {
    toneLine = "This is a Warm Lead who has shown genuine interest in our services.";
    strategyLine = `Re-engage by referencing their specific interest in ${service}. Invite them to ask more questions or schedule a consultation.`;
  } else {
    toneLine = "This is a Cold Lead who enquired once but did not continue the conversation.";
    strategyLine = `Gently check in. Remind them WMC provides ${service}. Keep it soft — no pressure.`;
  }

  return `你是黄氏医疗中心（Wong Medical Centre，WMC）的专业跟进助理。
你的任务是生成一条温暖、专业的 WhatsApp 跟进信息，发给一位暂时没有回复的潜在客户。

${toneLine}
${strategyLine}

规则：
- 用中文（简体）回复
- 不超过 120 字
- 语气：温暖、关心、有人情味，像朋友一样，不像广告
- 结尾必须包含：
  📍 ${WMC_ADDRESS}
  📞 WhatsApp: ${WMC_PHONE}
- 不要重复使用模板语句，每次稍作变化`;
}

/**
 * Calls DeepSeek to generate a personalized follow-up WhatsApp message.
 * Falls back to a fixed template if AI is unavailable.
 *
 * @param {{
 *   phone:         string;
 *   category:      string;
 *   leadStatus:    string;
 *   lastMessage:   string;
 *   daysSilent:    number | null;
 * }} lead
 * @returns {Promise<string>}
 */
async function generateFollowUpMessage(lead) {
  // Fixed fallback (used if AI client not configured or call fails)
  const fallback = `您好 😊 这里是 Wong Medical Centre。
您之前有咨询过我们的服务，请问您目前的情况有没有好一些？
如有需要，我们很乐意为您安排进一步了解或预约评估。
📍 ${WMC_ADDRESS}
📞 WhatsApp: ${WMC_PHONE}`;

  if (!aiClient) {
    console.warn("[FOLLOWUP_SVC] AI client not configured — using fallback message");
    return fallback;
  }

  const systemPrompt = buildFollowUpSystemPrompt(lead.leadStatus, lead.category);

  const userContent = [
    lead.lastMessage  ? `客户上次询问：${lead.lastMessage}` : "",
    lead.category     ? `咨询类别：${lead.category}` : "",
    lead.leadStatus   ? `客户状态：${lead.leadStatus}` : "",
    lead.daysSilent !== null ? `已沉默天数：${lead.daysSilent} 天` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent || "请生成跟进信息" },
      ],
    });
    const msg = res.choices?.[0]?.message?.content?.trim() || "";
    return msg || fallback;
  } catch (err) {
    console.error("[FOLLOWUP_SVC] AI generation failed:", err.message, "— using fallback");
    return fallback;
  }
}

// ── Derive lead status from score + category ──────────────────────────────────

function inferLeadStatus(category, rawScore) {
  const score = Number(rawScore) || 0;
  if (category === "Appointment Confirmed")                       return "Hot Lead";
  if (score >= 70)                                                return "Hot Lead";
  if (score >= 40 || (category && category !== "General Inquiry")) return "Warm Lead";
  return "Cold Lead";
}

// ── Core run function ─────────────────────────────────────────────────────────

/**
 * One execution cycle of the follow-up loop.
 *
 * Reads Follow Up Queue, processes every PENDING row that is past its due
 * time, generates an AI follow-up, sends it, and writes back all status
 * updates.
 *
 * @returns {Promise<{ checked: number; sent: number; errors: number }>}
 */
async function run() {
  const tag = "[FOLLOWUP_SVC]";

  if (!SHEET_ID) {
    console.warn(`${tag} GOOGLE_SHEET_ID not set — skipping cycle`);
    return { checked: 0, sent: 0, errors: 0 };
  }

  console.log(`${tag} Cycle start — checking Follow Up Queue…`);

  let sheets;
  try {
    sheets = createSheetsClient();
  } catch (err) {
    console.error(`${tag} Auth error:`, err.message);
    throw err; // let the loop registry mark this as "error"
  }

  // ── Read all rows from Follow Up Queue ────────────────────────────────────

  let rows = [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${esc(FUQ_TAB)}!A2:I5000`,
      majorDimension: "ROWS",
    });
    rows = res.data.values ?? [];
  } catch (err) {
    console.error(`${tag} Failed to read Follow Up Queue:`, err.message);
    throw err;
  }

  const now     = Date.now();
  let checked   = 0;
  let sent      = 0;
  let errors    = 0;

  // ── Process each PENDING row ───────────────────────────────────────────────

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i];
    const status = String(row[FUQ_COL.followUpStatus] ?? "").trim().toUpperCase();
    const phone  = String(row[FUQ_COL.phone]          ?? "").trim();
    const fupRaw = String(row[FUQ_COL.followUpTime]   ?? "").trim();

    if (status !== "PENDING") continue;
    if (!phone)               continue;

    const fupTime = fupRaw ? new Date(fupRaw).getTime() : NaN;
    if (isNaN(fupTime) || fupTime > now) continue; // not due yet

    checked++;
    const sheetRow = i + 2; // 1-based

    const category   = String(row[FUQ_COL.category]       ?? "General Inquiry");
    const rawScore   = String(row[FUQ_COL.leadScore]       ?? "0");
    const lastMsg    = String(row[FUQ_COL.customerMessage] ?? "");
    const createdRaw = String(row[FUQ_COL.createdTime]     ?? "");
    const leadStatus = inferLeadStatus(category, rawScore);
    const daysSilent = daysSince(createdRaw);

    console.log(
      `${tag} Due row ${sheetRow} — phone=${phone} status="${leadStatus}" category="${category}" silent=${daysSilent}d`,
    );

    // ── 1. Generate personalized AI follow-up message ──────────────────────

    let message;
    try {
      message = await generateFollowUpMessage({ phone, category, leadStatus, lastMessage: lastMsg, daysSilent });
      console.log(`${tag} AI message generated for ${phone} (${message.length} chars)`);
    } catch (err) {
      console.error(`${tag} Message generation failed for ${phone}:`, err.message);
      errors++;
      appendLog({ phone, sheetRow, action: "error", stage: "generate", error: err.message, category, leadStatus });
      continue;
    }

    // ── 2. Send WhatsApp ───────────────────────────────────────────────────

    try {
      await sendMessage(phone, message);
      console.log(`${tag} ✅ WhatsApp sent to ${phone}`);
    } catch (err) {
      console.error(`${tag} ❌ WhatsApp send failed for ${phone}:`, err.message);
      errors++;
      appendLog({ phone, sheetRow, action: "error", stage: "whatsapp", error: err.message, category, leadStatus });
      continue; // don't mark SENT if delivery failed
    }

    // ── 3. Mark SENT in Follow Up Queue ──────────────────────────────────

    const sentAt = new Date().toISOString();
    try {
      // Update col H (followUpStatus) to SENT, and col I (followUpMessage) to actual AI message
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${esc(FUQ_TAB)}!H${sheetRow}:I${sheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { majorDimension: "ROWS", values: [["SENT", message]] },
      });
      console.log(`${tag} ✅ Follow Up Queue row ${sheetRow} → SENT`);
    } catch (err) {
      console.error(`${tag} ❌ Failed to mark SENT at row ${sheetRow}:`, err.message);
    }

    // ── 4. Update Pipeline — LastFollowUp + Status ─────────────────────────

    try {
      await updatePipeline(phone, {
        lastFollowUp: sentAt,
        status:       PIPELINE_FOLLOW_UP_STATUS,
        updatedAt:    sentAt,
      });
      console.log(`${tag} ✅ Pipeline updated for ${phone} → "${PIPELINE_FOLLOW_UP_STATUS}"`);
    } catch (err) {
      // Pipeline update failure is non-critical — follow-up was still delivered
      console.warn(`${tag} Pipeline update failed for ${phone}:`, err.message);
    }

    // ── 5. Append to log ──────────────────────────────────────────────────

    appendLog({
      phone,
      sheetRow,
      action:       "sent",
      category,
      leadStatus,
      daysSilent,
      messagePreview: message.slice(0, 80) + (message.length > 80 ? "…" : ""),
    });

    sent++;
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  if (checked === 0) {
    console.log(`${tag} No follow-ups due — ${rows.length} rows scanned`);
  } else {
    console.log(`${tag} Cycle done — checked=${checked} sent=${sent} errors=${errors}`);
  }

  appendLog({
    action:  "cycle",
    rowsScanned: rows.length,
    checked,
    sent,
    errors,
  });

  return { checked, sent, errors };
}

module.exports = { run, generateFollowUpMessage };
