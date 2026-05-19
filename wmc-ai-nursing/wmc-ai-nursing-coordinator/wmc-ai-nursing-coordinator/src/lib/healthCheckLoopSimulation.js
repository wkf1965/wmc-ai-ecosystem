import { HEALTH_CHECK_LOOP_TYPES } from '../data/healthCheckLoopTypes.js'
import { healthLoopInstanceKey, mergeHealthLoopInstances } from '../db/healthCheckLoopStorage.js'

export function formatHealthLoopTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/** @returns {'normal'|'warning'|'critical'} */
export function evaluateReadingStatus(checkTypeId, rawValue) {
  const v = String(rawValue ?? '').trim().toLowerCase()
  if (!v || v === '—') return 'warning'

  if (checkTypeId === 'bp') {
    const m = v.match(/(\d{2,3})\s*\/\s*(\d{2,3})/)
    if (!m) return 'warning'
    const sys = Number(m[1])
    const dia = Number(m[2])
    if (sys >= 180 || dia >= 120 || sys < 80 || dia < 50) return 'critical'
    if (sys > 139 || dia > 89 || sys < 90 || dia < 60) return 'warning'
    return 'normal'
  }

  if (checkTypeId === 'pulse') {
    const n = parseFloat(v.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(n)) return 'warning'
    if (n < 45 || n > 130) return 'critical'
    if (n < 55 || n > 110) return 'warning'
    return 'normal'
  }

  if (checkTypeId === 'temp') {
    const n = parseFloat(v.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(n)) return 'warning'
    if (n < 35.5 || n >= 39.0) return 'critical'
    if (n < 36.0 || n >= 37.8) return 'warning'
    return 'normal'
  }

  if (checkTypeId === 'spo2') {
    const n = parseFloat(v.replace(/%/g, ''))
    if (!Number.isFinite(n)) return 'warning'
    if (n < 90) return 'critical'
    if (n < 95) return 'warning'
    return 'normal'
  }

  if (checkTypeId === 'glucose') {
    const n = parseFloat(v.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(n)) return 'warning'
    if (n < 55 || n > 300) return 'critical'
    if (n < 70 || n > 180) return 'warning'
    return 'normal'
  }

  if (checkTypeId === 'weight') {
    if (v.includes('−') || v.includes('-0.') || v.includes('loss') || v.includes('↓')) return 'warning'
    return 'normal'
  }

  if (checkTypeId === 'pain') {
    const n = parseFloat(v.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(n)) return 'warning'
    if (n >= 8) return 'critical'
    if (n >= 4) return 'warning'
    return 'normal'
  }

  if (checkTypeId === 'mental') {
    if (/aox\s*1|aox\s*2|confus|agitat|combative|letharg|unrespons/i.test(v)) return 'critical'
    if (/aox\s*3|restless|drowsy|anxious/i.test(v)) return 'warning'
    return 'normal'
  }

  if (checkTypeId === 'urine') {
    const m = v.match(/(\d+(?:\.\d+)?)\s*ml/)
    const n = m ? parseFloat(m[1]) : parseFloat(v.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(n)) return 'warning'
    if (n < 15) return 'critical'
    if (n < 30) return 'warning'
    return 'normal'
  }

  if (checkTypeId === 'bowel') {
    if (/none\s*×\s*(48|72|\d{2,})h|no bm|no bowel|×48|×72/i.test(v)) return 'warning'
    return 'normal'
  }

  if (checkTypeId === 'sleep') {
    const m = v.match(/(\d+(?:\.\d+)?)\s*h/)
    const n = m ? parseFloat(m[1]) : parseFloat(v.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(n)) return 'warning'
    if (n < 3.5) return 'critical'
    if (n < 6) return 'warning'
    return 'normal'
  }

  if (checkTypeId === 'appetite') {
    const m = v.match(/(\d+)\s*%/)
    const n = m ? parseFloat(m[1]) : NaN
    if (!Number.isFinite(n)) return 'warning'
    if (n < 25) return 'critical'
    if (n < 50) return 'warning'
    return 'normal'
  }

  return 'normal'
}

export function nextDueFromNow(frequencyMinutes, fromMs = Date.now()) {
  return new Date(fromMs + frequencyMinutes * 60 * 1000).toISOString()
}

export function enrichHealthLoopRows(_patients, rows) {
  const now = Date.now()
  return rows.map((row) => {
    const readingStatus = evaluateReadingStatus(row.checkTypeId, row.lastValue)
    const nextMs = new Date(row.nextDueAt).getTime()
    const overdue = now > nextMs
    const urgent = overdue || readingStatus === 'critical' || readingStatus === 'warning'

    return {
      ...row,
      key: healthLoopInstanceKey(row.patientId, row.checkTypeId),
      readingStatus,
      overdue,
      urgent,
    }
  })
}

export function listHealthLoopRows(patients) {
  const merged = mergeHealthLoopInstances(patients)
  return enrichHealthLoopRows(patients, merged)
}

/**
 * AI-style clinical hints — simulation only; not diagnostic.
 */
