/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Notifications Module                         ║
 * ║                                                              ║
 * ║  Purpose: Central hub for outbound notifications to         ║
 * ║  patients, staff, and clinic management.                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Notification types:
 *
 *   Patient Notifications:
 *     - Appointment reminder (24h before)
 *     - Appointment reminder (1h before)
 *     - Follow-up after inquiry (24h)
 *     - Campaign messages (daily 10 AM)
 *
 *   Staff Notifications (WhatsApp group):
 *     - New Hot Lead alert
 *     - New appointment booked
 *     - Patient arrived (Converted)
 *     - Daily analytics summary (11 PM)
 *     - System health alert
 *
 * Channels:
 *   ✅ WhatsApp (via WHAPI)  — current
 *   🔲 Email                — future
 *   🔲 SMS                  — future
 *   🔲 Telegram             — future (staff alerts)
 *
 * TODO:
 *   - Define STAFF_WHATSAPP_GROUP env var for group alerts
 *   - Implement sendToStaff() using group WhatsApp
 *   - Wire loops/notificationLoop.js to this module
 *   - Add notification templates for each type
 */

"use strict";

const TEMPLATES = {
  appointmentReminder24h: (name, time) =>
    `您好${name ? " " + name : ""} 😊 提醒您明天 ${time} 在黄氏医疗中心有预约。\n📍 14 Jalan Lapangan Siber 1, Bandar Cyber, Ipoh\n如需更改，请联系 📞 012-4520077`,

  appointmentReminder1h: (name, time) =>
    `您好${name ? " " + name : ""} 😊 您今天 ${time} 在黄氏医疗中心的预约将在1小时后开始。期待您的到来！`,

  followUpMessage: () =>
    `您好 😊 这里是黄氏医疗中心。昨天您有咨询我们的服务，请问您目前的情况有没有好一些？\n如需进一步了解或预约评估，欢迎随时联系我们。\n📞 012-4520077`,

  hotLeadAlert: (phone, category) =>
    `🔥 [HOT LEAD] ${phone} — ${category}\n客户已确认预约，请跟进！`,

  newAppointmentAlert: (name, phone, time, category) =>
    `📅 [新预约] ${name || phone}\n类别: ${category}\n时间: ${time}\n电话: ${phone}`,

  dailySummary: (metrics) =>
    `📊 [WMC CRM 日报] ${metrics.date}\n新客户: ${metrics.newLeads}\n预约: ${metrics.appointmentsBooked}\n跟进: ${metrics.followUpsSent}\n转化率: ${metrics.conversionRate}`,
};

/**
 * Send a notification to a patient.
 * (Stub — wire to notificationLoop or whatsapp.service directly)
 *
 * @param {{ type: string; recipient: string; vars: object }} opts
 */
async function notify(opts) {
  const template = TEMPLATES[opts.type];
  if (!template) {
    console.warn(`[Notifications] Unknown template: ${opts.type}`);
    return;
  }

  const message = typeof opts.vars === "object"
    ? Object.entries(opts.vars).reduce((msg, [k, v]) => msg.replace(`{${k}}`, v), template(...Object.values(opts.vars)))
    : template;

  // TODO: Route to notificationLoop.enqueue() or whatsapp.service.sendMessage()
  console.log(`[Notifications] ⚠️  Stub notify → ${opts.recipient} | type: ${opts.type}`);
  return { queued: true, recipient: opts.recipient, type: opts.type };
}

/**
 * Alert the clinic staff WhatsApp group.
 * (Stub — wire to staff group number)
 *
 * @param {string} type — key from TEMPLATES
 * @param {object} vars — template variables
 */
async function alertStaff(type, vars) {
  const staffGroup = process.env.STAFF_WHATSAPP_GROUP;
  if (!staffGroup) {
    console.warn("[Notifications] STAFF_WHATSAPP_GROUP not set — staff alert skipped");
    return;
  }
  return notify({ type, recipient: staffGroup, vars });
}

module.exports = { notify, alertStaff, TEMPLATES };
