/**
 * Simulation-only infection surveillance — not regulated infection reporting.
 */

import { MED_LOOP_ROOM_MAP } from '../data/medicationLoopSeed.js'

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function roomForPatient(id, idx) {
  return MED_LOOP_ROOM_MAP[id] || `TBD-${String(idx).padStart(3, '0')}`
}

/** @returns {'clear'|'monitor'|'suspected_infection'|'isolation_needed'|'urgent_review'} */
export function deriveInfectionScoreBand(row) {
  if (row.resolvedCase) return 'clear'
  const t = typeof row.temperatureC === 'number' ? row.temperatureC : parseFloat(row.temperatureC)
  const fever = Number.isFinite(t) && t >= 38.0
  const lowTempFever = Number.isFinite(t) && t >= 37.8
  const sepsisHint =
    fever &&
    (/\bconfus/i.test(String(row.coughFluSymptoms)) ||
      /\bspreading\b|\brigors\b/i.test(String(row.woundInfectionSigns)) ||
      /\brigors\b/i.test(String(row.utiSymptoms)))

  if (sepsisHint || row.possibleSepsisFlag) return 'urgent_review'
  if (row.isolationStatus === 'active' || row.isolationStatus === 'required') return 'isolation_needed'
  if (fever || lowTempFever) return 'suspected_infection'
  if (
    /\bproductive\b|\bpurulent\b|\bgreen\b|\bfoul\b/i.test(String(row.woundInfectionSigns)) ||
    /\bburning\b|\bcloudy\b|\brigors\b/i.test(String(row.utiSymptoms)) ||
    /\bvomit|\bdiarrh|\b3\+|\bcluster\b/i.test(String(row.diarrheaVomiting))
  )
    return 'suspected_infection'
  if (
    /\bcough\b|\bwheeze\b|\bsob\b|\bo2\b|\buri\b/i.test(String(row.coughFluSymptoms)) ||
    /\bredness\b|\bdrainage\b/i.test(String(row.woundInfectionSigns))
  )
    return 'monitor'
  return 'clear'
}

export function infectionControlBoardBucket(row) {
  if (row.resolvedCase) return 'resolved_cases'
  const band = row.infectionScoreBand || deriveInfectionScoreBand(row)
  if (row.doctorEscalation || band === 'urgent_review') return 'doctor_review_needed'
  if (row.isolationStatus === 'active' || row.isolationStatus === 'required') return 'isolation_required'
  const t = typeof row.temperatureC === 'number' ? row.temperatureC : parseFloat(row.temperatureC)
  if (Number.isFinite(t) && t >= 37.8) return 'fever_cases'
  if (/\bcough\b|\bflu\b|\bfever\b|\buri\b|\brti\b/i.test(String(row.coughFluSymptoms))) return 'fever_cases'
  if (band === 'suspected_infection' || band === 'monitor') return 'possible_infection'
  if (
    row.ppeRequired ||
    (row.contactPrecautions && row.contactPrecautions !== 'none' && row.contactPrecautions !== 'standard')
  )
    return 'ppe_required'
  return 'possible_infection'
}

function tallyScoreBands(rows) {
  const t = {
    clear: 0,
    monitor: 0,
    suspectedInfection: 0,
    isolationNeeded: 0,
    urgentReview: 0,
  }
  for (const row of rows) {
    const b = row.infectionScoreBand || deriveInfectionScoreBand(row)
    if (b === 'clear') t.clear += 1
    else if (b === 'monitor') t.monitor += 1
    else if (b === 'suspected_infection') t.suspectedInfection += 1
    else if (b === 'isolation_needed') t.isolationNeeded += 1
    else if (b === 'urgent_review') t.urgentReview += 1
  }
  return t
}

export function listInfectionControlRows(instanceMap) {
  const rows = Object.values(instanceMap || {}).map((r) => {
    const infectionScoreBand = deriveInfectionScoreBand(r)
    const boardBucket = infectionControlBoardBucket({ ...r, infectionScoreBand })
    return { ...r, infectionScoreBand, boardBucket }
  })
  const pri = (bucket) => {
    const o = {
      doctor_review_needed: 0,
      isolation_required: 1,
      fever_cases: 2,
      possible_infection: 3,
      ppe_required: 4,
      resolved_cases: 5,
    }
    return o[bucket] ?? 9
  }
  rows.sort((a, b) => {
    const d = pri(a.boardBucket) - pri(b.boardBucket)
    if (d !== 0) return d
    return a.patientName.localeCompare(b.patientName)
  })
  return rows
}

