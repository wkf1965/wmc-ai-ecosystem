const path = require("path");
const { Router } = require("express");
const { getAIReply } = require("../services/ai.service");
const { sendMessage } = require("../services/whatsapp.service");
const { savePatientMessage } = require("../services/sheets.service");
const { classifyMessage, getNextAction, getLeadStatus, maxLeadStatus } = require("../services/classify.service");
const { syncAllTabs }                   = require("../services/crm.service");
const { loadMemoryByPhone, normalizeDigits } = require(path.join(__dirname, "../../sheetsMemory"));
const { isBusinessOpen, getAfterHoursReply } = require("../config/businessHoursConfig");
const { classifyPatientMessage } = require(path.join(__dirname, "../../classifyPatientMessage"));

const router = Router();

/** Map classifyPatientMessage.js categories into classify.service lead categories + scores. */
const PATIENT_MODULE_TO_LEAD = {
  "Stroke Rehab": { category: "Stroke Rehabilitation Lead", score: 5 },
  "Lumbar / Back Pain": { category: "Pain Rehabilitation Lead", score: 4 },
  "Frozen Shoulder": { category: "Pain Rehabilitation Lead", score: 4 },
  "Tinnitus": { category: "Pain Rehabilitation Lead", score: 4 },
  "Mental Health": { category: "Psychology / Hypnosis Lead", score: 4 },
  "Nursing Home": { category: "Nursing Home Lead", score: 5 },
  "Knee Pain": { category: "Pain Rehabilitation Lead", score: 4 },
  "Gout": { category: "Pain Rehabilitation Lead", score: 4 },
};

/**
 * WHAPI may send `messages` as an array or a single object; status-only payloads have none.
 * @param {object} body
 * @returns {object[]}
 */
function normalizeWhapiMessageList(body) {
  if (!body || typeof body !== "object") return [];
  const m = body.messages;
  if (Array.isArray(m)) return m;
  if (m && typeof m === "object") return [m];
  return [];
}

/**
 * Treat only explicit truthy from_me as self-sent (ignore string quirks).
 * @param {object} msg
 * @returns {boolean}
 */
function isFromMe(msg) {
  const v = msg && msg.from_me;
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v == null) return false;
  return String(v).toLowerCase() === "true" || v === "1";
}

/**
 * WHAPI inbound text can arrive as type "text", "link_preview", "reply", etc.
 * @param {object} msg
 * @returns {string}
 */
function extractInboundText(msg) {
  if (!msg || typeof msg !== "object") return "";

  if (msg.type === "text" && msg.text?.body != null) {
    return String(msg.text.body).trim();
  }
  if (msg.type === "link_preview" && msg.link_preview?.body != null) {
    return String(msg.link_preview.body).trim();
  }
  if (msg.type === "reply") {
    const br = msg.reply?.buttons_reply;
    if (br?.title != null) return String(br.title).trim();
    const list = msg.reply?.list_reply;
    if (list?.title != null) return String(list.title).trim();
  }
  if (msg.type === "interactive") {
    const ir = msg.interactive;
    const btn = ir?.button_reply?.title || ir?.list_reply?.title;
    if (btn != null) return String(btn).trim();
  }

  return "";
}

/**
 * Prefer full chat JID for WHAPI send; bare numbers get @s.whatsapp.net.
 * @param {object} msg
 * @returns {string}
 */
function normalizeChatAddress(msg) {
  const raw = String(msg.chat_id || msg.from || "").trim().replace(/\s/g, "");
  if (!raw) return "";
  if (raw.includes("@")) return raw;
  return `${raw}@s.whatsapp.net`;
}

/**
 * Merge keyword-based classifyPatientMessage.js when primary classifier only yields generic inquiry.
 * @param {string} text
 * @param {{ category: string; score: number; appointmentTime?: string }} primary
 */
function applyPatientModuleClassification(text, primary) {
  if (primary.category === "Appointment Confirmed") return primary;

  const pmCat = classifyPatientMessage(text);
  const mapped = PATIENT_MODULE_TO_LEAD[pmCat];
  if (!mapped) return primary;

  if (primary.category === "General Inquiry" && primary.score <= 1) {
    return { ...primary, category: mapped.category, score: mapped.score };
  }
  return primary;
}

