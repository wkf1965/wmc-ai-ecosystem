/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Business Hours Configuration                             ║
 * ║                                                                          ║
 * ║  Wong Medical Centre operating hours (Perak, Malaysia):                ║
 * ║    Monday – Saturday   9:00 AM – 5:30 PM (MYT, UTC+8)                ║
 * ║    Sunday              CLOSED                                           ║
 * ║    Public Holidays     CLOSED                                           ║
 * ║                                                                          ║
 * ║  Exported functions:                                                    ║
 * ║    isBusinessOpen([date])    — returns true/false                       ║
 * ║    getAfterHoursReply(text)  — language-aware closed message           ║
 * ║    getNextOpenTime([date])   — next open day/time as string            ║
 * ║    detectLanguage(text)      — "zh" | "ms" | "en"                     ║
 * ║    setPublicHolidayMode(bool)— manual override (close all day)         ║
 * ║                                                                          ║
 * ║  .env overrides:                                                        ║
 * ║    EXTRA_PUBLIC_HOLIDAYS=2026-01-15,2026-03-01   (comma-separated)     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();

// ── Business hours constants ──────────────────────────────────────────────────

const OPEN_HOUR    = 9;          // 9:00 AM
const OPEN_MIN     = 0;
const CLOSE_HOUR   = 17;         // 5:30 PM
const CLOSE_MIN    = 30;
const TIMEZONE     = "Asia/Kuala_Lumpur";

// Days open: Mon(1) Tue(2) Wed(3) Thu(4) Fri(5) Sat(6) — Sunday(0) closed
const OPEN_DAYS = new Set([1, 2, 3, 4, 5, 6]);

// ── Malaysia Public Holidays 2025–2026 (Perak state) ─────────────────────────
//
//  Fixed holidays are exact. Islamic calendar dates are best estimates
//  based on astronomical calculation — actual dates may shift ±1 day
//  depending on moon sighting. Add EXTRA_PUBLIC_HOLIDAYS in .env to patch.

const PUBLIC_HOLIDAYS = new Set([
  // ── 2025 ──────────────────────────────────────────────────────────────────
  "2025-01-01",  // New Year's Day
  "2025-01-29",  // Thaipusam (Perak)
  "2025-01-30",  // Thaipusam (substitute — Perak)
  "2025-02-01",  // Federal Territory Day (not Perak, but common)
  "2025-02-10",  // Chinese New Year Day 1
  "2025-02-11",  // Chinese New Year Day 2
  "2025-03-30",  // Hari Raya Aidilfitri Day 1
  "2025-03-31",  // Hari Raya Aidilfitri Day 2
  "2025-04-01",  // Hari Raya Aidilfitri Day 3 (Perak)
  "2025-05-01",  // Labour Day
  "2025-05-12",  // Wesak Day
  "2025-06-02",  // Yang di-Pertuan Agong Birthday (first Monday June)
  "2025-06-07",  // Hari Raya Aidiladha
  "2025-06-27",  // Awal Muharram (Islamic New Year)
  "2025-08-31",  // National Day
  "2025-09-05",  // Prophet Muhammad's Birthday
  "2025-09-16",  // Malaysia Day
  "2025-10-20",  // Deepavali
  "2025-11-03",  // Sultan of Perak Birthday (first Monday November)
  "2025-12-25",  // Christmas Day

  // ── 2026 ──────────────────────────────────────────────────────────────────
  "2026-01-01",  // New Year's Day
  "2026-01-28",  // Thaipusam (Perak) — approximate
  "2026-02-17",  // Chinese New Year Day 1 (Year of the Snake)
  "2026-02-18",  // Chinese New Year Day 2
  "2026-03-20",  // Hari Raya Aidilfitri Day 1 — approximate
  "2026-03-21",  // Hari Raya Aidilfitri Day 2 — approximate
  "2026-03-22",  // Hari Raya Aidilfitri Day 3 (Perak) — approximate
  "2026-04-03",  // Good Friday — approximate
  "2026-05-01",  // Labour Day
  "2026-05-27",  // Hari Raya Aidiladha — approximate
  "2026-05-28",  // Wesak Day — approximate
  "2026-06-01",  // Yang di-Pertuan Agong Birthday (first Monday June)
  "2026-06-16",  // Awal Muharram — approximate
  "2026-08-25",  // Prophet Muhammad's Birthday — approximate
  "2026-08-31",  // National Day
  "2026-09-16",  // Malaysia Day
  "2026-10-28",  // Deepavali — approximate
  "2026-11-02",  // Sultan of Perak Birthday (first Monday November)
  "2026-12-25",  // Christmas Day
]);

// ── Manual override ───────────────────────────────────────────────────────────

let publicHolidayMode = false; // set true to close for the day regardless of hours

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Convert a JS Date to MYT local date/time fields */
function toMYT(date) {
  const str = date.toLocaleString("en-US", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  });
  // str = "MM/DD/YYYY, HH:MM"
  const [datePart, timePart] = str.split(", ");
  const [mm, dd, yyyy]       = datePart.split("/");
  const [hh, min]            = timePart.split(":");
  return {
    dateKey: `${yyyy}-${mm}-${dd}`,  // "2026-05-16"
    day:     new Date(date.toLocaleDateString("en-US", { timeZone: TIMEZONE })).getDay(),
    hour:    Number(hh),
    minute:  Number(min),
  };
}

