/**
 * Lightweight slot parsing for WMC (default Asia/Kuala_Lumpur, no DST).
 * @typedef {{ label: string; startIso: string | null; endIso: string | null }} ParsedSlot
 */

const DEFAULT_TZ = process.env.WMC_TIMEZONE || "Asia/Kuala_Lumpur";

/**
 * @param {Date} d
 * @returns {string} yyyy-mm-dd in DEFAULT_TZ
 */
function formatYmdInZone(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * @param {string} ymd
 * @param {number} hour 0-23
 * @param {number} minute
 * @returns {Date}
 */
function malaysiaLocalToUtcDate(ymd, hour, minute) {
  const [y, mo, da] = ymd.split("-").map((x) => Number(x));
  if (!y || !mo || !da) return new Date(NaN);
  return new Date(
    `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`,
  );
}

/**
 * @param {string} ymd
 * @param {number} addDays
 * @returns {string} yyyy-mm-dd
 */
function addCalendarDaysYmd(ymd, addDays) {
  const MS_PER_DAY = 86400000;
  const d = malaysiaLocalToUtcDate(ymd, 12, 0);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setTime(d.getTime() + addDays * MS_PER_DAY);
  return formatYmdInZone(d);
}

/**
 * Extract hour/minute from Chinese / numeric fragments.
 * @param {string} t
 * @returns {{ hour: number; minute: number }}
 */
function pickHourMinute(t) {
  let hour = 10;
  let minute = 0;
  const pm = t.match(/下午\s*(\d{1,2})\s*[点:：]\s*(\d{0,2})/);
  const am = t.match(/上午\s*(\d{1,2})\s*[点:：]\s*(\d{0,2})/);
  const plain = t.match(/(\d{1,2})\s*[点:：]\s*(\d{0,2})/);
  if (pm) {
    let h = Number(pm[1]);
    if (h < 12) h += 12;
    hour = h;
    minute = Number(pm[2] || 0) || 0;
  } else if (am) {
    hour = Number(am[1]) || 10;
    minute = Number(am[2] || 0) || 0;
    if (hour === 12) hour = 0;
  } else if (plain) {
    hour = Number(plain[1]) || 10;
    minute = Number(plain[2] || 0) || 0;
  }
  hour = Math.min(23, Math.max(0, hour));
  minute = Math.min(59, Math.max(0, minute));
  return { hour, minute };
}

/**
 * @param {string} userText
 * @param {string} replyText
 * @param {Date} [now]
 * @returns {ParsedSlot}
 */
function parseAppointmentSlot(userText, replyText, now = new Date()) {
  const raw = `${typeof userText === "string" ? userText : ""} ${typeof replyText === "string" ? replyText : ""}`;
  const t = raw.replace(/\s+/g, " ").trim();
  const label = t.length > 220 ? `${t.slice(0, 217)}…` : t;

  const isoDay = t.match(/\d{4}-\d{2}-\d{2}/);
  const todayYmd = formatYmdInZone(now);

  let ymd = "";
  if (isoDay) {
    ymd = isoDay[0];
  } else if (/明天/.test(t)) {
    ymd = addCalendarDaysYmd(todayYmd, 1);
  } else if (/后天/.test(t)) {
    ymd = addCalendarDaysYmd(todayYmd, 2);
  } else if (/大后天/.test(t)) {
    ymd = addCalendarDaysYmd(todayYmd, 3);
  }

  if (!ymd) {
    return { label: label || "(no slot text)", startIso: null, endIso: null };
  }

  const { hour, minute } = pickHourMinute(t);
  const start = malaysiaLocalToUtcDate(ymd, hour, minute);
  if (Number.isNaN(start.getTime())) {
    return { label, startIso: null, endIso: null };
  }
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  return {
    label,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

module.exports = {
  parseAppointmentSlot,
  DEFAULT_TZ,
};