export function buildHealthCheckAiRisks(enrichedRows, patientsById) {
  const out = []
  const seen = new Set()

  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    out.push({ id, severity, category, title, detail })
  }

  const tempHigh = []
  const pulseHigh = []
  const bpLow = []

  for (const row of enrichedRows) {
    const name = row.patientName
    const room = row.room

    const v = String(row.lastValue || '').toLowerCase()

    if (row.checkTypeId === 'temp') {
      const n = parseFloat(v.replace(/[^\d.]/g, ''))
      if (Number.isFinite(n) && n >= 38.0) {
        tempHigh.push(row)
        add(`fever-${row.key}`, n >= 38.6 ? 'critical' : 'high', 'Fever risk', `Febrile pattern — ${name}`, `Rm ${room} · ${row.lastValue}`)
      }
    }

    if (row.checkTypeId === 'glucose' && row.readingStatus !== 'normal') {
      const n = parseFloat(v.replace(/[^\d.]/g, ''))
      if (Number.isFinite(n) && n < 70) {
        add(`hypo-${row.key}`, 'critical', 'Hypoglycemia', `Low glucose signal — ${name}`, `Rm ${room} · ${row.lastValue} mg/dL`)
      }
    }

    if (row.checkTypeId === 'bp' && row.readingStatus !== 'normal') {
      const m = v.match(/(\d{2,3})\s*\/\s*(\d{2,3})/)
      if (m) {
        const sys = Number(m[1])
        const dia = Number(m[2])
        if (sys >= 140 || dia >= 90) {
          add(`htn-${row.key}`, sys >= 160 ? 'high' : 'medium', 'Hypertension', `Elevated BP — ${name}`, `Rm ${room} · ${row.lastValue}`)
        }
        if (sys < 95) bpLow.push(row)
      }
    }

    if (row.checkTypeId === 'spo2' && row.readingStatus !== 'normal') {
      add(`o2-${row.key}`, 'critical', 'Oxygen drop', `Desaturation signal — ${name}`, `Rm ${room} · ${row.lastValue}`)
    }

    if (row.checkTypeId === 'urine' && row.readingStatus !== 'normal') {
      add(`dehyd-${row.key}`, 'high', 'Dehydration', `Low urine output trend — ${name}`, `Rm ${room} · ${row.lastValue}`)
    }

    if (row.checkTypeId === 'pulse') {
      const n = parseFloat(v.replace(/[^\d.]/g, ''))
      if (Number.isFinite(n) && n >= 100) pulseHigh.push(row)
    }

    if (row.checkTypeId === 'mental' && row.readingStatus !== 'normal') {
      add(`delirium-${row.key}`, 'high', 'Delirium risk', `Acute mental status change — ${name}`, `Rm ${room} · ${row.lastValue}`)
    }
  }

  const sepsisPatients = new Set()
  for (const row of enrichedRows) {
    const hasFever = tempHigh.some((t) => t.patientId === row.patientId)
    const tach = pulseHigh.some((p) => p.patientId === row.patientId)
    const hypo = bpLow.some((b) => b.patientId === row.patientId)
    if (hasFever && tach && hypo && !sepsisPatients.has(row.patientId)) {
      sepsisPatients.add(row.patientId)
      const p = patientsById[row.patientId]
      add(
        `sepsis-${row.patientId}`,
        'critical',
        'Sepsis warning',
        `Clustered vitals — ${p?.fullName || row.patientName}`,
        'Simulated triad: fever trend + tachycardia + hypotension — escalate per protocol',
      )
    }
  }

  return out
}

export function getHealthCheckDashboardMetrics(patients) {
  if (!patients?.length) {
    return {
      urgentPatients: 0,
      missedChecks: 0,
      criticalAlerts: 0,
      liveLines: [],
    }
  }
  const rows = listHealthLoopRows(patients)
  const patientsById = Object.fromEntries(patients.map((p) => [p.id, p]))
  const ai = buildHealthCheckAiRisks(rows, patientsById)

  const missedChecks = rows.filter((r) => r.overdue).length
  const criticalReading = rows.filter((r) => r.readingStatus === 'critical').length
  const criticalAi = ai.filter((a) => a.severity === 'critical').length
  const criticalAlerts = criticalReading + criticalAi

  const urgentPatientIds = new Set()
  rows.forEach((r) => {
    if (r.urgent || r.readingStatus === 'critical') urgentPatientIds.add(r.patientId)
  })

  const liveLines = patients.slice(0, 6).map((p) => {
    const prow = rows.filter((r) => r.patientId === p.id)
    const worst = prow.reduce(
      (acc, r) => {
        const rank = r.readingStatus === 'critical' ? 3 : r.readingStatus === 'warning' ? 2 : r.overdue ? 1 : 0
        return rank > acc.rank ? { rank, summary: `${r.checkTypeLabel}: ${r.lastValue}` } : acc
      },
      { rank: 0, summary: 'Within simulated targets' },
    )
    return {
      patientId: p.id,
      patientName: p.fullName,
      statusLabel: worst.rank >= 3 ? 'Critical' : worst.rank === 2 ? 'Watch' : worst.rank === 1 ? 'Due' : 'Stable',
      summary: worst.summary,
    }
  })

  return {
    urgentPatients: urgentPatientIds.size,
    missedChecks,
    criticalAlerts,
    liveLines,
    aiPreview: ai.slice(0, 6),
  }
}

export function suggestDemoReading(checkTypeId) {
  const type = HEALTH_CHECK_LOOP_TYPES.find((t) => t.id === checkTypeId)
  const hint = type?.unitHint || ''
  const options = {
    bp: '126/78',
    pulse: '74',
    temp: '36.9',
    spo2: '97%',
    glucose: '112',
    weight: '73.0 kg',
    pain: '2',
    mental: 'AOx4, cooperative',
    urine: '38 mL/hr',
    bowel: 'Soft BM ×1',
    sleep: '6.5 h',
    appetite: '70%',
  }
  return { placeholder: options[checkTypeId] || '', hint }
}
