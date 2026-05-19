/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Utilities                                     ║
 * ║                                                              ║
 * ║  Purpose: Shared helper functions used across all modules.  ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

"use strict";

// ── Date / Time ───────────────────────────────────────────────────────────────

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

/**
 * Return the current time in MYT (UTC+8) as an ISO string.
 * @returns {string}
 */
function nowMYT() {
  return new Date(Date.now() + MYT_OFFSET_MS).toISOString().replace("Z", "+08:00");
}

/**
 * Format a Date to "YYYY-MM-DD" in MYT.
 * @param {Date} [date]
 * @returns {string}
 */
function dateMYT(date = new Date()) {
  return new Date(date.getTime() + MYT_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Check if two ISO timestamps are on the same calendar day (MYT).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameDay(a, b) {
  return dateMYT(new Date(a)) === dateMYT(new Date(b));
}

// ── Phone / String ────────────────────────────────────────────────────────────

/**
 * Normalise a WhatsApp chat_id to digits only.
 * "60124520077@s.whatsapp.net" → "60124520077"
 * @param {string} raw
 * @returns {string}
 */
function normalisePhone(raw) {
  return String(raw || "").replace(/[^\d]/g, "");
}

/**
 * Truncate a string to maxLen, appending "…" if needed.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen = 80) {
  if (!str) return "";
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + "…";
}

/**
 * Safely escape a Google Sheets tab title for use in range notation.
 * @param {string} title
 * @returns {string}
 */
function escSheetTitle(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

// ── Async ─────────────────────────────────────────────────────────────────────

/**
 * Sleep for N milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async function up to `retries` times with exponential backoff.
 * @param {() => Promise<T>} fn
 * @param {number} retries
 * @param {number} baseDelayMs
 * @returns {Promise<T>}
 */
async function retry(fn, retries = 3, baseDelayMs = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      const delay = baseDelayMs * Math.pow(2, i);
      console.warn(`[utils.retry] Attempt ${i + 1} failed: ${err.message}. Retrying in ${delay}ms…`);
      await sleep(delay);
    }
  }
}

// ── Logging ───────────────────────────────────────────────────────────────────

/**
 * Structured log helper — prepends ISO timestamp and module tag.
 * @param {string} tag
 * @param {string} level  "info" | "warn" | "error"
 * @param {string} msg
 * @param {object} [data]
 */
function log(tag, level, msg, data) {
  const ts    = new Date().toISOString();
  const line  = `[${ts}] [${level.toUpperCase()}] [${tag}] ${msg}`;
  if (data !== undefined) {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](line, data);
  } else {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](line);
  }
}

module.exports = {
  nowMYT,
  dateMYT,
  sameDay,
  normalisePhone,
  truncate,
  escSheetTitle,
  sleep,
  retry,
  log,
  MYT_OFFSET_MS,
};
