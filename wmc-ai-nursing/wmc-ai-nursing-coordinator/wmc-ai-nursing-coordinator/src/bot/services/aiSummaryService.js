/**
 * AI Summary Service — Stage 4
 *
 * Builds a nursing handover prompt from today's sheet records
 * and calls DeepSeek to generate a structured summary.
 *
 * Required env:
 *   DEEPSEEK_API_KEY — your DeepSeek API key
 *
 * Model: deepseek-chat
 * DeepSeek uses the OpenAI-compatible API — no extra package needed.
 */

import OpenAI from 'openai'
import { log } from '../utils/logger.js'

// ── Client ───────────────────────────────────────────────────────────────────

function getClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY ?? ''
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set in environment variables.')
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com',
  })
}

// ── Shift detection ──────────────────────────────────────────────────────────

function detectShift() {
  const hour = new Date().getHours()
  if (hour >= 7 && hour < 14)  return 'Morning Shift   (07:00 – 14:00)'
  if (hour >= 14 && hour < 21) return 'Evening Shift   (14:00 – 21:00)'
  return                               'Night Shift     (21:00 – 07:00)'
}

function formatDate() {
  return new Date().toLocaleDateString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

// ── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(records) {
  const { admissions, vitals, falls, turning, rehab, medicine, alerts } = records

  const section = (title, items, formatFn) => {
    if (!items.length) return `### ${title}\n_No records_`
    return `### ${title}\n${items.map(formatFn).join('\n')}`
  }

  const prompt = `
You are a senior nursing AI assistant at WMC (Wellness Medical Centre).
Generate a clear, professional nursing shift handover summary in English
based on today's records provided below.

Follow this EXACT output format (use the section headers as given):

---
WMC AI Nursing Handover Summary

Date: [DATE]
Shift: [SHIFT]

Critical Cases:
-

Abnormal Vitals:
-

Fall Cases:
-

Turning Reminder:
-

Rehab Progress:
-

Medicine Issues:
-

Emergency Alerts:
-

Next Shift Tasks:
-
---

Rules:
- Be concise. Use bullet points with patient name and room.
- For "Abnormal Vitals": flag SpO2 < 94%, temp ≥ 38°C, pulse > 100, systolic BP ≥ 140 or < 90.
- For "Critical Cases": list patients with fall injuries, critical alerts, or very abnormal vitals.
- For "Turning Reminder": list bed-bound patients who need turning in the next 2 hours based on last turning time.
- For "Next Shift Tasks": summarise pending actions inferred from the data (e.g. recheck vitals, family callback, doctor follow-up).
- If a section has no relevant data, write "- Nil".
- Do NOT include chat IDs or internal system data.
- Date: ${formatDate()}
- Shift: ${detectShift()}

TODAY'S RECORDS:

${section('New Admissions (${admissions.length})', admissions, r =>
  `- ${r.patientName} | Room ${r.room} | ${r.age}y ${r.gender} | Dx: ${r.diagnosis} | Dr ${r.doctor}${r.remark && r.remark !== '-' ? ` | Note: ${r.remark}` : ''}`
)}

${section('Vital Signs (${vitals.length})', vitals, r =>
  `- ${r.patientName} | Room ${r.room} | BP:${r.bp} Pulse:${r.pulse} Temp:${r.temperature}°C SpO2:${r.spo2}% Sugar:${r.bloodSugar}${r.remark && r.remark !== '-' ? ` | ${r.remark}` : ''}`
)}

${section('Fall Incidents (${falls.length})', falls, r =>
  `- ${r.patientName} | Room ${r.room} | ${r.time} | ${r.whatHappened} | Injury: ${r.injury} | Action: ${r.actionTaken} | Dr informed: ${r.doctorInformed} | Family: ${r.familyInformed}`
)}

${section('Side Turnings (${turning.length})', turning, r =>
  `- ${r.patientName} | Room ${r.room} | ${r.time} | Position: ${r.position} | Skin: ${r.skinCondition}`
)}

${section('Rehab Sessions (${rehab.length})', rehab, r =>
  `- ${r.patientName} | Room ${r.room} | ${r.sessionType} | ${r.progress}${r.nextGoal && r.nextGoal !== '-' ? ` | Goal: ${r.nextGoal}` : ''}`
)}

${section('Medication (${medicine.length})', medicine, r =>
  `- ${r.patientName} | Room ${r.room} | ${r.time} | ${r.medication} ${r.dose} | For: ${r.indication} | Response: ${r.response}`
)}

${section('Clinical Alerts (${alerts.length})', alerts, r =>
  `- ${r.patientName} | Room ${r.room} | ${r.time} | ${r.alertType} | ${r.observation} | Action: ${r.actionTaken} | Dr: ${r.doctorInformed}`
)}
`
  return prompt.trim()
}

// ── Public: generate handover ────────────────────────────────────────────────

/**
 * Generate an AI handover summary from today's records.
 *
 * @param {object} records  — result of getAllTodayRecords()
 * @returns {Promise<{ success: boolean, summary?: string, error?: string }>}
 */
export async function generateHandoverSummary(records) {
  try {
    const client = getClient()
    const userPrompt = buildPrompt(records)

    log.info('[ai] calling OpenAI for handover summary...')

    const completion = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            'You are a clinical nursing AI assistant. Generate structured, accurate, ' +
            'and professional nursing handover summaries. Always follow the exact format requested.',
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.3,  // low creativity — we want factual, consistent output
      max_tokens: 1200,
    })

    const summary = completion.choices[0]?.message?.content?.trim() ?? ''
    log.info('[ai] handover summary generated — tokens used:', completion.usage?.total_tokens)

    return { success: true, summary }
  } catch (err) {
    const msg = err?.message ?? String(err)
    log.error('[ai] handover generation failed:', msg)
    return { success: false, error: msg }
  }
}

/**
 * Quick config check.
 * @returns {{ ok: boolean }}
 */
export function checkAiConfig() {
  const ok = Boolean(process.env.DEEPSEEK_API_KEY)
  return { ok }
}
