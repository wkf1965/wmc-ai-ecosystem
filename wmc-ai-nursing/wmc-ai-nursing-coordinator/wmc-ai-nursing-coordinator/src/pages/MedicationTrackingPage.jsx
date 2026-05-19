import { useEffect, useMemo, useState } from 'react'
import { FileText, History, Printer, RefreshCw, Search, BellRing } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import { saveMedicationUpdate } from '../lib/googleSheetSync.js'

const MEDICATION_STORAGE_KEY = 'wmc_medication_tracking_v1'
const MED_STATUS = ['Pending', 'Given', 'Missed', 'Delayed']
const statusStyles = {
  Pending: 'bg-slate-100 text-slate-700 border-slate-200',
  Given: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Missed: 'bg-red-100 text-red-700 border-red-200',
  Delayed: 'bg-orange-100 text-orange-700 border-orange-200',
}

const roomSeedMap = {
  p1: '302A',
  p2: '318C',
  p3: '214B',
  p4: '221D',
  p5: '305A',
}

const seedByPatient = {
  p1: [
    { medicationName: 'Furosemide', dosage: '20 mg', frequency: 'PO once daily', timeDue: '08:00', nurseInCharge: 'R.N. Patel', status: 'Pending' },
    { medicationName: 'Lisinopril', dosage: '10 mg', frequency: 'PO every morning', timeDue: '09:00', nurseInCharge: 'R.N. Patel', status: 'Pending' },
  ],
  p2: [
    { medicationName: 'Enoxaparin', dosage: '40 mg', frequency: 'SC at 21:00', timeDue: '21:00', nurseInCharge: 'LPN Santos', status: 'Pending' },
    { medicationName: 'Acetaminophen', dosage: '650 mg', frequency: 'PRN pain', timeDue: '10:00', nurseInCharge: 'LPN Santos', status: 'Pending' },
  ],
  p3: [
    { medicationName: 'Carbidopa-Levodopa', dosage: '25/100 mg', frequency: 'PO TID', timeDue: '07:30', nurseInCharge: 'R.N. Kim', status: 'Pending' },
    { medicationName: 'Levothyroxine', dosage: '50 mcg', frequency: 'PO every morning', timeDue: '07:00', nurseInCharge: 'R.N. Kim', status: 'Pending' },
  ],
  p4: [
    { medicationName: 'Prednisone', dosage: '10 mg', frequency: 'PO daily', timeDue: '07:45', nurseInCharge: 'R.N. Nguyen', status: 'Pending' },
    { medicationName: 'Insulin lispro', dosage: 'per sliding scale', frequency: 'TID', timeDue: '18:00', nurseInCharge: 'R.N. Nguyen', status: 'Pending' },
  ],
  p5: [
    { medicationName: 'Sertraline', dosage: '50 mg', frequency: 'PO every morning', timeDue: '08:15', nurseInCharge: 'LPN Santos', status: 'Pending' },
    { medicationName: 'Tramadol', dosage: '50 mg', frequency: 'PO q6h PRN', timeDue: '20:00', nurseInCharge: 'LPN Santos', status: 'Pending' },
  ],
}

const highRiskMedications = [
  'insulin',
  'warfarin',
  'heparin',
  'morphine',
  'oxycodone',
  'fentanyl',
  'clopidogrel',
  'amlodipine',
  'diltiazem',
]

function toMinutes(timeText) {
  const raw = String(timeText || '').trim()
  if (!raw) return null
  const m = raw.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null
  return h * 60 + mm
}

function statusFromDueTime(timeDue, nowMinutes) {
  const minutes = toMinutes(timeDue)
  if (minutes === null) return null
  const delta = nowMinutes - minutes
  if (delta >= -30 && delta <= 10) return 'due'
  if (delta > 10) return 'late'
  return 'upcoming'
}

function roomForPatient(id, fallbackIndex = 1) {
  if (!id) return `TBD-${fallbackIndex}`
  return roomSeedMap[id] || `TBD-${String(fallbackIndex).padStart(3, '0')}`
}

function hasHighRiskMedication(name) {
  const text = String(name || '').toLowerCase()
  return highRiskMedications.some((token) => text.includes(token))
}

