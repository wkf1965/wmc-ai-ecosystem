/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Lead Scoring Service                                     ║
 * ║                                                                          ║
 * ║  Scans every lead in the Pipeline tab, computes a fresh numeric score   ║
 * ║  and derived lead status (Cold/Warm/Hot), then writes back any row      ║
 * ║  whose status has improved.  The never-downgrade rule prevents a        ║
 * ║  confirmed appointment (Hot Lead) from reverting to Cold even if the    ║
 * ║  customer has been quiet for a few days.                                ║
 * ║                                                                          ║
 * ║  Scoring model:                                                          ║
 * ║   Category / pipeline stage → base score                                ║
 * ║   Behavioral signals (price enquiry, appt intent) → +bonus              ║
 * ║   Time decay (silent ≥ 3 days) → −penalty                               ║
 * ║   Score 0–100  →  Cold < 35 ≤ Warm < 70 ≤ Hot                          ║
 * ║                                                                          ║
 * ║  Called from: loops/leadScoringLoop.js                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Scoring rules at a glance:
 *   Confirmed appointment         +50
 *   Appointment intent in message +30
 *   Pipeline: Appointment Booked  +30
 *   Specialist category           +15–20
 *   Asked about price             +10
 *   Fast reply (≤ 1 day)          +10
 *   General inquiry               +5
 *   Silent 3+ days                −20
 *   Silent 7+ days (extra)        −10
 */

"use strict";

const { google }        = require("googleapis");
const fs                = require("fs");
const path              = require("path");
const { updatePipeline } = require("../sheetsPipeline");
const { STATUS_RANK, maxLeadStatus } = require("../src/services/classify.service");

require("dotenv").config();

// ── Config ────────────────────────────────────────────────────────────────────

const SHEET_ID   = process.env.GOOGLE_SHEET_ID || "";
const CREDS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./google-credentials.json";

const PIPELINE_TAB = String(process.env.GOOGLE_SHEET_PIPELINE_TAB || "Pipeline").trim() || "Pipeline";
const MEMORY_TAB   = String(process.env.GOOGLE_SHEET_MEMORY_TAB   || "Memory"  ).trim() || "Memory";

// ── Column indices (0-based, must match each tab's HEADERS) ──────────────────

const PIPE_COL = {
  name:          0,   // A
  phone:         1,   // B
  category:      2,   // C
  leadType:      3,   // D  ← this is what we update (Cold/Warm/Hot Lead)
  pipelineStage: 4,   // E
  lastFollowUp:  5,   // F
  appointment:   6,   // G
  status:        7,   // H
  updatedAt:     8,   // I
};

const MEM_COL = {
  phone:       0,   // A
  name:        1,   // B
  category:    2,   // C
  leadType:    3,   // D
  lastMessage: 4,   // E
  lastReply:   5,   // F
  updatedAt:   6,   // G
};

// ── Log file ──────────────────────────────────────────────────────────────────

const LOG_FILE = path.join(__dirname, "../logs/leadScoring.log");

// ── Score thresholds ──────────────────────────────────────────────────────────

const HOT_THRESHOLD  = 70;
const WARM_THRESHOLD = 35;

// ── Keyword sets ──────────────────────────────────────────────────────────────

const PRICE_KEYWORDS = [
  "价钱", "价格", "费用", "收费", "多少钱", "怎么收费",
  "price", "cost", "how much", "fee", "charge",
];

const APPT_INTENT_KEYWORDS = [
  "预约", "appointment", "book",
  "什么时候", "几点", "时间", "可以去吗", "想去",
  "when", "schedule", "slot",
];

const HOT_CONFIRM_KEYWORDS = [
  "确认", "确定", "会来", "我来", "我会来", "我会去", "我过来",
  "发地址", "怎么去", "导航",
  "confirm", "confirmed", "i'll come", "i will come", "i'm coming",
  "coming", "i'll be there",
];

// ── Scoring rules ─────────────────────────────────────────────────────────────