export function scoreTotalsWithRows(instanceMap) {
  const rows = listInfectionControlRows(instanceMap)
  return { rows, tallies: tallyScoreBands(rows) }
}

function symptomPick(h, idx) {
  const cough = [
    'None documented',
    'Intermittent dry cough',
    'Productive cough × 2 days',
    'URI symptoms — rhinorrhea',
    'Increased work of breathing; on room air',
    'New oxygen requirement overnight (sim)',
  ]
  const wound = [
    'None',
    'Periwound erythema — small',
    'Increased serous drainage',
    'Purulent drainage noted dressing change',
    'Warmth and spreading redness',
    'No acute change',
  ]
  const uti = [
    'None',
    'Dysuria reported',
    'Cloudy urine appearance',
    'Urgency frequency',
    'Low-grade symptoms — labs pending',
    'None — routine screening',
  ]
  const gastro = [
    'None',
    'One loose stool — monitoring',
    '3+ loose stools / low appetite',
    'Nausea without emesis',
    'Single episode vomiting — settled',
    'Cluster of loose stools × 24h (sim)',
  ]
  return {
    coughFluSymptoms: cough[(h + idx) % cough.length],
    woundInfectionSigns: wound[(h + idx * 3) % wound.length],
    utiSymptoms: uti[(h + idx * 5) % uti.length],
    diarrheaVomiting: gastro[(h + idx * 7) % gastro.length],
  }
}

/**
 * @returns {Record<string, object>}
 */
export function computeInfectionControlSnapshots(patients, prevInstances, nowMs = Date.now()) {
  const roster = patients?.length
    ? patients
    : [{ id: 'demo', fullName: 'Demo Resident', assignedNurse: 'Demo Nurse', room: '100A' }]

  const out = {}

  roster.forEach((p, idx) => {
    const pid = p.id
    const h = hashStr(`${pid}|infctl`)
    const prev = prevInstances[pid] || {}
    const sym = symptomPick(h, idx)

    const baseTemp = 36.2 + (h % 22) / 10
    const temperatureC =
      prev.manualTemperatureLock && typeof prev.temperatureC === 'number'
        ? prev.temperatureC
        : baseTemp + (h % 17 === 0 ? 1.4 : h % 13 === 0 ? 0.9 : 0)

    const isolationRoll = h % 21
    const isolationStatus =
      prev.isolationStatus && prev.isolationStatus !== 'none'
        ? prev.isolationStatus
        : isolationRoll === 0
          ? 'active'
          : isolationRoll === 1
            ? 'required'
            : isolationRoll === 2
              ? 'pending'
              : 'none'

    const precautionRoll = h % 9
    const contactPrecautions =
      prev.contactPrecautionsLocked && prev.contactPrecautions
        ? prev.contactPrecautions
        : precautionRoll === 0
          ? 'droplet'
          : precautionRoll === 1
            ? 'contact'
            : precautionRoll === 2
              ? 'airborne'
              : 'standard'

    const ppeRequired =
      typeof prev.ppeRequired === 'boolean'
        ? prev.ppeRequired
        : isolationStatus === 'active' || contactPrecautions === 'droplet' || contactPrecautions === 'airborne'

    const nurse =
      prev.nurseAssigned?.trim() ||
      p.assignedNurse?.trim() ||
      ['R.N. Patel', 'LPN Santos', 'R.N. Kim', 'R.N. Nguyen'][idx % 4]

    const lastInfectionCheckAt =
      prev.lastInfectionCheckAt || new Date(nowMs - ((h % 36) + 1) * 3600000).toISOString()
    const nextCheckDueAt =
      prev.nextCheckDueAt || new Date(nowMs + ((h % 50) + 20) * 60000).toISOString()

    const notes = Array.isArray(prev.notes) ? prev.notes : []

    const coughFluSymptoms = prev.coughFluSymptoms ?? sym.coughFluSymptoms
    const woundInfectionSigns = prev.woundInfectionSigns ?? sym.woundInfectionSigns
    const utiSymptoms = prev.utiSymptoms ?? sym.utiSymptoms
    const diarrheaVomiting = prev.diarrheaVomiting ?? sym.diarrheaVomiting

    const merged = {
      patientId: pid,
      patientName: p.fullName || 'Unknown',
      roomNumber: p.room || prev.roomNumber || roomForPatient(pid, idx + 1),
      temperatureC,
      coughFluSymptoms,
      woundInfectionSigns,
      utiSymptoms,
      diarrheaVomiting,
      isolationStatus,
      contactPrecautions,
      ppeRequired,
      nurseAssigned: nurse,
      lastInfectionCheckAt,
      nextCheckDueAt,
      notes,
      doctorEscalation: Boolean(prev.doctorEscalation),
      resolvedCase: Boolean(prev.resolvedCase),
      manualTemperatureLock: Boolean(prev.manualTemperatureLock),
      contactPrecautionsLocked: Boolean(prev.contactPrecautionsLocked),
      possibleSepsisFlag: Boolean(
        prev.possibleSepsisFlag ??
          (temperatureC >= 38.2 &&
            (/\bpurulent\b|\brigors\b|\bconfus/i.test(
              `${coughFluSymptoms} ${woundInfectionSigns} ${utiSymptoms}`,
            ))),
      ),
    }

    merged.infectionScoreBand = deriveInfectionScoreBand(merged)
    merged.boardBucket = infectionControlBoardBucket(merged)

    out[pid] = merged
  })

  return out
}