function parseNoteValue(text, pattern) {
  const match = String(text || '').match(pattern)
  if (!match) return null
  return Number(match[1])
}

function hasAbnormalVitals(note) {
  if (!note) return false
  const bp = parseNoteValue(note.bloodPressure, /(\d{2,3})\s*\/\s*(\d{2,3})/)
  if (bp && (!Number.isFinite(bp) ? false : (bp < 90 || bp > 180))) return true

  const temp = parseNoteValue(
    note.nurseRemarks || note.abnormalEvents || note.appetite || note.mood || '',
    /\b(?:temp(?:erature)?\s*[:\-]?\s*)(\d{2,3}(?:\.\d)?)/i,
  )
  if (temp && (temp >= 38 || temp <= 35.5)) return true

  const oxy = parseNoteValue(
    note.nurseRemarks || note.abnormalEvents || '',
    /\bspo2\s*[:\-]?\s*(\d{2,3})/i,
  )
  if (oxy && oxy <= 92) return true

  const glucose = parseNoteValue(
    note.bloodSugar || note.nurseRemarks || '',
    /(\d{2,3})\s*(?:mg\/dL)?/i,
  )
  if (glucose && (glucose >= 300 || glucose <= 60)) return true

  return ['desat', 'hypoxia', 'tachy', 'chills', 'cough', 'confusion'].some((term) =>
    String(note.abnormalEvents || note.nurseRemarks || note.mood || '').toLowerCase().includes(term),
  )
}

function normalizeEntries(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((row) => row && row.id && row.patientId)
    .map((row) => ({
      ...row,
      status: MED_STATUS.includes(row.status) ? row.status : 'Pending',
      delayCount: Number.isFinite(row.delayCount) ? row.delayCount : 0,
      escalation: row.escalation || 'none',
      statusHistory: Array.isArray(row.statusHistory) ? row.statusHistory : [],
    }))
}

function seedMedicationsForPatients(patients) {
  const now = new Date().toISOString()
  const list = []
  if (!patients?.length) {
    return []
  }

  patients.forEach((patient, index) => {
    const seedRows = seedByPatient[patient.id] || [
      {
        medicationName: 'Acetaminophen',
        dosage: '500 mg',
        frequency: 'PO q6h',
        timeDue: '09:00',
        nurseInCharge: patient.assignedNurse || 'R.N. team',
        status: 'Pending',
      },
    ]
    for (const row of seedRows) {
      list.push({
        id: cryptoId(),
        patientId: patient.id,
        patientNameSnapshot: patient.fullName,
        room: roomForPatient(patient.id, index + 1),
        medicationName: row.medicationName,
        dosage: row.dosage,
        frequency: row.frequency,
        timeDue: row.timeDue,
        status: row.status,
        nurseInCharge: row.nurseInCharge,
        notes: '',
        statusHistory: [
          { status: row.status, at: now, actor: 'system', note: 'seeded from module setup' },
        ],
        delayCount: 0,
        escalation: 'none',
      })
    }
  })

  return list
}