/**
 * Each rule:
 *   label:     shown in the log for auditability
 *   condition: (lead) => boolean  — lead has pipeline + memory fields merged
 *   points:    positive (bonus) or negative (penalty)
 */
const SCORING_RULES = [
  // ── Category base ─────────────────────────────────────────────────────────
  {
    label:     "Appointment Confirmed category",
    condition: (l) => l.category === "Appointment Confirmed",
    points:    50,
  },
  {
    label:     "Specialist category (Stroke / Nursing Home)",
    condition: (l) => ["Stroke Rehabilitation Lead", "Nursing Home Lead"].includes(l.category),
    points:    20,
  },
  {
    label:     "Specialist category (Pain / Psychology)",
    condition: (l) => ["Pain Rehabilitation Lead", "Psychology / Hypnosis Lead"].includes(l.category),
    points:    15,
  },
  {
    label:     "General Inquiry category",
    condition: (l) => l.category === "General Inquiry",
    points:    5,
  },

  // ── Pipeline stage ────────────────────────────────────────────────────────
  {
    label:     "Pipeline: Patient Visit / Long-term Care",
    condition: (l) => ["Patient Visit", "Long-term Care"].includes(l.pipelineStage),
    points:    40,
  },
  {
    label:     "Pipeline: Appointment Booked / Confirmed",
    condition: (l) =>
      l.pipelineStage === "Appointment Booked" ||
      l.pipelineStage === "Appointment Confirmed",
    points:    30,
  },
  {
    label:     "Pipeline: Assessment Interested",
    condition: (l) => l.pipelineStage === "Assessment Interested",
    points:    10,
  },

  // ── Message behaviour ─────────────────────────────────────────────────────
  {
    label:     "Message: Asked about price (+10)",
    condition: (l) => containsAny(l.lastMessage, PRICE_KEYWORDS),
    points:    10,
  },
  {
    label:     "Message: Appointment intent (+30)",
    condition: (l) => containsAny(l.lastMessage, APPT_INTENT_KEYWORDS),
    points:    30,
  },
  {
    label:     "Message: Hot confirmation keywords (+20)",
    condition: (l) => containsAny(l.lastMessage, HOT_CONFIRM_KEYWORDS),
    points:    20,
  },

  // ── Time signals ──────────────────────────────────────────────────────────
  {
    label:     "Activity: Fast reply (≤ 1 day) (+10)",
    condition: (l) => l.daysSinceActivity !== null && l.daysSinceActivity <= 1,
    points:    10,
  },
  {
    label:     "Decay: Silent 3+ days (−20)",
    condition: (l) => l.daysSinceActivity !== null && l.daysSinceActivity >= 3,
    points:    -20,
  },
  {
    label:     "Decay: Silent 7+ days extra (−10)",
    condition: (l) => l.daysSinceActivity !== null && l.daysSinceActivity >= 7,
    points:    -10,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function containsAny(text, keywords) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  return keywords.some((kw) =>
    /[^\u0000-\u007f]/.test(kw) ? text.includes(kw) : lower.includes(kw.toLowerCase()),
  );
}

function daysSince(isoString) {
  if (!isoString) return null;
  const ms = Date.now() - new Date(isoString).getTime();
  return isNaN(ms) ? null : Math.floor(ms / (1000 * 60 * 60 * 24));
}

function esc(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

function createSheetsClient() {
  const keyFile = path.resolve(CREDS_PATH);
  if (!fs.existsSync(keyFile)) throw new Error(`Credentials not found: ${keyFile}`);
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function appendLog(entry) {
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      LOG_FILE,
      JSON.stringify({ ...entry, time: new Date().toISOString() }) + "\n",
      "utf8",
    );
  } catch (e) {
    console.warn("[LEAD_SCORING] Could not write log:", e.message);
  }
}

// ── Scoring engine (pure function) ────────────────────────────────────────────

/**
 * Compute numeric score and derived lead status for one lead.
 *
 * @param {{
 *   phone:            string;
 *   name?:            string;
 *   category?:        string;
 *   pipelineStage?:   string;
 *   lastMessage?:     string;
 *   updatedAt?:       string;     // most recent activity timestamp
 *   existingLeadType?: string;    // current stored status (for never-downgrade)
 * }} lead
 *
 * @returns {{
 *   score:      number;
 *   leadStatus: string;
 *   reasons:    { label: string; points: number }[];
 *   protected:  boolean;          // true if never-downgrade kicked in
 * }}
 */
function computeScore(lead) {
  const enriched = {
    ...lead,
    daysSinceActivity: daysSince(lead.updatedAt),
  };

  const reasons = [];
  let rawScore  = 0;

  for (const rule of SCORING_RULES) {
    if (rule.condition(enriched)) {
      reasons.push({ label: rule.label, points: rule.points });
      rawScore += rule.points;
    }
  }

  // Clamp to 0–100
  const score = Math.min(100, Math.max(0, rawScore));

  // Classify
  let freshStatus;
  if (score >= HOT_THRESHOLD)   freshStatus = "Hot Lead";
  else if (score >= WARM_THRESHOLD) freshStatus = "Warm Lead";
  else freshStatus = "Cold Lead";

  // Never-downgrade: apply STATUS_RANK
  const storedStatus = lead.existingLeadType || "Cold Lead";
  const leadStatus   = maxLeadStatus(freshStatus, storedStatus);
  const protected_   = STATUS_RANK[leadStatus] > STATUS_RANK[freshStatus];

  return { score, leadStatus, reasons, protected: protected_ };
}

// ── Google Sheets bulk readers ────────────────────────────────────────────────

/**
 * Read all Pipeline rows (bulk — one API call).
 * @returns {Promise<Array>}
 */
async function readAllPipelineRows(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${esc(PIPELINE_TAB)}!A2:I5000`,
    majorDimension: "ROWS",
  });
  return (res.data.values ?? []).map((row, i) => ({
    _sheetRow:     i + 2,
    name:          String(row[PIPE_COL.name]          ?? "").trim(),
    phone:         String(row[PIPE_COL.phone]         ?? "").trim(),
    category:      String(row[PIPE_COL.category]      ?? "").trim(),
    existingLeadType: String(row[PIPE_COL.leadType]   ?? "").trim(),
    pipelineStage: String(row[PIPE_COL.pipelineStage] ?? "").trim(),
    lastFollowUp:  String(row[PIPE_COL.lastFollowUp]  ?? "").trim(),
    appointment:   String(row[PIPE_COL.appointment]   ?? "").trim(),
    status:        String(row[PIPE_COL.status]        ?? "").trim(),
    updatedAt:     String(row[PIPE_COL.updatedAt]     ?? "").trim(),
    lastMessage:   "", // filled in from Memory below
  }));
}

/**
 * Read all Memory rows and return a Map keyed by normalised phone number.
 * @returns {Promise<Map<string, object>>}
 */
async function readMemoryMap(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${esc(MEMORY_TAB)}!A2:G5000`,
    majorDimension: "ROWS",
  });
  const map = new Map();
  for (const row of res.data.values ?? []) {
    const phone = String(row[MEM_COL.phone] ?? "").replace(/\D/g, "");
    if (!phone) continue;
    map.set(phone, {
      lastMessage: String(row[MEM_COL.lastMessage] ?? "").trim(),
      updatedAt:   String(row[MEM_COL.updatedAt]   ?? "").trim(),
      category:    String(row[MEM_COL.category]    ?? "").trim(),
    });
  }
  return map;
}

