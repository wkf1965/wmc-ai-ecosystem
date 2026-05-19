import {
  mergeStaffOvertimeLoopRecords,
  readStaffOvertimeLoopRaw,
  ensureOvertimeLoopBaseline,
} from '../db/overtimeLoopStorage.js'

const DEMO_OT_PREMIUM_RATE = 42
const OT_MULTIPLIER = 1.5

export function roleDisplayLabel(role) {
  if (role === 'nurse') return 'Nurse'
  if (role === 'caregiver') return 'Caregiver'
  if (role === 'therapist') return 'Therapist'
  if (role === 'supervisor') return 'Supervisor'
  return String(role)
}

export function formatShiftDate(isoDate) {
  if (!isoDate) return '—'
  try {
    const [y, m, d] = String(isoDate).split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return isoDate
  }
}

/**
 * @returns {'pending_approval'|'approved_ot'|'rejected_ot'|'excessive_ot_warning'}
 */
export function overtimeRecordBucket(rec) {
  const st = String(rec.approvalStatus || '').toLowerCase()
  if (st === 'rejected') return 'rejected_ot'
  if (st === 'pending') return 'pending_approval'
  if (st === 'approved') {
    const ot = Number(rec.overtimeHours) || 0
    if (ot >= 3.5 || rec.excessiveOtWarning) return 'excessive_ot_warning'
    return 'approved_ot'
  }
  return 'pending_approval'
}

export function listStaffOvertimeRecordsWithBuckets() {
  const merged = mergeStaffOvertimeLoopRecords()
  return merged.map((r) => ({
    ...r,
    bucket: overtimeRecordBucket(r),
  }))
}

/** Roll up OT hours per staff for calendar month of `shiftDate` prefix. */
export function buildMonthlyOtSummaries(records, monthPrefix) {
  const map = new Map()
  for (const r of records) {
    if (!r.shiftDate || !String(r.shiftDate).startsWith(monthPrefix)) continue
    const key = r.staffId || r.staffName
    const ot = Number(r.overtimeHours) || 0
    const prev = map.get(key) || {
      staffId: r.staffId,
      staffName: r.staffName,
      role: r.role,
      totalOtHours: 0,
      shiftCount: 0,
      pendingHours: 0,
    }
    prev.totalOtHours += ot
    prev.shiftCount += 1
    if (String(r.approvalStatus).toLowerCase() === 'pending') prev.pendingHours += ot
    map.set(key, prev)
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      estimatedCost: Math.round(row.totalOtHours * DEMO_OT_PREMIUM_RATE * OT_MULTIPLIER),
    }))
    .sort((a, b) => b.totalOtHours - a.totalOtHours)
}

export function currentMonthPrefix(nowMs = Date.now()) {
  const d = new Date(nowMs)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function buildOvertimeLoopAiAlerts(records) {
  const alerts = []
  const seen = new Set()
  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    alerts.push({ id, severity, category, title, detail })
  }

  const pendingN = records.filter((r) => String(r.approvalStatus).toLowerCase() === 'pending').length

  for (const row of records) {
    const tag = `${row.staffName} · ${formatShiftDate(row.shiftDate)}`
    const ot = Number(row.overtimeHours) || 0

    if (ot >= 4) {
      add(`ex-${row.id}`, 'high', 'Excessive overtime', `${ot}h OT logged`, tag)
    }

    if (row.repeatedLateClockOut && ot >= 0.5) {
      add(`late-${row.id}`, 'medium', 'Repeated late clock out', `Pattern flag · ${row.clockOut} out`, tag)
    }

    if (ot >= 3 && row.repeatedLateClockOut) {
      add(`fat-${row.id}`, 'high', 'Staff fatigue risk', `High OT + late outs (sim)`, tag)
    }

    if (row.understaffingFlag) {
      add(`us-${row.id}`, 'medium', 'Understaffing warning', `Shift tied to staffing gap narrative`, tag)
    }

    if (/watery|diarr/i.test(String(row.overtimeReason))) {
      /* skip */
    }
  }

  const month = currentMonthPrefix()
  const summaries = buildMonthlyOtSummaries(records, month)
  const monthCost = summaries.reduce((s, x) => s + x.estimatedCost, 0)
  if (pendingN >= 4 || monthCost > 9000) {
    add(`pay-all`, pendingN >= 4 ? 'high' : 'medium', 'Payroll review needed', `Pending ${pendingN} · month est $${monthCost}`, 'Payroll queue')
  }

  return alerts
}

export function overtimeLoopScoreTotalsDisplay() {
  const raw = readStaffOvertimeLoopRaw()
  ensureOvertimeLoopBaseline()
  const b = raw.baseline || {
    normal: 0,
    monitor: 0,
    highOt: 0,
    fatigueRisk: 0,
    managementReview: 0,
  }
  const s = raw.scores || {}
  return {
    normal: b.normal + (s.normal ?? 0),
    monitor: b.monitor + (s.monitor ?? 0),
    highOt: b.highOt + (s.highOt ?? 0),
    fatigueRisk: b.fatigueRisk + (s.fatigueRisk ?? 0),
    managementReview: b.managementReview + (s.managementReview ?? 0),
  }
}