function cryptoId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `med_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function readMedicationRecords() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(MEDICATION_STORAGE_KEY)
    const data = raw ? JSON.parse(raw) : null
    if (!Array.isArray(data)) return null
    return normalizeEntries(data)
  } catch {
    return null
  }
}

function writeMedicationRecords(list) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(MEDICATION_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore localStorage failures in simulation mode
  }
}

function getLatestNotesByPatient(notes) {
  const grouped = {}
  for (const note of notes) {
    if (!note?.patientId) continue
    if (!grouped[note.patientId]) grouped[note.patientId] = []
    grouped[note.patientId].push(note)
  }
  for (const patientId of Object.keys(grouped)) {
    grouped[patientId].sort((a, b) => {
      const da = a.date || ''
      const db = b.date || ''
      if (da !== db) return db.localeCompare(da)
      return (b.createdAt || '').localeCompare(a.createdAt || '')
    })
  }
  return grouped
}

function buildReportText(rows, alerts, nowLabel) {
  const lines = [
    'Medication Tracking Report',
    `Generated: ${new Date().toLocaleString()}`,
    `Generated on: ${nowLabel || 'Simulation mode report'}`,
    '',
    `Total medications: ${rows.length}`,
    `Due now: ${rows.filter((row) => row.dynamicDueStatus === 'due' && row.status === 'Pending').length}`,
    `Missed: ${rows.filter((row) => row.status === 'Missed').length}`,
    `Delayed: ${rows.filter((row) => row.status === 'Delayed').length}`,
    `Completed today: ${rows.filter((row) => row.status === 'Given').length}`,
    '',
    'AI Alerts:',
  ]

  if (alerts.length === 0) {
    lines.push('No active AI alerts in current simulation window.')
  } else {
    alerts.forEach((alert, idx) => {
      lines.push(`${idx + 1}. ${alert.type}: ${alert.message}`)
    })
  }

  lines.push('', 'Medication details:', '')
  for (const row of rows) {
    lines.push(
      `${row.patientNameSnapshot} | Room ${row.room} | ${row.medicationName} ${row.dosage} | ${row.frequency} | due ${row.timeDue} | ${row.status} | nurse ${row.nurseInCharge}`,
    )
    if (row.notes) {
      lines.push(`  Notes: ${row.notes}`)
    }
  }

  return lines.join('\n')
}

export default function MedicationTrackingPage() {
  const { patients } = usePatients()
  const { notes } = useNursingNotes()
  const [records, setRecords] = useState(() => {
    const cached = readMedicationRecords()
    if (cached && cached.length > 0) return cached
    return seedMedicationsForPatients(patients)
  })
  const [selectedPatient, setSelectedPatient] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [summaryText, setSummaryText] = useState('')
  const [reportText, setReportText] = useState('')
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitKind, setSubmitKind] = useState('success')

  useEffect(() => {
    if (!patients.length) return
    const byPatient = {}
    for (const row of records) {
      if (!byPatient[row.patientId]) byPatient[row.patientId] = []
      byPatient[row.patientId].push(row)
    }

    let changed = false
    const next = [...records]
    const present = new Set(records.map((row) => row.patientId))

    for (const patient of patients) {
      if (present.has(patient.id)) continue
      const seedRows = seedByPatient[patient.id] || [
        {
          medicationName: 'Acetaminophen',
          dosage: '500 mg',
          frequency: 'PO q6h',
          timeDue: '09:00',
          nurseInCharge: patient.assignedNurse || 'R.N. team',
        },
      ]
      for (const seed of seedRows) {
        next.push({
          id: cryptoId(),
          patientId: patient.id,
          patientNameSnapshot: patient.fullName,
          room: roomForPatient(patient.id, next.length + 1),
          medicationName: seed.medicationName,
          dosage: seed.dosage,
          frequency: seed.frequency,
          timeDue: seed.timeDue,
          status: 'Pending',
          nurseInCharge: seed.nurseInCharge,
          notes: '',
          statusHistory: [{ status: 'Pending', at: new Date().toISOString(), actor: 'system', note: 'added after roster sync' }],
          delayCount: 0,
          escalation: 'none',
        })
        changed = true
      }
    }

    if (changed) {
      setRecords(next)
    }
  }, [patients])

  useEffect(() => {
    writeMedicationRecords(records)
  }, [records])

  const notesByPatient = useMemo(() => getLatestNotesByPatient(notes), [notes])

  const rows = useMemo(() => {
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

    return records
      .map((row) => {
        const latest = notesByPatient[row.patientId]?.[0]
        const patient = patients.find((p) => p.id === row.patientId)
        const room = roomForPatient(row.patientId, row.patientId ? 1 : 999)
        const dynamicDueStatus = statusFromDueTime(row.timeDue, nowMinutes)
        const repeatedDelay = (row.statusHistory || []).filter((item) => item.status === 'Delayed').length >= 2
        const abnormalVitals = hasAbnormalVitals(latest)
        const isHighRisk = hasHighRiskMedication(row.medicationName)

        const alerts = []
        if (row.status === 'Missed') {
          alerts.push('missed medication')
        }
        if (repeatedDelay) {
          alerts.push('repeated delay')
        }
        if (isHighRisk) {
          alerts.push('high-risk medication')
        }
        if (abnormalVitals && (row.status === 'Missed' || row.status === 'Delayed')) {
          alerts.push('medication + abnormal vitals concern')
        }

        return {
          ...row,
          patientName: patient?.fullName || row.patientNameSnapshot || 'Unknown patient',
          room: room,
          dynamicDueStatus,
          assignedNurse: row.nurseInCharge || patient?.assignedNurse || 'Unassigned',
          alerts,
          latestNoteSnippet: latest ? `${latest.nurseRemarks || latest.abnormalEvents || latest.appetite || 'No latest note detail.'}` : 'No note yet',
          patient,
          normalizedRiskText: alerts.length ? alerts.join(', ') : '',
        }
      })
      .filter((row) => {
        const patientMatch = selectedPatient === 'all' || row.patientId === selectedPatient
        const searchMatch =
          !searchTerm ||
          `${row.patientName} ${row.medicationName} ${row.dosage} ${row.room} ${row.nurseInCharge}`.toLowerCase().includes(searchTerm.toLowerCase())
        return patientMatch && searchMatch
      })
  }, [records, patients, notesByPatient, selectedPatient, searchTerm])

  const statusCards = useMemo(() => {
    const dueNow = rows.filter((row) => row.dynamicDueStatus === 'due' && row.status !== 'Given').length
    const missed = rows.filter((row) => row.status === 'Missed').length
    const delayed = rows.filter((row) => row.status === 'Delayed').length
    const completed = rows.filter((row) => row.status === 'Given').length
    const allPending = rows.filter((row) => row.status === 'Pending')
    return { dueNow, missed, delayed, completed, allPending: allPending.length }
  }, [rows])

  const aiAlerts = useMemo(() => {
    const map = new Map()

    for (const row of rows) {
      for (const reason of row.alerts) {
        const key = `${row.id}-${reason}`
        if (!map.has(key)) {
          map.set(key, {
            type: reason,
            patientName: row.patientName,
            room: row.room,
            message: `${row.patientName} (${row.room}) ${row.medicationName} — ${reason}.`,
            rowId: row.id,
            severity: reason === 'high-risk medication' ? 'red' : reason === 'medication + abnormal vitals concern' ? 'red' : 'orange',
          })
        }
      }
    }

    return Array.from(map.values())
  }, [rows])

  const patientOptions = useMemo(() => {
    const known = new Map(records.map((row) => [row.patientId, row.patientNameSnapshot]))
    return Array.from(new Set(records.map((row) => row.patientId)))
      .map((patientId) => ({
        id: patientId,
        label: known.get(patientId) || 'Unknown',
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [records])

  function showMedicationMessage(message, kind = 'success') {
    setSubmitKind(kind)
    setSubmitMessage(message)
    if (!message) return
    window.setTimeout(() => {
      setSubmitMessage('')
    }, 2200)
  }

  function markStatus(id, status) {
    let nextRecord = null
    setRecords((current) =>
      current.map((row) => {
        if (row.id !== id) return row
        const nextHistory = Array.isArray(row.statusHistory) ? [...row.statusHistory] : []
        nextHistory.push({
          status,
          at: new Date().toISOString(),
          actor: 'Simulation nurse',
          note: `${status} from module action`,
        })
        const nextDelayCount =
          status === 'Delayed' ? (Number.isFinite(row.delayCount) ? row.delayCount + 1 : 1) : row.delayCount || 0
        const updated = { ...row, status, delayCount: nextDelayCount, statusHistory: nextHistory }
        nextRecord = updated
        return updated
      }),
    )
    if (!nextRecord) return
    saveMedicationUpdate(nextRecord)
      .then((result) => {
        if (result?.googleSheetSyncStatus === 'failed') {
          showMedicationMessage(result?.googleSheetSyncMessage || 'Failed to sync medication status.', 'error')
          return
        }
        showMedicationMessage('Saved to Google Sheet database', 'success')
      })
      .catch(() => {
        showMedicationMessage('Failed to sync medication status.', 'error')
      })
  }

  function addMedicationNote(id) {
    const noteText = window.prompt('Add medication note')
    if (!noteText || !noteText.trim()) return
    let nextRecord = null
    const nowLabel = new Date().toLocaleString()
    setRecords((current) =>
      current.map((row) => {
        if (row.id !== id) return row
        const stamped = `${nowLabel} — ${noteText.trim()}`
        const updated = { ...row, notes: row.notes ? `${row.notes}\n${stamped}` : stamped }
        nextRecord = updated
        return updated
      }),
    )
    if (!nextRecord) return
    saveMedicationUpdate(nextRecord)
      .then((result) => {
        if (result?.googleSheetSyncStatus === 'failed') {
          showMedicationMessage(result?.googleSheetSyncMessage || 'Failed to sync medication note.', 'error')
          return
        }
        showMedicationMessage('Saved to Google Sheet database', 'success')
      })
      .catch(() => {
        showMedicationMessage('Failed to sync medication note.', 'error')
      })
  }

  function escalateViaWhatsApp(row) {
    setRecords((current) =>
      current.map((item) =>
        item.id === row.id
          ? {
              ...item,
              escalation: 'doctor_and_supervisor',
            }
          : item,
      ),
    )
    window.alert(`Simulated WhatsApp sent to doctor + supervisor for ${row.patientName} medication ${row.medicationName}`)
  }

  function generateReport() {
    const nowLabel = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
    const text = buildReportText(rows, aiAlerts, nowLabel)
    setSummaryText(text)
    setReportText(text)
    return text
  }

  function copyReport() {
    const text = summaryText || generateReport()
    navigator.clipboard.writeText(text)
  }

  function handlePrint() {
    const text = generateReport()
    setSummaryText(text)
    setTimeout(() => window.print(), 20)
  }

  return (
    <div>
      <PageHeader
        title="Medication Tracking"
        description="Simulation-only medication administration and adherence dashboard with AI medication-safety triggers."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRecords((current) => [...current])}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh data
            </button>
            <button
              type="button"
              onClick={() => generateReport()}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <History className="mr-2 inline h-4 w-4" aria-hidden />
              Generate medication report
            </button>
            <button
              type="button"
              onClick={() => copyReport()}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Copy report
            </button>
            <button
              type="button"
              onClick={() => handlePrint()}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Printer className="mr-2 inline h-4 w-4" aria-hidden />
              Print report
            </button>
          </div>
        }
      />
      {submitMessage ? (
        <p
          className={`mb-4 rounded-xl px-3 py-2 text-sm ${
            submitKind === 'error'
              ? 'bg-red-50 text-red-800 ring-1 ring-red-100'
              : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'
          }`}
        >
          {submitMessage}
        </p>
      ) : null}

      <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 ring-1 ring-amber-100">
        <p>
          <strong>Simulation mode:</strong> All medication actions and WhatsApp escalations are local to this demo environment.
        </p>
      </section>

      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card padding="p-4">
          <div className="text-sm font-semibold text-slate-600">Due now</div>
          <div className="mt-2 text-3xl font-bold text-orange-700">{statusCards.dueNow}</div>
          <div className="mt-1 text-xs text-slate-500">Within +/-10 minutes of due time</div>
        </Card>
        <Card padding="p-4">
          <div className="text-sm font-semibold text-slate-600">Missed medication</div>
          <div className="mt-2 text-3xl font-bold text-red-700">{statusCards.missed}</div>
        </Card>
        <Card padding="p-4">
          <div className="text-sm font-semibold text-slate-600">Delayed</div>
          <div className="mt-2 text-3xl font-bold text-orange-700">{statusCards.delayed}</div>
        </Card>
        <Card padding="p-4">
          <div className="text-sm font-semibold text-slate-600">Completed today</div>
          <div className="mt-2 text-3xl font-bold text-emerald-700">{statusCards.completed}</div>
        </Card>
        <Card padding="p-4">
          <div className="text-sm font-semibold text-slate-600">Pending</div>
          <div className="mt-2 text-3xl font-bold text-slate-700">{statusCards.allPending}</div>
        </Card>
      </section>

      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <label htmlFor="med-patient-filter" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Patient
            </label>
            <select
              id="med-patient-filter"
              value={selectedPatient}
              onChange={(e) => setSelectedPatient(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All patients</option>
              {patientOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="med-search" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
              <input
                id="med-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"
                placeholder="Patient, room, med, nurse"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Medication administration queue</h2>
        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="border-b border-slate-200 px-3 py-2">Patient</th>
              <th className="border-b border-slate-200 px-3 py-2">Room</th>
              <th className="border-b border-slate-200 px-3 py-2">Medication name</th>
              <th className="border-b border-slate-200 px-3 py-2">Dosage</th>
              <th className="border-b border-slate-200 px-3 py-2">Frequency</th>
              <th className="border-b border-slate-200 px-3 py-2">Time due</th>
              <th className="border-b border-slate-200 px-3 py-2">Given / Missed / Delayed</th>
              <th className="border-b border-slate-200 px-3 py-2">Nurse in charge</th>
              <th className="border-b border-slate-200 px-3 py-2">Notes</th>
              <th className="border-b border-slate-200 px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-slate-600" colSpan="10">
                  No medication entries match this filter.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="odd:bg-white even:bg-slate-50">
                <td className="border-b border-slate-100 px-3 py-3 text-slate-900">{row.patientName}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-slate-700">{row.room}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-slate-900">{row.medicationName}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-slate-700">{row.dosage}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-slate-700">{row.frequency}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-slate-700">
                  <div className="flex flex-col">
                    <span>{row.timeDue}</span>
                    <span className={`mt-1 inline-flex w-fit rounded-full border px-2 py-1 text-xs ${row.status === 'Pending' && row.dynamicDueStatus === 'due' ? 'bg-orange-50 text-orange-900 border-orange-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {row.dynamicDueStatus || 'scheduled'}
                    </span>
                  </div>
                </td>
                <td className="border-b border-slate-100 px-3 py-3">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusStyles[row.status]}`}>
                    {row.status}
                  </span>
                </td>
                <td className="border-b border-slate-100 px-3 py-3 text-slate-700">{row.assignedNurse}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-xs text-slate-700">
                  <div className="max-w-[220px] leading-relaxed">{row.notes || row.latestNoteSnippet}</div>
                </td>
                <td className="border-b border-slate-100 px-3 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => markStatus(row.id, 'Given')}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      Mark as given
                    </button>
                    <button
                      type="button"
                      onClick={() => markStatus(row.id, 'Missed')}
                      className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                    >
                      Mark as missed
                    </button>
                    <button
                      type="button"
                      onClick={() => addMedicationNote(row.id)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Add medication note
                    </button>
                    <button
                      type="button"
                      onClick={() => escalateViaWhatsApp(row)}
                      className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100"
                    >
                      Simulate WhatsApp to doctor/supervisor
                    </button>
                  </div>
                  {row.escalation === 'doctor_and_supervisor' ? (
                    <p className="mt-2 text-[11px] text-cyan-700">
                      Escalated to doctor + supervisor in simulation.
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="flex items-start gap-2">
            <BellRing className="mt-1 h-5 w-5 text-red-700" aria-hidden />
            <div>
              <h3 className="text-lg font-semibold text-slate-900">AI medication alerts</h3>
              <p className="mt-1 text-xs text-slate-600">Simulation alerts based on medication and vitals patterns.</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {aiAlerts.length === 0 ? (
              <p className="text-sm text-slate-600">No active medication AI alerts.</p>
            ) : null}
            {aiAlerts.map((alert) => (
              <div key={`${alert.rowId}-${alert.type}`} className="rounded-lg border border-red-100 bg-red-50 p-2">
                <p className="text-sm font-semibold text-red-800">{alert.type}</p>
                <p className="text-xs text-slate-700">{alert.message}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-2">
            <FileText className="mt-1 h-5 w-5 text-slate-700" aria-hidden />
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Medication report</h3>
              <p className="mt-1 text-xs text-slate-600">Current simulation summary for print/share.</p>
            </div>
          </div>
          <pre className="mt-4 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            {reportText || 'Generate medication report to populate this panel.'}
          </pre>
        </Card>
      </section>

      <style>{`
        @media print {
          @page {
            margin: 10mm;
          }
          body * {
            visibility: hidden;
          }
          .print-only,
          .print-only * {
            visibility: visible;
          }
          .print-only {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
      <div className="print-only hidden">
        <h1 className="text-xl font-bold">Medication Tracking Report</h1>
        <p className="text-sm text-slate-600">Simulation mode printout</p>
        <pre className="mt-4 whitespace-pre-wrap text-sm">{summaryText || generateReport()}</pre>
      </div>
    </div>
  )
}
