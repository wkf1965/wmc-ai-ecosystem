/**
 * Simulation storage for Staff Overtime Loop (localStorage).
 */

import { readStaff } from './otStorage.js'

export const STAFF_OVERTIME_LOOP_KEY = 'wmc_staff_overtime_loop_v1'

const ROLES = /** @type {const} */ (['nurse', 'caregiver', 'therapist', 'supervisor'])

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function todayMonthStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STAFF_OVERTIME_LOOP_KEY)
    if (!raw) {
      return {
        records: [],
        scores: {
          normal: 0,
          monitor: 0,
          highOt: 0,
          fatigueRisk: 0,
          managementReview: 0,
        },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      records: Array.isArray(p.records) ? p.records : [],
      scores: {
        normal: p.scores?.normal ?? 0,
        monitor: p.scores?.monitor ?? 0,
        highOt: p.scores?.highOt ?? 0,
        fatigueRisk: p.scores?.fatigueRisk ?? 0,
        managementReview: p.scores?.managementReview ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      records: [],
      scores: {
        normal: 0,
        monitor: 0,
        highOt: 0,
        fatigueRisk: 0,
        managementReview: 0,
      },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(STAFF_OVERTIME_LOOP_KEY, JSON.stringify(data))
}

export function emitStaffOvertimeLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-staff-overtime-loop-updated'))
}

export function ensureOvertimeLoopBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = { normal: 44, monitor: 22, highOt: 12, fatigueRisk: 7, managementReview: 5 }
  saveRaw(raw)
  return raw.baseline
}

export function readStaffOvertimeLoopRaw() {
  return loadRaw()
}

export function bumpOvertimeLoopScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitStaffOvertimeLoopUpdate()
}

function newRecordId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `ot_${crypto.randomUUID()}`
  return `ot_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function seedDemoRecords(staffList) {
  const month = todayMonthStr()
  const day = new Date().getDate()
  const records = []
  staffList.slice(0, 8).forEach((s, idx) => {
    const h = hashStr(`${s.id}|ot`)
    const dday = Math.max(1, Math.min(28, ((day + idx - 3 + (h % 5)) % 29) + 1))
    const shiftDate = `${month}-${String(dday).padStart(2, '0')}`
    const otH = [0, 1.25, 2.5, 4.25, 1, 3.75, 5, 0.5][idx % 8]
    const statuses = ['pending', 'pending', 'approved', 'approved', 'rejected', 'approved', 'pending', 'approved']
    const status = statuses[idx % statuses.length]
    const outMin = Math.round((otH % 1) * 60)
    const outHr = 15 + Math.floor(otH)
    records.push({
      id: newRecordId(),
      staffId: s.id,
      staffName: s.fullName,
      role: ROLES[h % ROLES.length],
      shiftDate,
      scheduledShift: idx % 2 === 0 ? '07:00–15:00' : '15:00–23:00',
      clockIn: idx % 2 === 0 ? '06:58' : '14:55',
      clockOut: idx % 2 === 0 ? `${Math.min(23, outHr)}:${String(outMin).padStart(2, '0')}` : '23:42',
      normalHours: 8,
      overtimeHours: otH,
      overtimeReason:
        otH > 3
          ? 'Acuity surge — stayed for handover + admissions'
          : otH > 0
            ? 'Late discharge documentation'
            : 'None',
      approvalStatus: status,
      approvedBy: status === 'approved' ? 'S. Okonkwo (NM)' : null,
      notes: [],
      repeatedLateClockOut: h % 11 === 0,
      understaffingFlag: h % 13 === 0,
      excessiveOtWarning: otH >= 4,
    })
  })
  return records
}

export function mergeStaffOvertimeLoopRecords() {
  ensureOvertimeLoopBaseline()
  const raw = loadRaw()
  let { records } = raw

  const staff = readStaff()

  if (!records.length) {
    records = seedDemoRecords(staff.length ? staff : [{ id: 'x', fullName: 'Demo Nurse' }])
    raw.records = records
    saveRaw(raw)
  }

  const byId = new Map(staff.map((s) => [s.id, s]))

  return records.map((r) => {
    const match = byId.get(r.staffId)
    const overtimeHours =
      typeof r.overtimeHours === 'number' ? r.overtimeHours : parseFloat(r.overtimeHours) || 0
    return {
      ...r,
      staffName: match?.fullName || r.staffName,
      overtimeHours,
      normalHours: typeof r.normalHours === 'number' ? r.normalHours : parseFloat(r.normalHours) || 8,
      notes: Array.isArray(r.notes) ? r.notes : [],
      repeatedLateClockOut: Boolean(r.repeatedLateClockOut),
      understaffingFlag: Boolean(r.understaffingFlag),
      excessiveOtWarning: Boolean(r.excessiveOtWarning ?? overtimeHours >= 4),
    }
  })
}

export function upsertOvertimeRecord(record) {
  const raw = loadRaw()
  const list = Array.isArray(raw.records) ? [...raw.records] : []
  const idx = list.findIndex((x) => x.id === record.id)
  if (idx >= 0) list[idx] = { ...list[idx], ...record }
  else list.unshift(record)
  raw.records = list
  saveRaw(raw)
  emitStaffOvertimeLoopUpdate()
}

export function appendOvertimeSupervisorNote(recordId, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const list = Array.isArray(raw.records) ? [...raw.records] : []
  const idx = list.findIndex((x) => x.id === recordId)
  if (idx < 0) return
  const notes = Array.isArray(list[idx].notes) ? [...list[idx].notes] : []
  notes.push({ at: new Date().toISOString(), text: trimmed })
  list[idx] = { ...list[idx], notes: notes.slice(-12) }
  raw.records = list
  saveRaw(raw)
  emitStaffOvertimeLoopUpdate()
}

export function addOvertimeRecordDraft(patch = {}) {
  const staff = readStaff()
  const pick = staff[0] || { id: 'demo', fullName: 'Demo Staff' }
  const month = todayMonthStr()
  const rec = {
    id: newRecordId(),
    staffId: patch.staffId || pick.id,
    staffName: patch.staffName || pick.fullName,
    role: patch.role || 'nurse',
    shiftDate: patch.shiftDate || `${month}-15`,
    scheduledShift: patch.scheduledShift || '07:00–15:00',
    clockIn: patch.clockIn || '07:00',
    clockOut: patch.clockOut || '16:00',
    normalHours: patch.normalHours ?? 8,
    overtimeHours: patch.overtimeHours ?? 1,
    overtimeReason: patch.overtimeReason || 'Documentation / patient care',
    approvalStatus: 'pending',
    approvedBy: null,
    notes: [],
    repeatedLateClockOut: false,
    understaffingFlag: false,
    excessiveOtWarning: (patch.overtimeHours ?? 1) >= 4,
  }
  upsertOvertimeRecord(rec)
  return rec
}
