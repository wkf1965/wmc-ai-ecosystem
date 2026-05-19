import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Brain, Send, RefreshCw, ThermometerSnowflake, UserRoundCheck } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import { analyzeAllPatientsFromNotes } from '../lib/aiRiskDetection.js'

const DOCTOR_REVIEW_STORAGE_KEY = 'doctor_review_queue_statuses_v2'
const STATUS_OPTIONS = ['Pending review', 'Doctor notified', 'Reviewed', 'Action required', 'Resolved']
const statusClass = {
  'Pending review': 'bg-amber-50 text-amber-800 border-amber-200',
  'Doctor notified': 'bg-cyan-50 text-cyan-800 border-cyan-200',
  Reviewed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Action required': 'bg-red-50 text-red-800 border-red-200',
  Resolved: 'bg-slate-100 text-slate-700 border-slate-200',
}

const roomSeedMap = {
  p1: '302A',
  p2: '318C',
  p3: '214B',
  p4: '221D',
  p5: '305A',
}

const reasonPillars = {
  fever: {
    key: 'repeated_fever',
    label: 'Repeated fever',
    terms: ['fever', 'temp', 'temperature', 'chills', 'rigors'],
  },
  fallRisk: {
    key: 'fall_risk',
    label: 'Fall risk',
    categoryId: 'fall_risk',
  },
  dehydration: {
    key: 'dehydration',
    label: 'Dehydration risk',
    categoryId: 'dehydration',
  },
  medicationConcern: {
    key: 'medication_concern',
    label: 'Medication concern',
    terms: ['missed dose', 'medication', 'meds', 'held', 'not taken', 'refused', 'administered', 'dose'],
  },
  abnormalVitals: {
    key: 'abnormal_vitals',
    label: 'Abnormal vitals',
    terms: ['spo2', 'o2', 'bp ', 'blood pressure', 'blood sugar', 'desat', 'tachy', 'hypoxia'],
  },
  cognitive: {
    key: 'worsening_mood_confusion',
    label: 'Worsening mood/confusion',
    terms: ['confusion', 'disoriented', 'agitated', 'combative', 'confused', 'withdrawn', 'word-finding', 'not oriented', 'sundowning'],
  },
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function roomForPatientId(id, fallbackIndex = 1) {
  if (!id) return `TBD-${fallbackIndex}`
  return roomSeedMap[id] || `TBD-${String(fallbackIndex).padStart(3, '0')}`
}

function noteAsText(note) {
  return norm(`${note.appetite} ${note.mood} ${note.bloodPressure} ${note.bloodSugar} ${note.urination} ${note.abnormalEvents} ${note.nurseRemarks}`)
}

function parseLatestNumericValue(text, patterns) {
  let best = null
  for (const pattern of patterns) {
    const m = text.match(pattern)
    if (!m) continue
    const valueText = m[1] ?? m[0].match(/-?\d+(?:\.\d+)?/g)?.[0]
    const value = valueText ? Number(valueText) : Number.NaN
    if (!Number.isFinite(value)) continue
    best = Math.max(best ?? value, value)
  }
  return best
}

function hasRepeatedFever(notes) {
  const feverTerms = reasonPillars.fever.terms
  let feverCount = 0
  for (const note of notes.slice(0, 4)) {
    const text = noteAsText(note)
    const isFever = feverTerms.some((term) => text.includes(term))
    const temp = parseLatestNumericValue(text, [
      /\b(?:temp|temperature)\s*[:\-=]?\s*(\d{2,3}(?:\.\d)?)\b/gi,
      /\b(?:38|39|40)\.\d\b/g,
    ])
    const tempHigh = temp && temp >= 38
    if (isFever || tempHigh) feverCount += 1
    if (feverCount >= 2) return true
  }
  return false
}

function parseIntTemperatureFromText(text) {
  let max = null
  const tempMatches = Array.from(text.matchAll(/\btemp(?:erature)?\s*[:\-]?\s*(\d{2,3}(?:\.\d)?)\s*(c|°c|f|°f)?/gi))
  for (const match of tempMatches) {
    const parsed = Number(match[1])
    if (!Number.isFinite(parsed)) continue
    const unit = String(match[2] || '').toLowerCase()
    const normalized = unit.startsWith('f') || unit.includes('°f') ? ((parsed - 32) * 5) / 9 : parsed
    if (max === null || parsed > max) max = normalized
  }
  return max
}

function hasAbnormalVitals(notes) {
  const latest = notes[0]
  if (!latest) return false
  const text = noteAsText(latest)
  const temp = parseIntTemperatureFromText(text)
  if (temp !== null && temp >= 38) return true
  if (temp !== null && temp <= 35.5) return true

  const bp = latest.bloodPressure || ''
  const bpMatch = String(bp).match(/(\d{2,3})\s*\/\s*(\d{2,3})/)
  if (bpMatch) {
    const systolic = Number(bpMatch[1])
    const diastolic = Number(bpMatch[2])
    if (Number.isFinite(systolic) && Number.isFinite(diastolic) && (systolic >= 180 || systolic <= 85 || diastolic >= 110 || diastolic <= 45)) {
      return true
    }
  }

  const sugar = parseLatestNumericValue(text, [/\b(?:blood\s*sugar|bs|bgl)\s*[:\-=]?\s*(\d{2,3})\b/gi])
  if (Number.isFinite(sugar) && (sugar >= 300 || sugar <= 60)) return true

  const spo2 = parseLatestNumericValue(text, [/\bspo2\s*[:\-=]?\s*(\d{2,3})/gi, /\bo2\s*sat(?:uration)?\s*[:\-=]?\s*(\d{2,3})/gi, /\bspo\s*2\s*[:\-=]?\s*(\d{2,3})/gi])
  if (Number.isFinite(spo2) && spo2 <= 92) return true

  return reasonPillars.abnormalVitals.terms.some((term) => text.includes(term))
}

function hasMedicationConcern(notes) {
  return notes.some((note) => reasonPillars.medicationConcern.terms.some((term) => noteAsText(note).includes(term)))
}

function hasWorseningMoodOrConfusion(notes) {
  const textNow = noteAsText(notes[0] || {})
  const textPrev = noteAsText(notes[1] || {})
  const hasNow = reasonPillars.cognitive.terms.some((term) => textNow.includes(term))
  if (!hasNow) return false

  const worseningIndicators = /(worsen|worse|increased|escalat|declin|more)\s*(confusion|confused|agitation|agitated|distress|confab|disoriented|withdrawn|mood|behavior)/
  const hasPrev = reasonPillars.cognitive.terms.some((term) => textPrev.includes(term))
  return hasNow && (worseningIndicators.test(textNow) || !hasPrev)
}

function severityFromSources(entry) {
  if (entry.overallScore >= 85) return 'red'
  if (entry.reasons.some((reason) => ['Repeated fever', 'Medication concern', 'Abnormal vitals'].includes(reason))) {
    return 'red'
  }
  if (entry.overallScore >= 70 || entry.reasons.length >= 2) return 'orange'
  return 'green'
}

function severityChip(level) {
  if (level === 'red') return 'bg-red-100 text-red-700 border-red-200'
  if (level === 'orange') return 'bg-orange-100 text-orange-700 border-orange-200'
  return 'bg-emerald-100 text-emerald-700 border-emerald-200'
}

function loadStatuses() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(DOCTOR_REVIEW_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function saveStatuses(next) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DOCTOR_REVIEW_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore storage failures in simulation
  }
}