function isPublicHoliday(date) {
  const { dateKey } = toMYT(date);

  // Extra holidays from .env (comma-separated YYYY-MM-DD)
  const extra = String(process.env.EXTRA_PUBLIC_HOLIDAYS || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  return PUBLIC_HOLIDAYS.has(dateKey) || extra.includes(dateKey);
}

// ── Main exported functions ───────────────────────────────────────────────────

/**
 * Returns true if the WMC centre is currently open.
 * Checks: manual override → public holiday → Sunday → business hours.
 *
 * @param {Date} [now]  defaults to current time
 * @returns {boolean}
 */
function isBusinessOpen(now = new Date()) {
  if (publicHolidayMode)    return false;
  if (isPublicHoliday(now)) return false;

  const { day, hour, minute } = toMYT(now);
  if (!OPEN_DAYS.has(day)) return false;  // closed Sunday

  const totalMin  = hour * 60 + minute;
  const openMin   = OPEN_HOUR  * 60 + OPEN_MIN;
  const closeMin  = CLOSE_HOUR * 60 + CLOSE_MIN;

  return totalMin >= openMin && totalMin < closeMin;
}

/**
 * Returns the next opening day/time as a multi-language object.
 *
 * @param {Date} [now]
 * @returns {{ en: string; zh: string; ms: string }}
 */
function getNextOpenTime(now = new Date()) {
  const { day, hour, minute } = toMYT(now);
  const totalMin = hour * 60 + minute;
  const openMin  = OPEN_HOUR * 60 + OPEN_MIN;

  // If today is a working day and we haven't hit opening time yet
  if (OPEN_DAYS.has(day) && !isPublicHoliday(now) && totalMin < openMin) {
    return { en: "today at 9:00 AM", zh: "今天上午 9:00", ms: "hari ini jam 9:00 pagi" };
  }

  // Find the next open working day
  const DAY_EN = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const DAY_ZH = ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"];
  const DAY_MS = ["Ahad","Isnin","Selasa","Rabu","Khamis","Jumaat","Sabtu"];

  for (let ahead = 1; ahead <= 8; ahead++) {
    const next    = new Date(now.getTime() + ahead * 86400000);
    const { day: nextDay } = toMYT(next);
    if (OPEN_DAYS.has(nextDay) && !isPublicHoliday(next)) {
      return {
        en: `${DAY_EN[nextDay]} at 9:00 AM`,
        zh: `${DAY_ZH[nextDay]}上午 9:00`,
        ms: `${DAY_MS[nextDay]} jam 9:00 pagi`,
      };
    }
  }

  return { en: "Monday at 9:00 AM", zh: "星期一上午 9:00", ms: "Isnin jam 9:00 pagi" };
}

/**
 * Detect primary language of a message.
 *
 * @param {string} text
 * @returns {"zh" | "ms" | "en"}
 */
function detectLanguage(text) {
  if (!text) return "en";

  const chinese = (text.match(/[\u4E00-\u9FFF\u3400-\u4DBF\u{20000}-\u{2A6DF}]/gu) || []).length;
  const total   = text.replace(/\s/g, "").length;
  if (total > 0 && chinese / total >= 0.2) return "zh";

  const malayPattern = /\b(boleh|tidak|ya|awak|saya|hari|terima|harap|juga|atau|untuk|dengan|yang|dan|kami|kita|ada|selamat|pagi|malam|petang|minggu|bulan|sihat|nak|nk|ok|okay|macam|mana|sini|sana|bila|apa|kenapa|kalau|tapi|jadi)\b/i;
  if (malayPattern.test(text)) return "ms";

  return "en";
}

/**
 * Return a language-appropriate after-hours reply for the customer.
 *
 * @param {string} customerMessage  — used to detect language
 * @param {Date}   [now]
 * @returns {string}
 */
function getAfterHoursReply(customerMessage = "", now = new Date()) {
  const lang     = detectLanguage(customerMessage);
  const nextOpen = getNextOpenTime(now);

  const replies = {
    zh:
`您好 😊 我们目前已结束营业时间。

🕐 营业时间：
星期一至星期六
上午 9:00 至 下午 5:30
星期日与公共假期休息。

您可以先留下您的问题，我们的团队将在营业时间（${nextOpen.zh}）尽快回复您 😊`,

    en:
`Hello 😊 Our centre is currently closed.

🕐 Business Hours:
Monday to Saturday
9:00 AM – 5:30 PM
Closed on Sundays & Public Holidays.

You may leave your inquiry and our team will respond as soon as possible during operating hours (next open: ${nextOpen.en}) 😊`,

    ms:
`Hai 😊 Pusat kami kini telah tutup.

🕐 Waktu Operasi:
Isnin hingga Sabtu
9:00 pagi – 5:30 petang
Tutup pada Ahad & Cuti Umum.

Anda boleh tinggalkan pertanyaan anda dan pasukan kami akan membalas secepat mungkin pada waktu operasi (buka semula: ${nextOpen.ms}) 😊`,
  };

  return replies[lang] || replies.en;
}

/**
 * Manually override business hours — closes the centre regardless of time.
 * Useful for unexpected closures, staff training, etc.
 *
 * @param {boolean} value
 */
function setPublicHolidayMode(value) {
  publicHolidayMode = Boolean(value);
  console.log(`[BusinessHours] publicHolidayMode → ${publicHolidayMode}`);
}

// ── Module export ─────────────────────────────────────────────────────────────

module.exports = {
  isBusinessOpen,
  isPublicHoliday,
  getAfterHoursReply,
  getNextOpenTime,
  detectLanguage,
  setPublicHolidayMode,
  get publicHolidayMode() { return publicHolidayMode; },
  PUBLIC_HOLIDAYS,
  OPEN_HOUR,
  OPEN_MIN,
  CLOSE_HOUR,
  CLOSE_MIN,
};