export function deriveOtRiskBadge(rec) {
  const ot = Number(rec.overtimeHours) || 0
  const st = String(rec.approvalStatus || '').toLowerCase()
  if (ot >= 5 || (rec.excessiveOtWarning && st === 'approved')) {
    return { label: 'Management review', variant: 'danger' }
  }
  if ((rec.repeatedLateClockOut && ot >= 2) || ot >= 4) {
    return { label: 'Fatigue risk', variant: 'danger' }
  }
  if (ot >= 3.5) {
    return { label: 'High OT', variant: 'warning' }
  }
  if (ot >= 1) {
    return { label: 'Monitor', variant: 'info' }
  }
  return { label: 'Normal', variant: 'success' }
}

export function overtimeLoopAiSummary(records) {
  const month = currentMonthPrefix()
  const summaries = buildMonthlyOtSummaries(records, month)
  const monthCost = summaries.reduce((s, x) => s + x.estimatedCost, 0)
  const topShift = [...records].sort((a, b) => (Number(b.overtimeHours) || 0) - (Number(a.overtimeHours) || 0))[0]
  const staffTotals = new Map()
  for (const r of records) {
    const k = r.staffName || r.staffId
    staffTotals.set(k, (staffTotals.get(k) || 0) + (Number(r.overtimeHours) || 0))
  }
  let highestName = '—'
  let highestH = 0
  for (const [name, h] of staffTotals) {
    if (h > highestH) {
      highestH = h
      highestName = name
    }
  }

  const fatigueHigh = records.filter((r) => (Number(r.overtimeHours) || 0) >= 3 && r.repeatedLateClockOut).length
  const understaffFlags = records.filter((r) => r.understaffingFlag).length

  return {
    highestOtStaff: highestH > 0 ? `${highestName} · ${highestH.toFixed(1)}h OT (all visible shifts)` : 'No overtime logged yet.',
    highestSingleShift: topShift
      ? `${topShift.staffName} · ${topShift.overtimeHours}h on ${formatShiftDate(topShift.shiftDate)}`
      : '—',
    monthlyOtCostEstimate: `~$${monthCost.toLocaleString()} loaded month (${month}) · ${DEMO_OT_PREMIUM_RATE}/hr base × ${OT_MULTIPLIER} OT blend (demo).`,
    fatigueRecommendation:
      fatigueHigh > 0
        ? `${fatigueHigh} shift(s) combine late clock-outs with ≥3h OT — stagger handovers, shorten contiguous hours, and verify coverage before approving more OT.`
        : 'No simulated fatigue pattern rows right now — keep watching late-out repeats + OT stacks.',
    staffingSuggestion:
      understaffFlags > 0
        ? `${understaffFlags} shift(s) flagged for staffing gaps — rebalance admissions window or float a caregiver during peak ADLs.`
        : 'No understaffing flags on this snapshot — if OT climbs, revisit census-driven staffing curves.',
    supervisorChecklist:
      'Prioritize pending rows >4h OT · confirm accurate clock times · document clinical justification · notify payroll before month close · schedule recovery shifts for repeat late-outs.',
  }
}

export function escapeCsvCell(v) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function buildOtReportCsv(records) {
  const headers = [
    'Staff',
    'Role',
    'Shift date',
    'Scheduled shift',
    'Clock in',
    'Clock out',
    'Normal hours',
    'OT hours',
    'OT reason',
    'Approval',
    'Approved by',
    'Bucket',
    'Notes count',
  ]
  const lines = [headers.map(escapeCsvCell).join(',')]
  for (const r of records) {
    lines.push(
      [
        r.staffName,
        roleDisplayLabel(r.role),
        r.shiftDate,
        r.scheduledShift,
        r.clockIn,
        r.clockOut,
        r.normalHours,
        r.overtimeHours,
        r.overtimeReason,
        r.approvalStatus,
        r.approvedBy ?? '',
        overtimeRecordBucket(r),
        Array.isArray(r.notes) ? r.notes.length : 0,
      ]
        .map(escapeCsvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}

export function buildPayrollSummaryCsv(summaries, monthLabel) {
  const headers = ['Month', 'Staff', 'Role', 'Total OT hours', 'Shifts', 'Pending OT hours', 'Estimated OT cost (demo)']
  const lines = [headers.map(escapeCsvCell).join(',')]
  for (const s of summaries) {
    lines.push(
      [
        monthLabel,
        s.staffName,
        roleDisplayLabel(s.role),
        s.totalOtHours.toFixed(2),
        s.shiftCount,
        s.pendingHours.toFixed(2),
        s.estimatedCost,
      ]
        .map(escapeCsvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}