// ── Main run function ─────────────────────────────────────────────────────────

/**
 * Full scoring pass.
 *
 * @returns {Promise<{
 *   total:     number;
 *   upgraded:  number;
 *   protected: number;
 *   unchanged: number;
 *   errors:    number;
 * }>}
 */
async function run() {
  const tag = "[LEAD_SCORING]";

  if (!SHEET_ID) {
    console.warn(`${tag} GOOGLE_SHEET_ID not set — skipping cycle`);
    return { total: 0, upgraded: 0, protected: 0, unchanged: 0, errors: 0 };
  }

  console.log(`${tag} Cycle start — scoring all pipeline leads…`);

  let sheets;
  try {
    sheets = createSheetsClient();
  } catch (err) {
    console.error(`${tag} Auth error:`, err.message);
    throw err;
  }

  // ── Bulk reads (parallel) ─────────────────────────────────────────────────

  let pipelineRows = [];
  let memoryMap    = new Map();

  try {
    [pipelineRows, memoryMap] = await Promise.all([
      readAllPipelineRows(sheets),
      readMemoryMap(sheets).catch((e) => {
        console.warn(`${tag} Memory tab read failed (non-fatal):`, e.message);
        return new Map();
      }),
    ]);
  } catch (err) {
    console.error(`${tag} Pipeline read error:`, err.message);
    throw err;
  }

  console.log(
    `${tag} Loaded ${pipelineRows.length} pipeline rows, ${memoryMap.size} memory entries`,
  );

  let upgraded  = 0;
  let protected_ = 0;
  let unchanged = 0;
  let errors    = 0;

  // ── Score each lead ───────────────────────────────────────────────────────

  for (const lead of pipelineRows) {
    if (!lead.phone) continue;

    const normPhone = lead.phone.replace(/\D/g, "");

    // Enrich from Memory tab
    const mem = memoryMap.get(normPhone);
    if (mem) {
      lead.lastMessage = mem.lastMessage || lead.lastMessage;
      // If memory has a more recent timestamp, use that
      if (mem.updatedAt && (!lead.updatedAt || mem.updatedAt > lead.updatedAt)) {
        lead.updatedAt = mem.updatedAt;
      }
      // If memory has a more specific category, prefer it
      if (mem.category && !lead.category) {
        lead.category = mem.category;
      }
    }

    // Compute score
    const { score, leadStatus, reasons, protected: wasProtected } = computeScore(lead);

    const changed  = leadStatus !== lead.existingLeadType;
    const upgraded_ = changed && STATUS_RANK[leadStatus] > STATUS_RANK[lead.existingLeadType || "Cold Lead"];

    console.log(
      `${tag} ${lead.phone.slice(-6)} | ` +
      `score=${score} | ` +
      `${lead.existingLeadType || "–"} → ${leadStatus}` +
      (wasProtected ? " [PROTECTED]" : "") +
      (changed && upgraded_ ? " ✅ UPGRADED" : changed ? " ⚠ protected" : " — no change"),
    );

    // ── Write back if status changed ────────────────────────────────────────

    if (changed) {
      try {
        await updatePipeline(lead.phone, {
          leadType:  leadStatus,
          updatedAt: new Date().toISOString(),
        });

        if (wasProtected) protected_++;
        else              upgraded++;

        appendLog({
          action:       "update",
          phone:        lead.phone,
          score,
          oldStatus:    lead.existingLeadType || "Cold Lead",
          newStatus:    leadStatus,
          protected:    wasProtected,
          daysSince:    daysSince(lead.updatedAt),
          reasons:      reasons.map((r) => `${r.label} (${r.points > 0 ? "+" : ""}${r.points})`),
        });
      } catch (err) {
        console.error(`${tag} Pipeline update failed for ${lead.phone}:`, err.message);
        errors++;
        appendLog({ action: "error", phone: lead.phone, error: err.message });
      }
    } else {
      unchanged++;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  const total   = pipelineRows.filter((l) => l.phone).length;
  const summary = { total, upgraded, protected: protected_, unchanged, errors };

  console.log(
    `${tag} ✅ Cycle done — total=${total} upgraded=${upgraded} ` +
    `protected=${protected_} unchanged=${unchanged} errors=${errors}`,
  );

  appendLog({ action: "cycle", ...summary });

  return summary;
}

// ── Exposed for testing ───────────────────────────────────────────────────────

module.exports = { run, computeScore, SCORING_RULES, HOT_THRESHOLD, WARM_THRESHOLD };