export function buildInfectionControlAiAlerts(rows) {
  const alerts = []
  const seen = new Set()
  let gastroCluster = 0
  let respiratoryCluster = 0

  for (const row of rows) {
    const t = typeof row.temperatureC === 'number' ? row.temperatureC : parseFloat(row.temperatureC)
    const pid = row.patientId

    if (Number.isFinite(t) && t >= 37.8) {
      const id = `fever-${pid}`
      if (!seen.has(id)) {
        seen.add(id)
        alerts.push({
          id,
          category: 'Fever trend',
          title: `Temperature elevation — ${row.patientName}`,
          detail: `${t.toFixed(1)}°C · next focus ${formatDue(row.nextCheckDueAt)}`,
          severity: t >= 38.5 ? 'critical' : 'high',
        })
      }
    }

    if (
      row.possibleSepsisFlag ||
      (Number.isFinite(t) &&
        t >= 38.5 &&
        /\bpurulent\b|\brigors\b|\bconfus/i.test(
          `${row.coughFluSymptoms} ${row.woundInfectionSigns} ${row.utiSymptoms}`,
        ))
    ) {
      const id = `sepsis-${pid}`
      if (!seen.has(id)) {
        seen.add(id)
        alerts.push({
          id,
          category: 'Possible sepsis',
          title: `Systemic infection concern — ${row.patientName}`,
          detail: 'Fever plus focal/systemic cues — simulation screen only.',
          severity: 'critical',
        })
      }
    }

    if (/\bpurulent\b|\bspreading\b|\bfoul\b/i.test(String(row.woundInfectionSigns))) {
      alerts.push({
        id: `wound-${pid}`,
        category: 'Wound infection concern',
        title: `Wound surveillance — ${row.patientName}`,
        detail: String(row.woundInfectionSigns).slice(0, 120),
        severity: 'high',
      })
    }

    if (/\bdysuria\b|\bcloudy\b|\burinary\b/i.test(String(row.utiSymptoms))) {
      alerts.push({
        id: `uti-${pid}`,
        category: 'UTI concern',
        title: `Genitourinary symptoms — ${row.patientName}`,
        detail: String(row.utiSymptoms),
        severity: 'medium',
      })
    }

    if (/\b3\+|\bvomit|\bdiarrh|\bcluster\b/i.test(String(row.diarrheaVomiting))) {
      gastroCluster += 1
      alerts.push({
        id: `gastro-${pid}`,
        category: 'Gastroenteritis outbreak risk',
        title: `GI symptoms flagged — ${row.patientName}`,
        detail: String(row.diarrheaVomiting),
        severity: 'high',
      })
    }

    if (/\bcough\b|\bproductive\b|\bwheeze\b|\bsob\b/i.test(String(row.coughFluSymptoms))) {
      respiratoryCluster += 1
      alerts.push({
        id: `resp-${pid}`,
        category: 'Respiratory infection risk',
        title: `Respiratory symptoms — ${row.patientName}`,
        detail: String(row.coughFluSymptoms).slice(0, 140),
        severity: 'medium',
      })
    }

    if (row.doctorEscalation || deriveInfectionScoreBand(row) === 'urgent_review') {
      alerts.push({
        id: `md-${pid}`,
        category: 'Doctor review needed',
        title: `Provider awareness — ${row.patientName}`,
        detail: 'Escalation or urgent infection band (sim).',
        severity: 'high',
      })
    }
  }

  if (gastroCluster >= 3) {
    alerts.push({
      id: 'outbreak-gi',
      category: 'Gastroenteritis outbreak risk',
      title: 'Clustered GI symptoms across roster',
      detail: `${gastroCluster} residents with notable GI narratives — infection control review.`,
      severity: 'critical',
    })
  }

  if (respiratoryCluster >= 4) {
    alerts.push({
      id: 'outbreak-resp',
      category: 'Respiratory infection risk',
      title: 'Clustered respiratory symptoms',
      detail: `${respiratoryCluster} residents with cough/SOB language — cohorting consideration (sim).`,
      severity: 'high',
    })
  }

  const uniq = []
  const ids = new Set()
  for (const a of alerts) {
    if (ids.has(a.id)) continue
    ids.add(a.id)
    uniq.push(a)
  }
  return uniq
}

