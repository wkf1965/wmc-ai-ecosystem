import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarRange, ClipboardCopy, FileText, HandHeart, Plus, Printer, RefreshCw } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { saveRehabSession } from '../lib/googleSheetSync.js'

const REHAB_TRACKING_STORAGE_KEY = 'wmc_rehab_tracking_sessions_v1'
const REHAB_STATUSES = ['Improving', 'Stable', 'Declining', 'High potential recovery']
const WHEELCHAIR_OPTIONS = ['Independent', 'Needs support', 'Full dependence']
const EXERCISE_OPTIONS = ['Minimal', 'Partial', 'Moderate', 'Full']
const STATUS_CLASSES = {
  Improving: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  Stable: 'bg-sky-100 text-sky-800 ring-sky-200',
  Declining: 'bg-amber-100 text-amber-900 ring-amber-200',
  'High potential recovery': 'bg-violet-100 text-violet-900 ring-violet-200',
}

function safeNumber(input, fallback = 0) {
  const value = Number(input)
  return Number.isFinite(value) ? value : fallback
}

function sessionScore(session) {
  const walking = safeNumber(session.walkingDistance, 0) // 0-150 baseline
  const transfer = safeNumber(session.transferAbility, 1) // 1-5
  const muscle = safeNumber(session.muscleStrength, 1) // 1-5
  const balance = safeNumber(session.balance, 1) // 1-5
  const speech = safeNumber(session.speechRecovery, 1) // 1-5
  const adl = safeNumber(session.adlIndependence, 1) // 1-5
  const pain = safeNumber(session.painScore, 0) // 0-10
  const exerciseMap = { Minimal: 20, Partial: 45, Moderate: 70, Full: 100 }
  const exercise = exerciseMap[session.exerciseParticipation] || 50
  const wheelchairPenalty = session.wheelchairDependence ? 12 : 0

  const normalizedWalking = Math.min(100, Math.max(0, (walking / 120) * 100))
  const normalized = [
    normalizedWalking,
    ((transfer - 1) / 4) * 100,
    ((muscle - 1) / 4) * 100,
    ((balance - 1) / 4) * 100,
    ((speech - 1) / 4) * 100,
    ((adl - 1) / 4) * 100,
    Math.max(0, (10 - pain) * 10),
    exercise,
  ].map((value) => Math.max(0, Math.min(100, value)))

  const base = normalized.reduce((sum, v) => sum + v, 0) / normalized.length
  return Math.max(0, Math.round(base - wheelchairPenalty))
}

function deriveStatus(history) {
  if (!history || history.length === 0) return 'Stable'
  if (history.length < 2) return 'Stable'
  const sorted = [...history].sort((a, b) => new Date(a.date) - new Date(b.date))
  const latest = sessionScore(sorted[sorted.length - 1])
  const previous = sessionScore(sorted[Math.max(0, sorted.length - 2)])
  const recentAverage = sorted.slice(-3).reduce((sum, row) => sum + sessionScore(row), 0) / Math.min(3, sorted.length)
  const earlyAverage = sorted.slice(0, Math.min(3, sorted.length)).reduce((sum, row) => sum + sessionScore(row), 0) / Math.min(3, sorted.length)
  const delta = latest - previous
  const netGain = recentAverage - earlyAverage
  const finalDelta = sorted.length >= 5 ? (delta * 0.8 + netGain * 0.2) : delta

  if (latest >= 82 && netGain >= 8) return 'High potential recovery'
  if (finalDelta >= 8) return 'Improving'
  if (finalDelta <= -7) return 'Declining'
  return 'Stable'
}

function getWeekLabel(dateText) {
  const date = new Date(dateText)
  if (Number.isNaN(date.valueOf())) return 'Unknown'
  const start = new Date(date)
  start.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  const dd = String(start.getDate()).padStart(2, '0')
  return `${start.toLocaleDateString([], { month: 'short' })} ${dd}`
}

function getMonthLabel(dateText) {
  const date = new Date(dateText)
  if (Number.isNaN(date.valueOf())) return 'Unknown'
  return date.toLocaleDateString([], { month: 'short', year: '2-digit' })
}