/**
 * Per-phone conversation history (in-memory, capped at MAX_HISTORY turns).
 * Resets on server restart — persistent memory comes from Sheets (see memoryCache).
 * @type {Map<string, { role: string; content: string }[]>}
 */
const chatHistory = new Map();
const MAX_HISTORY = 20;

/**
 * Phones whose Sheets memory has already been loaded this session.
 * Prevents an expensive Sheets read on every single message.
 * @type {Map<string, object|null>}
 */
const memoryCache = new Map();

function getHistory(phone) {
  if (!chatHistory.has(phone)) chatHistory.set(phone, []);
  return chatHistory.get(phone);
}

function addToHistory(phone, role, content) {
  const history = getHistory(phone);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

/**
 * Loads persistent memory from Sheets on the FIRST message from a phone
 * in this server session. Subsequent messages use the cached value.
 * Returns null if no record found or Sheets unavailable.
 *
 * @param {string} phone
 * @returns {Promise<object|null>}
 */
async function getCustomerMemory(phone) {
  if (memoryCache.has(phone)) return memoryCache.get(phone);

  let memory = null;
  try {
    memory = await loadMemoryByPhone(phone);
  } catch (e) {
    console.warn(`[MEMORY] Could not load memory for ${phone}:`, e.message);
  }

  memoryCache.set(phone, memory);

  if (memory) {
    console.log(`[MEMORY] ✅ Loaded history for ${phone} — last category: ${memory.category || "unknown"}`);
  } else {
    console.log(`[MEMORY] 🆕 New customer: ${phone}`);
  }

  return memory;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** GET /webhook — WHAPI hub verification */
router.get("/", (_req, res) => {
  res.json({ status: "ok", service: "WMC WhatsApp AI" });
});

/**
 * POST /webhook — main WHAPI message handler
 *
 * Flow per inbound message:
 *   1. Classify message → category + lead score
 *   2. Build conversation history
 *   3. Get DeepSeek AI reply
 *   4. Save full row to Google Sheet (async, non-blocking)
 *   5. Send AI reply via WHAPI
 */
router.post("/", async (req, res) => {
  // Respond immediately — WHAPI retries if it doesn't get 200 fast
  res.json({ status: "received" });

  try {
    const body = req.body || {};
    const rawList = body.messages;
    const messages = normalizeWhapiMessageList(body);

    console.log("[WEBHOOK_RECEIVED]", JSON.stringify({
      event: body.event,
      channel_id: body.channel_id,
      messagesLen: Array.isArray(rawList) ? rawList.length : (rawList ? 1 : 0),
      normalizedCount: messages.length,
      topKeys: Object.keys(body),
    }));

    if (messages.length === 0) {
      console.log("[INCOMING_MESSAGE] skipped: no messages array in payload (status-only or empty)");
      return;
    }

    for (const msg of messages) {
      try {
        if (isFromMe(msg)) {
          console.log("[INCOMING_MESSAGE_SKIPPED] from_me=true");
          continue;
        }

        const text = extractInboundText(msg);
        const phone = normalizeChatAddress(msg);
        const name = String(msg.from_name || msg.pushname || "").trim();

        if (!phone || !text) {
          console.log("[INCOMING_MESSAGE] skipped: unsupported or empty payload", {
            type: msg.type,
            hasPhone: Boolean(phone),
            hasText: Boolean(text),
          });
          continue;
        }

        console.log("[INCOMING_MESSAGE]");
        const accountDigits = normalizeDigits(process.env.WHAPI_ACCOUNT_PHONE || "");
        const senderDigits = normalizeDigits(phone);
        const sameAsConnectedNumber =
          accountDigits.length > 0 ? senderDigits === accountDigits : null;
        console.log("[MESSAGE_FROM]", JSON.stringify({
          phone,
          senderDigits,
          whapiAccountDigits: accountDigits || null,
          sameAsConnectedNumber,
          compareHint: accountDigits ? null : "set WHAPI_ACCOUNT_PHONE in .env to compare sender vs linked WhatsApp number",
          name: name || "unknown",
          raw_from_me: msg.from_me,
          chat_id: msg.chat_id || "",
          type: msg.type,
        }));

        const timestamp = new Date().toISOString();

        // ── 1. Load persistent memory first (needed for status protection) ────
        const customerMemory = await getCustomerMemory(phone);

        // ── 2. Classify + Next Action + Lead Status ───────────────────────────
        const primary = classifyMessage(text);
        const { category, score: leadScore, appointmentTime = "" } = applyPatientModuleClassification(text, primary);
        const nextAction = getNextAction({ category, score: leadScore, message: text });

        // Compute status for this message, then protect against downgrade:
        const freshStatus   = getLeadStatus({ category, score: leadScore, nextAction, message: text });
        const storedStatus  = customerMemory?.leadType || "Cold Lead";
        const leadStatus    = maxLeadStatus(freshStatus, storedStatus);

        const isApptConfirmed = category === "Appointment Confirmed"
                             || nextAction === "Prepare Appointment"
                             || nextAction === "Confirm Appointment Time";

        const pipelineStage =
          leadStatus === "Patient"   ? "Long-term Care"       :
          leadStatus === "Converted" ? "Patient Visit"        :
          leadStatus === "Hot Lead"  ? "Appointment Booked"   :
          isApptConfirmed            ? "Appointment Booked"   :
          category  === "General Inquiry" ? "Contacted"       :
          "Assessment Interested";

        const appointmentDate = pipelineStage === "Appointment Booked"
          ? (appointmentTime || new Date().toISOString().slice(0, 10))
          : "";

        console.log(`[IN]  ${phone} (${name || "unknown"}) [${category} | ${leadStatus}${storedStatus !== freshStatus ? " (kept from " + storedStatus + ")" : ""} | ${pipelineStage}${appointmentTime ? " | " + appointmentTime : ""}]: ${text}`);

        const businessOpen = isBusinessOpen();
        console.log("[BUSINESS_HOURS_CHECK]", { open: businessOpen });

        // ── 3. Business hours ─────────────────────────────────────────────────
        if (!businessOpen) {
          const afterHoursReply = getAfterHoursReply(text);
          console.log(`[BUSINESS HOURS] Centre closed — sending after-hours reply to ${phone}`);

          savePatientMessage({
            phone, name, message: text, category,
            reply: afterHoursReply, leadStatus, pipelineStage,
            appointmentDate, nextAction, timestamp,
          }).catch((err) => {
            console.error(`[SHEETS] ❌ after-hours save failed for ${phone}:`, err?.message || err);
          });

          syncAllTabs({ phone, name, message: text, category, reply: afterHoursReply,
            leadScore, nextAction, timestamp, appointmentTime, pipelineStage, leadStatus })
            .catch((err) => console.error(`[CRM] ❌ syncAllTabs failed for ${phone}:`, err?.message || err));

          await sendMessage(phone, afterHoursReply);
          console.log(`[OUT] ${phone}: [AFTER-HOURS] ${afterHoursReply.slice(0, 60)}…`);
          continue;
        }

        // ── 4. Conversation history ───────────────────────────────────────────
        addToHistory(phone, "user", text);

        // ── 5. AI reply ───────────────────────────────────────────────────────
        const reply = await getAIReply(getHistory(phone), customerMemory);
        if (!reply) {
          console.log("[INCOMING_MESSAGE] skipped: empty AI reply");
          continue;
        }

        console.log("[AI_REPLY_GENERATED]");

        addToHistory(phone, "assistant", reply);

        if (name && customerMemory) customerMemory.name = customerMemory.name || name;

        savePatientMessage({
          phone,
          name,
          message: text,
          category,
          reply,
          leadStatus,
          pipelineStage,
          appointmentDate,
          nextAction,
          timestamp,
        }).catch((err) => {
          const apiMsg = err?.response?.data?.error?.message;
          console.error(`[SHEETS] ❌ save failed for ${phone}:`, apiMsg || err?.message || err);
        });

        syncAllTabs({ phone, name, message: text, category, reply, leadScore, nextAction, timestamp, appointmentTime, pipelineStage, leadStatus })
          .catch((err) => console.error(`[CRM] ❌ syncAllTabs failed for ${phone}:`, err?.message || err));

        await sendMessage(phone, reply);
        console.log(`[OUT] ${phone}: ${reply.slice(0, 80)}…`);

      } catch (err) {
        console.error("[WEBHOOK_ERROR]", err.message);
      }
    }
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err.message);
  }
});

module.exports = router;