export default function DoctorReviewQueuePage() {
  const { patients, getById } = usePatients()
  const { notes } = useNursingNotes()
  const [statusMap, setStatusMap] = useState(() => loadStatuses())
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [doctorSummary, setDoctorSummary] = useState('')

  const notesByPatient = useMemo(() => {
    const grouped = {}
    for (const note of notes) {
      if (!note?.patientId) continue
      if (!grouped[note.patientId]) grouped[note.patientId] = []
      grouped[note.patientId].push(note)
    }
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => {
        const da = a.date || ''
        const db = b.date || ''
        if (da !== db) return db.localeCompare(da)
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      })
    }
    return grouped
  }, [notes])

  const patientAnalysis = useMemo(() => analyzeAllPatientsFromNotes(patients, notes, getById), [patients, notes, getById])

  const analysisByPatient = useMemo(() => {
    const map = {}
    for (const item of patientAnalysis) {
      map[item.patientId] = item
    }
    return map
  }, [patientAnalysis])

  const queueRows = useMemo(() => {
    const rows = []
    patients.forEach((patient, index) => {
      const patientNotes = notesByPatient[patient.id] || []
      if (patientNotes.length === 0) return
      const analysis = analysisByPatient[patient.id] || { overallScore: 0, categories: [] }
      const reasons = []

      const hasHighScore = analysis.overallScore >= 80
      if (hasHighScore) reasons.push('AI risk score >= 80')
      if (hasRepeatedFever(patientNotes)) reasons.push(reasonPillars.fever.label)
      if (analysis.categories?.some((c) => c.id === reasonPillars.fallRisk.categoryId && c.score >= 55)) {
        reasons.push(reasonPillars.fallRisk.label)
      }
      if (analysis.categories?.some((c) => c.id === reasonPillars.dehydration.categoryId && c.score >= 55)) {
        reasons.push(reasonPillars.dehydration.label)
      }
      if (hasMedicationConcern(patientNotes)) reasons.push(reasonPillars.medicationConcern.label)
      if (hasAbnormalVitals(patientNotes)) reasons.push(reasonPillars.abnormalVitals.label)
      if (hasWorseningMoodOrConfusion(patientNotes)) reasons.push(reasonPillars.cognitive.label)

      const uniqueReasons = [...new Set(reasons)]
      if (uniqueReasons.length === 0) return

      const latest = patientNotes[0]
      const latestTextSource = latest?.nurseRemarks || latest?.abnormalEvents || latest?.appetite || 'No nursing narrative available.'
      const latestText = latestTextSource.length > 140 ? `${latestTextSource.slice(0, 140)}…` : latestTextSource
      const status = statusMap[patient.id] || 'Pending review'
      rows.push({
        patientId: patient.id,
        patientName: patient.fullName || latest?.patientNameSnapshot || 'Unknown',
        room: roomForPatientId(patient.id, index + 1),
        triggerReason: uniqueReasons.join(' / '),
        reasons: uniqueReasons,
        triggerCount: uniqueReasons.length,
        severity: severityFromSources({ reasons: uniqueReasons, overallScore: analysis.overallScore }),
        latestNote: latestText,
        latestDateTime: latest?.createdAt || latest?.date || '',
        assignedNurse: latest?.author || patient.assignedNurse || 'Unassigned',
        status,
        analysis,
        latestEntry: latest,
      })
    })
    rows.sort((a, b) => {
      const s = { red: 3, orange: 2, green: 1 }
      if (s[b.severity] !== s[a.severity]) return s[b.severity] - s[a.severity]
      return b.triggerCount - a.triggerCount
    })
    return rows
  }, [notesByPatient, analysisByPatient, patients, statusMap])

  useEffect(() => {
    setStatusMap((current) => {
      let changed = false
      const next = { ...current }
      for (const row of queueRows) {
        if (!next[row.patientId]) {
          next[row.patientId] = 'Pending review'
          changed = true
        }
      }
      if (!changed) return current
      return next
    })
  }, [queueRows])

  useEffect(() => {
    if (queueRows.length === 0) return
    const current = selectedPatientId ? queueRows.find((row) => row.patientId === selectedPatientId) : null
    if (!current) {
      setSelectedPatientId(queueRows[0]?.patientId || '')
    }
  }, [queueRows, selectedPatientId])

  useEffect(() => {
    saveStatuses(statusMap)
  }, [statusMap])

  const selectedRow = useMemo(() => queueRows.find((row) => row.patientId === selectedPatientId), [queueRows, selectedPatientId])
  const pendingCount = queueRows.filter((row) => row.status === 'Pending review' || row.status === 'Action required').length

  function updateStatus(patientId, nextStatus) {
    setStatusMap((current) => ({
      ...current,
      [patientId]: nextStatus,
    }))
  }

  function markReviewed(patientId) {
    updateStatus(patientId, 'Reviewed')
  }

  function escalateUrgent(patientId) {
    updateStatus(patientId, 'Action required')
  }

  function generateSummary() {
    if (!selectedRow) {
      setDoctorSummary('No row is selected for doctor summary generation.')
      return
    }
    const previousNotes = notesByPatient[selectedRow.patientId]?.slice(0, 2) || []
    const recentChanges = previousNotes.length > 1 ? `${previousNotes[0]?.date} and ${previousNotes[1]?.date}` : `${previousNotes[0]?.date || 'No recent change history'}`
    const summaryText = `Clinical concern: ${selectedRow.triggerReason}
Recent changes: Risk signals were identified from the latest ${Math.min(previousNotes.length, 2)} nursing observations (${recentChanges}).
Suggested review focus: 
- Confirm trigger evolution and determine reversible contributors (medication, infection, dehydration, and mobility safety).
- Reassess vital set and orthostasis before escalation response.
- Evaluate medication adherence and reconcile MAR deviations.
Nursing actions already taken: ${previousNotes.map((note) => note.nurseRemarks || note.abnormalEvents || 'No narrative action noted').filter(Boolean).join(' | ') || 'No prior narrative actions captured.'}`
    setDoctorSummary(summaryText)
  }

  function copySummary() {
    const summaryText = doctorSummary || 'No doctor summary generated yet.'
    navigator.clipboard.writeText(summaryText)
  }

  function simulateWhatsAppToDoctor() {
    if (!selectedRow) return
    updateStatus(selectedRow.patientId, 'Doctor notified')
    if (typeof window !== 'undefined') {
      window.alert(`Simulated WhatsApp sent to doctor for ${selectedRow.patientName}.`)
    }
  }

  return (
    <div>
      <PageHeader
        title="Doctor Review Queue"
        description="Simulation mode only. Route flagged residents to the review list and coordinate escalations without sending live messages."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatusMap((current) => ({ ...current }))
              }
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh queue
            </button>
            <button
              type="button"
              onClick={() => generateSummary()}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Brain className="mr-2 inline h-4 w-4" aria-hidden />
              Generate doctor summary
            </button>
            <button
              type="button"
              onClick={copySummary}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Copy summary
            </button>
            <button
              type="button"
              onClick={simulateWhatsAppToDoctor}
              className="rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
            >
              <Send className="mr-2 inline h-4 w-4" aria-hidden />
              Simulate WhatsApp to doctor
            </button>
          </div>
        }
      />

      <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 ring-1 ring-amber-100">
        <p>
          <strong>Simulation mode:</strong> All actions are local, simulation-only and are not transmitted to providers.
        </p>
      </section>

      <section className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card padding="p-4">
          <p className="text-sm font-semibold text-slate-600">Total review queue</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{queueRows.length}</p>
        </Card>
        <Card padding="p-4">
          <p className="text-sm font-semibold text-slate-600">Red critical</p>
          <p className="mt-2 text-3xl font-bold text-red-700">{queueRows.filter((row) => row.severity === 'red').length}</p>
        </Card>
        <Card padding="p-4">
          <p className="text-sm font-semibold text-slate-600">Orange moderate</p>
          <p className="mt-2 text-3xl font-bold text-orange-700">
            {queueRows.filter((row) => row.severity === 'orange').length}
          </p>
        </Card>
        <Card padding="p-4">
          <p className="text-sm font-semibold text-slate-600">Pending / urgent</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{pendingCount}</p>
        </Card>
        <Card padding="p-4">
          <p className="text-sm font-semibold text-slate-600">Resolved today</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{queueRows.filter((row) => row.status === 'Resolved').length}</p>
        </Card>
      </section>

      <Card className="overflow-x-auto">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Patients requiring doctor review</h2>
        <div className="min-w-[900px]">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="border-b border-slate-200 px-3 py-2">Patient</th>
                <th className="border-b border-slate-200 px-3 py-2">Room</th>
                <th className="border-b border-slate-200 px-3 py-2">Trigger reason</th>
                <th className="border-b border-slate-200 px-3 py-2">Severity</th>
                <th className="border-b border-slate-200 px-3 py-2">Latest nursing note</th>
                <th className="border-b border-slate-200 px-3 py-2">Assigned nurse</th>
                <th className="border-b border-slate-200 px-3 py-2">Time</th>
                <th className="border-b border-slate-200 px-3 py-2">Status</th>
                <th className="border-b border-slate-200 px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queueRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-600" colSpan="9">
                    No patients currently require doctor review based on the configured triggers.
                  </td>
                </tr>
              ) : null}
              {queueRows.map((row, rowIndex) => (
                <tr
                  key={row.patientId}
                  className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                  onClick={() => setSelectedPatientId(row.patientId)}
                >
                  <td className="border-b border-slate-100 px-3 py-3">
                    <button
                      type="button"
                      className="w-full text-left font-semibold text-slate-900 hover:text-slate-700"
                      onClick={() => setSelectedPatientId(row.patientId)}
                    >
                      {row.patientName}
                    </button>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 text-slate-700">{row.room}</td>
                  <td className="border-b border-slate-100 px-3 py-3 text-slate-700">
                    <div className="max-w-sm">
                      <p className="font-medium text-slate-900">{row.triggerReason}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.reasons.map((reason) => (
                          <span key={reason} className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[11px]">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${severityChip(row.severity)}`}>{row.severity}</span>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3">
                    <p className="max-w-[320px] text-slate-700">{row.latestNote}</p>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 text-slate-700">{row.assignedNurse}</td>
                  <td className="border-b border-slate-100 px-3 py-3 text-slate-700">
                    {row.latestDateTime ? new Date(row.latestDateTime).toLocaleString() : 'No timestamp'}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3">
                    <select
                      value={row.status}
                      onChange={(e) => updateStatus(row.patientId, e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <span className={`mt-2 inline-flex ${statusClass[row.status] || statusClass['Pending review']} rounded-full border px-2 py-1 text-xs`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => markReviewed(row.patientId)}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        Mark reviewed
                      </button>
                      <button
                        type="button"
                        onClick={() => escalateUrgent(row.patientId)}
                        className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                      >
                        Escalate urgent
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">AI doctor summary panel</h3>
            <p className="mt-1 text-xs text-slate-600">
              Clinical concern, recent trajectory, review focus, and nursing actions for selected patient.
            </p>
          </div>
          {selectedRow ? <Badge>Selected: {selectedRow.patientName}</Badge> : null}
        </div>

        {selectedRow ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clinical concern</p>
              <p className="mt-1 text-sm text-slate-900">{selectedRow.triggerReason}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested review focus</p>
              <ul className="mt-1 space-y-1 text-sm text-slate-700">
                <li className="flex gap-2">
                  <ArrowUpRight className="mt-1 h-4 w-4 text-teal-700" aria-hidden />
                  Confirm deterioration trend and immediate intervention needs.
                </li>
                <li className="flex gap-2">
                  <ThermometerSnowflake className="mt-1 h-4 w-4 text-teal-700" aria-hidden />
                  Review medication timing, adherence, and adverse reactions.
                </li>
                <li className="flex gap-2">
                  <UserRoundCheck className="mt-1 h-4 w-4 text-teal-700" aria-hidden />
                  Validate fall-prevention and hydration plans before handoff.
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent changes</p>
              <p className="mt-1 text-sm text-slate-700">
                {selectedRow.latestEntry
                  ? `${selectedRow.latestEntry.date || selectedRow.latestDateTime}: ${selectedRow.latestEntry.nurseRemarks || selectedRow.latestEntry.abnormalEvents || 'No structured change note'}`
                  : 'No recent data'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nursing actions already taken</p>
              <p className="mt-1 text-sm text-slate-700">
                {notesByPatient[selectedRow.patientId]?.[0]?.abnormalEvents || notesByPatient[selectedRow.patientId]?.[0]?.nurseRemarks || 'No discrete action note found.'}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-600">No patient selected.</p>
        )}

        <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Generated summary text</p>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
            {doctorSummary || 'Generate a doctor summary to populate this panel.'}
          </pre>
        </section>
      </Card>
    </div>
  )
}