function scoreTrendDirection(score) {
  if (score >= 0 && score < 40) return 'low'
  if (score >= 40 && score < 65) return 'moderate'
  if (score >= 65) return 'good'
  return 'low'
}

function statusForScore(score, patientTrend) {
  if (score >= 80 && patientTrend >= 10) return 'High potential recovery'
  if (patientTrend > 6) return 'Improving'
  if (patientTrend < -5) return 'Declining'
  return 'Stable'
}

function linearlyPredict(scores) {
  if (!scores.length) return []
  if (scores.length === 1) return [scores[0], scores[0] + 2]
  const y1 = scores[0]
  const y2 = scores[scores.length - 1]
  const trend = (y2 - y1) / Math.max(1, scores.length - 1)
  const next = [...scores]
  const projected = y2 + trend * 2
  next.push(Math.max(0, Math.min(100, Math.round(projected))))
  return next
}

function uniqueRowsById(rows) {
  const seen = new Set()
  const unique = []
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue
    seen.add(row.id)
    unique.push(row)
  }
  return unique
}

function cryptoId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `rehab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function seedDate(daysAgo) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}

function seedByPatientId() {
  return []
}

function normalizeSessions(input) {
  if (!Array.isArray(input)) return []
  return input
    .filter((row) => row?.id && row?.patientId && row?.date)
    .map((row) => ({
      ...row,
      walkingDistance: safeNumber(row.walkingDistance, 0),
      transferAbility: safeNumber(row.transferAbility, 1),
      muscleStrength: safeNumber(row.muscleStrength, 1),
      balance: safeNumber(row.balance, 1),
      speechRecovery: safeNumber(row.speechRecovery, 1),
      adlIndependence: safeNumber(row.adlIndependence, 1),
      painScore: safeNumber(row.painScore, 0),
      wheelchairDependence: Boolean(row.wheelchairDependence),
      exerciseParticipation: EXERCISE_OPTIONS.includes(row.exerciseParticipation) ? row.exerciseParticipation : 'Partial',
    }))
}

function readRehabRecords() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(REHAB_TRACKING_STORAGE_KEY)
    const data = raw ? JSON.parse(raw) : null
    if (!Array.isArray(data)) return null
    return uniqueRowsById(normalizeSessions(data))
  } catch {
    return null
  }
}

function writeRehabRecords(rows) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(REHAB_TRACKING_STORAGE_KEY, JSON.stringify(rows))
  } catch {
    // keep silent in local mode
  }
}

function buildFamilyUpdateText(summary, patientName) {
  const target = patientName || 'your loved one'
  return `Family Update\n