function formatDue(iso) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function infectionControlMasterAiSummary(rows) {
  const fevers = rows.filter((r) => {
    const t = typeof r.temperatureC === 'number' ? r.temperatureC : parseFloat(r.temperatureC)
    return Number.isFinite(t) && t >= 37.8 && !r.resolvedCase
  })
  const suspected = rows.filter((r) => deriveInfectionScoreBand(r) === 'suspected_infection')
  return [
    `Fever watch (${fevers.length}): ${fevers.map((r) => `${r.patientName} (${Number(r.temperatureC).toFixed(1)}°C)`).join('; ') || 'none over threshold.'}`,
    `Possible infection narratives (${suspected.length}): review wounds, urine, and respiratory cues on flagged cards.`,
    `Isolation: verify signage, dedicated equipment, and cohort timing when status is active.`,
    `PPE: gown/gloves for contact; mask/eye protection for droplet; N95 pathway for airborne (sim policy).`,
    `Nursing actions: vitals per protocol, labs/cultures if ordered, hand hygiene, exposure log.`,
    `Medical review when fever persists, hemodynamic changes, or focal infection worsens.`,
  ].join(' ')
}

export function infectionControlAiSummaryBlocks(rows) {
  const fevers = rows.filter((r) => {
    const t = typeof r.temperatureC === 'number' ? r.temperatureC : parseFloat(r.temperatureC)
    return Number.isFinite(t) && t >= 37.8
  })
  const possible = rows.filter(
    (r) =>
      !r.resolvedCase &&
      (deriveInfectionScoreBand(r) === 'suspected_infection' || deriveInfectionScoreBand(r) === 'monitor'),
  )
  return {
    patientsWithFever: fevers.map((r) => `${r.patientName} · Rm ${r.roomNumber} · ${r.temperatureC}°C`).join('\n') || 'None ≥ 37.8°C.',
    possibleInfectionCases:
      possible
        .map((r) => `${r.patientName}: ${String(r.woundInfectionSigns).slice(0, 50)}…`)
        .join('\n')
        .slice(0, 1200) || 'See board columns.',
    isolationChecklist:
      '□ Order verified\n□ Door signage\n□ Dedicated equipment\n□ Waste stream\n□ Visitor teaching\n□ Therapy/meals coordinated',
    ppeChecklist:
      '□ Precaution tier correct\n□ Eye protection when indicated\n□ Don/doff observed\n□ Supply par\n□ Latex allergy',
    nurseActionChecklist:
      '□ Vitals trend\n□ I/O\n□ Culture timing\n□ Notify provider\n□ Linen handling',
    doctorReviewRecommendation:
      'Escalate sustained fever, hypotension, new O₂ need, AMS, or spreading cellulitis.',
  }
}

export function buildInfectionControlReportCsv(rows) {
  const headers = [
    'Patient',
    'Room',
    'Temp C',
    'Cough/flu',
    'Wound signs',
    'UTI symptoms',
    'GI symptoms',
    'Isolation',
    'Precautions',
    'PPE required',
    'Nurse',
    'Last check',
    'Next due',
    'Score band',
    'Board bucket',
    'MD escalation',
    'Resolved',
  ]
  function esc(v) {
    const s = String(v ?? '')
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.map(esc).join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.patientName,
        r.roomNumber,
        r.temperatureC,
        r.coughFluSymptoms,
        r.woundInfectionSigns,
        r.utiSymptoms,
        r.diarrheaVomiting,
        r.isolationStatus,
        r.contactPrecautions,
        r.ppeRequired ? 'yes' : 'no',
        r.nurseAssigned,
        r.lastInfectionCheckAt,
        r.nextCheckDueAt,
        r.infectionScoreBand || deriveInfectionScoreBand(r),
        r.boardBucket || infectionControlBoardBucket(r),
        r.doctorEscalation ? 'yes' : 'no',
        r.resolvedCase ? 'yes' : 'no',
      ]
        .map(esc)
        .join(','),
    )
  }
  return lines.join('\r\n')
}