Dear family member,\n
We recorded ${summary.sessionCount} rehab sessions so far for ${target}.\n
Current rehab trend: ${summary.status}. ${summary.functionalImprovement}\n
Potential concern areas: ${summary.riskFactors.length ? summary.riskFactors.join('; ') : 'No major concerns identified in this review'}.\n
Suggested focus: ${summary.suggestedRehabFocus}.\n
Therapist notes: ${summary.therapistRecommendations.join('; ')}\n
Encouragement message: ${summary.familyEncouragement}\n
Please review before sharing with family.`
}

function buildRehabSummary(sessions, targetPatientName) {
  if (!sessions.length) {
    return {
      status: 'Stable',
      functionalImprovement: 'No sessions yet recorded.',
      riskFactors: [],
      suggestedRehabFocus: 'Capture the first rehab session to establish baseline.',
      therapistRecommendations: ['Reassess baseline function on next visit.', 'Start with low-intensity gait and transfer drills.'],
      familyEncouragement: 'Share first goals once baseline metrics are captured.',
      sessionCount: 0,
      trend: [],
      patientName: targetPatientName || 'selected patient',
    }
  }

  const ordered = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date))
  const scores = ordered.map((row) => sessionScore(row))
  const latest = ordered[ordered.length - 1]
  const first = ordered[0]
  const latestScore = scores[scores.length - 1]
  const firstScore = scores[0]
  const improvement = latestScore - firstScore
  const status = deriveStatus(ordered)
  const direction = scoreTrendDirection(latestScore)
  const latestPain = latest.painScore
  const decliningField = ['walkingDistance', 'transferAbility', 'muscleStrength', 'balance', 'speechRecovery', 'adlIndependence'].reduce(
    (worst, key) => {
      const val = latest[key]
      if (typeof val !== 'number') return worst
      if (worst.lowest === null || val < worst.lowest.value) {
        return { key, value: val, lowest: { value: val, key } }
      }
      return worst
    },
    { key: 'balance', lowest: { value: 999, key: 'balance' } },
  ).key || 'balance'

  const riskFactors = []
  if (latest.painScore >= 7) riskFactors.push('Pain score elevated')
  if (latest.wheelchairDependence) riskFactors.push('Wheelchair dependence persists')
  if (latest.transferAbility <= 2) riskFactors.push('Transfer safety remains limited')
  if (latest.balance <= 2) riskFactors.push('Persistent balance deficit')
  if (latest.speechRecovery <= 2) riskFactors.push('Speech recovery remains slow')
  if (latest.adlIndependence <= 2) riskFactors.push('ADL independence remains low')

  const focusMap = {
    walkingDistance: 'increase endurance and short-distance ambulation',
    transferAbility: 'prioritize transfer training and safety sequencing',
    muscleStrength: 'focus on graded resistance and sit-to-stand repetition',
    balance: 'add standing balance and trunk control interventions',
    speechRecovery: 'coordinate with speech therapy for swallow and articulation drills',
    adlIndependence: 'repeat ADL task drills to improve independence',
  }

  const recommendations = []
  if (latest.painScore >= 6) recommendations.push('Pre-session pain check and stepwise pain-reduction support.')
  if (latest.adlIndependence <= 3) recommendations.push('Train toileting, feeding, and bed mobility as protected blocks.')
  if (latest.wheelchairDependence) recommendations.push('Blend transfer and short ambulation with safety guard before discharge planning.')
  if (latest.balance <= 3) recommendations.push('Add daily seated/standing balance progression with verbal cueing.')
  recommendations.push('Reassess goals weekly and document carry-over in nursing handover notes.')

  return {
    status,
    sessionCount: ordered.length,
    functionalImprovement: `${improvement >= 0 ? '+' : ''}${improvement} points on the simulated functional index over ${
      ordered.length
    } sessions; current status appears ${direction}.`,
    riskFactors,
    suggestedRehabFocus: focusMap[decliningField] || 'mobility and ADL functional integration',
    therapistRecommendations: recommendations,
    familyEncouragement:
      improvement >= 6
        ? 'Progress is visible. Encourage repeat of home exercise routine with staff support.'
        : 'Focus on consistency — short, successful daily practice is leading to better carry-over.',
    trend: ordered.map((row, i) => ({ label: `S${i + 1}`, score: scores[i] })),
    patientName: targetPatientName || latest.patientName || 'selected patient',
  }
}

export default function RehabTrackingPage() {
  const { patients } = usePatients()

  const initialFormDate = new Date().toISOString().slice(0, 10)
  const [sessions, setSessions] = useState(() => {
    const cached = readRehabRecords()
    if (cached && cached.length > 0) return cached
    return seedByPatientId()
  })
  const [selectedPatientId, setSelectedPatientId] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sessionFormOpen, setSessionFormOpen] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [reportText, setReportText] = useState('')
  const [reportSubjectId, setReportSubjectId] = useState('all')
  const [isSubmittingSession, setIsSubmittingSession] = useState(false)
  const [sessionSubmitMessage, setSessionSubmitMessage] = useState('')
  const [form, setForm] = useState({
    patientId: '',
    date: initialFormDate,
    walkingDistance: '70',
    transferAbility: '3',
    muscleStrength: '3',
    balance: '3',
    speechRecovery: '3',
    adlIndependence: '3',
    painScore: '5',
    wheelchairDependence: 'Needs support',
    exerciseParticipation: 'Moderate',
    notes: '',
  })

  useEffect(() => {
    if (patients.length === 0) return
    setSessions((current) => {
      const map = new Map(current.map((session) => [session.id, session]))
      const existing = new Set(current.map((session) => session.patientId))
      const additions = []
      for (const patient of patients) {
        if (existing.has(patient.id)) continue
        additions.push({
          id: cryptoId(),
          patientId: patient.id,
          patientNameSnapshot: patient.fullName || patient.name,
          date: new Date().toISOString(),
          walkingDistance: 65,
          transferAbility: 2,
          muscleStrength: 2,
          balance: 2,
          speechRecovery: 2,
          adlIndependence: 2,
          painScore: 6,
          wheelchairDependence: true,
          exerciseParticipation: 'Partial',
          notes: 'Auto-added for roster sync.',
        })
      }
      if (additions.length === 0) return current
      return [...current, ...additions]
    })
  }, [patients])

  useEffect(() => {
    writeRehabRecords(sessions)
  }, [sessions])

  const patientMap = useMemo(() => {
    const map = new Map()
    for (const p of patients) map.set(p.id, p)
    return map
  }, [patients])

  const enrichedSessions = useMemo(() => {
    const groupedByPatient = new Map()
    for (const session of sessions) {
      const key = session.patientId
      if (!groupedByPatient.has(key)) groupedByPatient.set(key, [])
      groupedByPatient.get(key).push(session)
    }
    for (const list of groupedByPatient.values()) {
      list.sort((a, b) => new Date(a.date) - new Date(b.date))
    }

    return sessions.map((session) => {
      const patient = patientMap.get(session.patientId)
      const patientHistory = groupedByPatient.get(session.patientId) || []
      const latestStatus = deriveStatus(patientHistory)
      const score = sessionScore(session)
      return {
        ...session,
        patientName: patient?.fullName || patient?.name || session.patientNameSnapshot || 'Unknown patient',
        rehabScore: score,
        rehabStatus: latestStatus,
        statusClass: STATUS_CLASSES[latestStatus] || STATUS_CLASSES.Stable,
      }
    })
  }, [sessions, patientMap])

  const patientOptions = useMemo(() => {
    const fallbackIds = new Set(enrichedSessions.map((s) => s.patientId))
    const seenNames = new Map()
    for (const session of enrichedSessions) {
      seenNames.set(session.patientId, session.patientName)
    }
    for (const patient of patients) {
      if (!seenNames.has(patient.id)) {
        seenNames.set(patient.id, patient.fullName || patient.name)
      }
      fallbackIds.add(patient.id)
    }
    return Array.from(fallbackIds)
      .map((id) => ({ id, label: seenNames.get(id) || `Patient ${id}` }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [enrichedSessions, patients])

  const filteredSessions = useMemo(() => {
    let list = enrichedSessions
    if (selectedPatientId !== 'all') {
      list = list.filter((s) => s.patientId === selectedPatientId)
    }
    if (statusFilter !== 'all') {
      list = list.filter((s) => s.rehabStatus === statusFilter)
    }
    return [...list].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [enrichedSessions, selectedPatientId, statusFilter])

  const selectedPatientSessions = useMemo(() => {
    const rows = selectedPatientId === 'all' ? enrichedSessions : enrichedSessions.filter((s) => s.patientId === selectedPatientId)
    return [...rows].sort((a, b) => new Date(a.date) - new Date(b.date))
  }, [enrichedSessions, selectedPatientId])

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(REHAB_STATUSES.map((status) => [status, 0]))
    for (const patientId of new Set(enrichedSessions.map((s) => s.patientId))) {
      const patientRows = enrichedSessions.filter((s) => s.patientId === patientId)
      counts[deriveStatus(patientRows)] = (counts[deriveStatus(patientRows)] || 0) + 1
    }
    return counts
  }, [enrichedSessions])

  const weeklyProgress = useMemo(() => {
    const grouped = new Map()
    for (const session of selectedPatientSessions) {
      const label = getWeekLabel(session.date)
      if (!grouped.has(label)) grouped.set(label, [])
      grouped.get(label).push(session)
    }
    return Array.from(grouped, ([week, rows]) => {
      const avg = rows.reduce((sum, row) => sum + sessionScore(row), 0) / Math.max(1, rows.length)
      return {
        week,
        sessions: rows.length,
        rehabScore: Math.round(avg),
      }
    }).slice(-8)
  }, [selectedPatientSessions])

  const monthlyProgress = useMemo(() => {
    const grouped = new Map()
    for (const session of selectedPatientSessions) {
      const month = getMonthLabel(session.date)
      if (!grouped.has(month)) grouped.set(month, [])
      grouped.get(month).push(session)
    }
    const data = Array.from(grouped, ([month, rows]) => {
      const avg = rows.reduce((sum, row) => sum + sessionScore(row), 0) / Math.max(1, rows.length)
      const avgPain = rows.reduce((sum, row) => sum + safeNumber(row.painScore, 0), 0) / Math.max(1, rows.length)
      const wheelchairRate = (rows.filter((row) => row.wheelchairDependence).length / rows.length) * 100
      return {
        month,
        rehabScore: Math.round(avg),
        pain: Number(avgPain.toFixed(1)),
        wheelchairRate: Math.round(wheelchairRate),
      }
    })
    return data
  }, [selectedPatientSessions])

  const aiRecoveryTrend = useMemo(() => {
    const rows = selectedPatientSessions.map((row, index) => ({
      x: `S${index + 1}`,
      rehabScore: row.rehabScore,
      date: row.date,
    }))
    const scores = rows.map((row) => row.rehabScore)
    const predicted = linearlyPredict(scores)
    if (rows.length === 0) return []
    if (rows.length === 1) {
      return [
        { ...rows[0], predicted: predicted[0] },
        { x: 'S2', date: '', rehabScore: rows[0].rehabScore, predicted: predicted[1] },
      ]
    }
    return rows.map((row, index) => ({
      ...row,
      predicted: index === rows.length - 1 ? predicted[index] : undefined,
    }))
  }, [selectedPatientSessions])

  const summaryInput = useMemo(() => {
    const target = selectedPatientSessions.find((s) => s.patientId === reportSubjectId) || selectedPatientSessions[0]
    const targetSessions = selectedPatientId === 'all'
      ? selectedPatientSessions.filter((s) => (target ? s.patientId === target.patientId : true))
      : selectedPatientSessions
    const targetName = target?.patientName
    return {
      patientName: targetName,
      patientId: target?.patientId,
      rows: targetSessions,
      text: buildRehabSummary(targetSessions, targetName),
    }
  }, [reportSubjectId, selectedPatientSessions, selectedPatientId])

  const aiSummary = summaryInput.text

  function onFormChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function showSessionToast(message) {
    setSessionSubmitMessage(message)
    if (!message) return
    window.setTimeout(() => {
      setSessionSubmitMessage('')
    }, 2200)
  }

  async function addSession(event) {
    event.preventDefault()
    if (!form.patientId) {
      window.alert('Please select a patient before adding a rehab session.')
      return
    }
    const patient = patients.find((p) => p.id === form.patientId)
    const newSession = {
      id: cryptoId(),
      patientId: form.patientId,
      patientNameSnapshot: patient?.fullName || patient?.name || 'Patient',
      date: new Date(`${form.date}T00:00:00`).toISOString(),
      walkingDistance: safeNumber(form.walkingDistance, 0),
      transferAbility: safeNumber(form.transferAbility, 1),
      muscleStrength: safeNumber(form.muscleStrength, 1),
      balance: safeNumber(form.balance, 1),
      speechRecovery: safeNumber(form.speechRecovery, 1),
      adlIndependence: safeNumber(form.adlIndependence, 1),
      painScore: safeNumber(form.painScore, 0),
      wheelchairDependence: form.wheelchairDependence !== 'Independent',
      exerciseParticipation: form.exerciseParticipation,
      notes: form.notes.trim(),
    }
    setIsSubmittingSession(true)

    setSessions((current) => [...current, newSession])
    setReportSubjectId(newSession.patientId)
    setSelectedPatientId('all')
    setForm((current) => ({
      ...current,
      date: new Date().toISOString().slice(0, 10),
      notes: '',
      walkingDistance: String(current.walkingDistance),
    }))
    setSessionFormOpen(false)
    try {
      const synced = await saveRehabSession(newSession)
      if (synced?.googleSheetSyncStatus === 'failed') {
        throw new Error(synced?.googleSheetSyncMessage || 'Failed to sync rehab session.')
      }
      showSessionToast('Saved to Google Sheet database')
    } catch (error) {
      showSessionToast(error instanceof Error ? error.message : 'Failed to save rehab session to Google Sheet.')
    }
    setIsSubmittingSession(false)
  }

  function generateReport() {
    const lines = []
    lines.push('AI Rehabilitation Report')
    lines.push(`Generated: ${new Date().toLocaleString()}`)
    lines.push(`Report scope: ${reportSubjectId === 'all' ? 'All tracked patients' : aiSummary.patientName}`)
    lines.push('')
    lines.push(`Functional improvement: ${aiSummary.functionalImprovement}`)
    lines.push(`Status: ${aiSummary.status}`)
    lines.push(`Total sessions reviewed: ${aiSummary.sessionCount}`)
    lines.push('')
    lines.push('Rehab status counts')
    for (const [key, count] of Object.entries(statusCounts)) {
      lines.push(`- ${key}: ${count}`)
    }
    lines.push('')
    lines.push('Risk factors')
    if (aiSummary.riskFactors.length > 0) {
      for (const risk of aiSummary.riskFactors) lines.push(`- ${risk}`)
    } else {
      lines.push('- None identified in current trend')
    }
    lines.push('')
    lines.push(`Suggested rehab focus: ${aiSummary.suggestedRehabFocus}`)
    lines.push('')
    lines.push('Therapist recommendations')
    for (const item of aiSummary.therapistRecommendations) lines.push(`- ${item}`)
    lines.push('')
    lines.push(`Family encouragement: ${aiSummary.familyEncouragement}`)
    lines.push('')
    lines.push('Recent sessions')
    const sourceRows = selectedPatientId === 'all' ? sessions : sessions.filter((s) => s.patientId === selectedPatientId)
    if (sourceRows.length === 0) {
      lines.push('No sessions captured yet.')
    } else {
      const ordered = [...sourceRows]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 12)
      for (const row of ordered) {
        const patient = patients.find((p) => p.id === row.patientId)
        const patientName = patient?.fullName || row.patientNameSnapshot || row.patientId
        const s = sessionScore(row)
        const d = new Date(row.date).toLocaleDateString()
        lines.push(
          `${d} | ${patientName} | walking ${row.walkingDistance}m | transfer ${row.transferAbility}/5 | strength ${row.muscleStrength}/5 | balance ${row.balance}/5 | speech ${row.speechRecovery}/5 | ADL ${row.adlIndependence}/5 | pain ${row.painScore}/10 | wheelchair ${row.wheelchairDependence ? 'yes' : 'no'} | exercise ${row.exerciseParticipation} | score ${s}`,
        )
      }
    }
    const report = lines.join('\n')
    setSummaryText(report)
    setReportText(report)
    return report
  }

  function printReport() {
    const text = generateReport()
    const popup = window.open('', '_blank', 'width=1024,height=768')
    if (!popup) {
      window.alert('Popup blocked. Falling back to in-page print.')
      window.print()
      return
    }
    popup.document.write(`
      <html>
        <head>
          <title>AI Rehabilitation Progress Report</title>
          <style>
            body { font-family: Inter, system-ui, sans-serif; padding: 16px; color: #0f172a; }
            h1 { font-size: 22px; margin: 0 0 8px; }
            pre { white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <h1>AI Rehabilitation Progress Report</h1>
          <pre>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</pre>
        </body>
      </html>
    `)
    popup.document.close()
    popup.focus()
    popup.print()
    popup.close()
  }

  function copyFamilyUpdate() {
    if (!selectedPatientSessions.length) {
      window.alert('No rehab session data yet. Add a session first, then copy family update.')
      return
    }
    const payload = buildFamilyUpdateText(aiSummary, aiSummary.patientName)
    navigator.clipboard.writeText(payload)
      .then(() => {
        window.alert('Family update copied to clipboard.')
      })
      .catch(() => {
        window.alert('Unable to copy to clipboard in this environment.')
      })
  }

  function refreshRehabData() {
    setSessions(seedByPatientId())
  }

  return (
    <div>
      <PageHeader
        title="Nursing Care Tracking"
        description="Nursing progress dashboard with AI recovery analysis and session-by-session tracking."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSessionFormOpen((open) => !open)}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add rehab session
            </button>
            <button
              type="button"
              onClick={generateReport}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileText className="h-4 w-4" aria-hidden />
              Generate AI rehab report
            </button>
            <button
              type="button"
              onClick={printReport}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" aria-hidden />
              Print progress report
            </button>
            <button
              type="button"
              onClick={copyFamilyUpdate}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ClipboardCopy className="h-4 w-4" aria-hidden />
              Copy family update
            </button>
            <button
              type="button"
              onClick={refreshRehabData}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="mr-1 inline h-4 w-4" aria-hidden />
              Reset data
            </button>
          </div>
        }
      />

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 ring-1 ring-amber-100">
        <p>
          <strong>Local mode:</strong> Data shown is local and intended for internal testing workflows.
        </p>
      </div>

      {sessionFormOpen ? (
        <Card className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">New rehab session</h2>
          {sessionSubmitMessage ? (
            <p className="mt-2 rounded-xl bg-emerald-50 p-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
              {sessionSubmitMessage}
            </p>
          ) : null}
          <form className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={addSession}>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Patient</span>
              <select
                value={form.patientId}
                onChange={(e) => onFormChange('patientId', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              >
                <option value="">Select patient</option>
                {patients.length ? (
                  patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.fullName || patient.name}
                    </option>
                  ))
                ) : null}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Session date</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => onFormChange('date', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            {[
              ['walkingDistance', 'Walking distance (m)'],
              ['transferAbility', 'Transfer ability (1-5)'],
              ['muscleStrength', 'Muscle strength (1-5)'],
              ['balance', 'Balance (1-5)'],
              ['speechRecovery', 'Speech recovery (1-5)'],
              ['adlIndependence', 'ADL independence (1-5)'],
              ['painScore', 'Pain score (0-10)'],
            ].map(([field, label]) => (
              <label key={field} className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={form[field]}
                  onChange={(e) => onFormChange(field, e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  required
                />
              </label>
            ))}

            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Wheelchair dependence</span>
              <select
                value={form.wheelchairDependence}
                onChange={(e) => onFormChange('wheelchairDependence', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {WHEELCHAIR_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Exercise participation</span>
              <select
                value={form.exerciseParticipation}
                onChange={(e) => onFormChange('exerciseParticipation', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {EXERCISE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Session notes</span>
              <textarea
                value={form.notes}
                onChange={(e) => onFormChange('notes', e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Mobility cues, tolerance, setbacks..."
              />
            </label>

            <div className="flex items-end sm:col-span-2 xl:col-span-4">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={isSubmittingSession}
              >
                <HandHeart className="h-4 w-4" aria-hidden />
                {isSubmittingSession ? 'Saving...' : 'Save rehab session'}
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {REHAB_STATUSES.map((status) => (
          <Card key={status} padding="p-4">
            <div className="text-sm font-semibold text-slate-600">{status}</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">{statusCounts[status] || 0}</div>
            <div className="mt-1 text-xs text-slate-500">Patients in this recovery status</div>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="text-sm sm:w-56">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Patient</span>
            <select
              value={selectedPatientId}
              onChange={(e) => {
                setSelectedPatientId(e.target.value)
                setReportSubjectId(e.target.value)
              }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All patients</option>
              {patientOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:w-56">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Rehab status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              {REHAB_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Weekly progress</h3>
            <Badge variant="teal">Rehab score</Badge>
          </div>
          <div className="h-64 w-full min-h-[16rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyProgress} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="rehabScore" name="Rehab score" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="sessions" name="Sessions" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Monthly progress</h3>
            <Badge variant="info">Trend by month</Badge>
          </div>
          <div className="h-64 w-full min-h-[16rem]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyProgress} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip />
                <Line type="monotone" dataKey="rehabScore" name="Rehab score" stroke="#0ea5e9" strokeWidth={2} dot />
                <Line type="monotone" dataKey="wheelchairRate" name="Wheelchair rate %" stroke="#f97316" strokeWidth={2} dot />
                <Line type="monotone" dataKey="pain" name="Avg pain" stroke="#6366f1" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">AI recovery trend</h3>
            <CalendarRange className="h-4 w-4 text-slate-500" aria-hidden />
          </div>
          <div className="h-64 w-full min-h-[16rem]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={aiRecoveryTrend}
                margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="x" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="rehabScore"
                  name="Actual score"
                  stroke="#14b8a6"
                  strokeWidth={2}
                  dot
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name="AI forecast"
                  stroke="#a855f7"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  connectNulls
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="mt-4 overflow-x-auto">
        <h3 className="text-lg font-semibold text-slate-900">Rehab session log</h3>
        <table className="mt-3 w-full min-w-[900px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="border-b border-slate-200 px-3 py-2">Date</th>
              <th className="border-b border-slate-200 px-3 py-2">Patient</th>
              <th className="border-b border-slate-200 px-3 py-2">Walking</th>
              <th className="border-b border-slate-200 px-3 py-2">Transfer</th>
              <th className="border-b border-slate-200 px-3 py-2">Strength</th>
              <th className="border-b border-slate-200 px-3 py-2">Balance</th>
              <th className="border-b border-slate-200 px-3 py-2">Speech</th>
              <th className="border-b border-slate-200 px-3 py-2">ADL</th>
              <th className="border-b border-slate-200 px-3 py-2">Pain</th>
              <th className="border-b border-slate-200 px-3 py-2">Wheelchair</th>
              <th className="border-b border-slate-200 px-3 py-2">Rehab status</th>
              <th className="border-b border-slate-200 px-3 py-2">Score</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-slate-600" colSpan={11}>
                  No sessions match this filter.
                </td>
              </tr>
            ) : null}
            {filteredSessions.map((session) => (
              <tr key={session.id} className="odd:bg-white even:bg-slate-50">
                <td className="border-b border-slate-100 px-3 py-2.5 text-slate-700">
                  {new Date(session.date).toLocaleDateString()}
                </td>
                <td className="border-b border-slate-100 px-3 py-2.5 text-slate-900">{session.patientName}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 text-slate-700">{session.walkingDistance}m</td>
                <td className="border-b border-slate-100 px-3 py-2.5 text-slate-700">{session.transferAbility}/5</td>
                <td className="border-b border-slate-100 px-3 py-2.5 text-slate-700">{session.muscleStrength}/5</td>
                <td className="border-b border-slate-100 px-3 py-2.5 text-slate-700">{session.balance}/5</td>
                <td className="border-b border-slate-100 px-3 py-2.5 text-slate-700">{session.speechRecovery}/5</td>
                <td className="border-b border-slate-100 px-3 py-2.5 text-slate-700">{session.adlIndependence}/5</td>
                <td className="border-b border-slate-100 px-3 py-2.5 text-slate-700">{session.painScore}/10</td>
                <td className="border-b border-slate-100 px-3 py-2.5 text-slate-700">
                  {session.wheelchairDependence ? 'Yes' : 'No'}
                </td>
                <td className="border-b border-slate-100 px-3 py-2.5">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${session.statusClass}`}>
                    {session.rehabStatus}
                  </span>
                </td>
                <td className="border-b border-slate-100 px-3 py-2.5 text-slate-900 font-semibold tabular-nums">{session.rehabScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">AI rehab summary</h3>
            <Badge variant="warning">AI analysis</Badge>
          </div>
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-semibold">Functional improvement:</span> {aiSummary.functionalImprovement}
            </p>
            <p>
              <span className="font-semibold">Risk factors:</span>{' '}
              {aiSummary.riskFactors.length === 0 ? 'No major risk flags' : aiSummary.riskFactors.join('; ')}
            </p>
            <p>
              <span className="font-semibold">Suggested rehab focus:</span> {aiSummary.suggestedRehabFocus}
            </p>
            <div>
              <p className="font-semibold">Therapist recommendations:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
                {aiSummary.therapistRecommendations.map((rec) => (
                  <li key={rec}>{rec}</li>
                ))}
              </ul>
            </div>
            <p>
              <span className="font-semibold">Family encouragement suggestions:</span> {aiSummary.familyEncouragement}
            </p>
            <p className="text-xs text-slate-500">
              Status: <span className="font-semibold">{aiSummary.status}</span>
            </p>
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-slate-900">Generated report preview</h3>
          <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            {reportText || 'Generate AI rehab report to fill this area.'}
          </pre>
        </Card>
      </div>

      <style>
        {`
          @media print {
            .no-print,
            .print-hide {
              display: none !important;
            }
          }
        `}
      </style>
    </div>
  )
}
