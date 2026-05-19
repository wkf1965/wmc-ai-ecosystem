import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck, FileText, Printer, RefreshCw } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import { analyzeAllPatientsFromNotes, scoreToLevel } from '../lib/aiRiskDetection.js'
import { aiAlerts, rehabPrograms } from '../data/dummyData'

const shiftOptions = [
  { key: 'morning', label: 'Morning', note: 'Day' },
  { key: 'evening', label: 'Evening', note: 'Evening' },
  { key: 'night', label: 'Night', note: 'Night' },
]

const supervisorNotesStorageKey = 'wmc-ai-supervisor-notes'

function normalizeShift(value) {
  const lowered = String(value || '').toLowerCase()
  if (lowered.includes('even')) return 'evening'
  if (lowered.includes('night')) return 'night'
  return 'morning'
}

function splitMeds(rawValue = '') {
  return String(rawValue)
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function buildFollowUpItems(patientName, analyses) {
  const items = []
  const high = []
  const caution = []

  for (const category of analyses.categories || []) {
    const { id, label, score, escalation, escalationAlert } = category
    if (score >= 60 || escalation || escalationAlert) {
      high.push(`${label} risk detected`)
    } else if (score >= 35) {
      caution.push(`${label} risk rising`)
    }
  }

  if (high.length > 0) {
    items.push(`Immediate review requested for ${patientName}: ${high.slice(0, 2).join(', ')}`)
  }
  if (caution.length > 0) {
    items.push(`Early intervention required for ${patientName}: ${caution.slice(0, 2).join(', ')}`)
  }
  if (items.length === 0) {
    items.push(`Reassess routine progress for ${patientName} during next rounds.`)
  }

  return items
}

function buildEscalationRows(alerts) {
  return alerts.map((alert) => ({
    ...alert,
    label: `${alert.category} - ${alert.title}`,
    tag: scoreToLevel(alert.severity === 'critical' ? 85 : alert.severity === 'high' ? 65 : alert.severity === 'medium' ? 45 : 20).label,
  }))
}

function createReport(payload) {
  const lines = []
  const { shiftLabel, generatedAt, criticalPatients, pendingFollowUps, medications, escalations, rehabRows, supervisorNotes } = payload

  lines.push('AI Shift Handover Summary')
  lines.push(`Shift: ${shiftLabel}`)
  lines.push(`Generated: ${generatedAt}`)
  lines.push('')

  lines.push('Critical Patients')
  if (criticalPatients.length === 0) {
    lines.push('- None flagged as critical during this shift.')
  } else {
    for (const item of criticalPatients) {
      const riskLabel = scoreToLevel(item.overallScore).label
      lines.push(`- ${item.patientName} — ${riskLabel} (score ${item.overallScore})`)
    }
  }
  lines.push('')

  lines.push('Pending Follow-up')
  if (pendingFollowUps.length === 0) {
    lines.push('- No unresolved follow-up flagged.')
  } else {
    for (const action of pendingFollowUps) {
      lines.push(`- ${action}`)
    }
  }
  lines.push('')

  lines.push('Medication Reminders')
  if (medications.length === 0) {
    lines.push('- No active medication reminders.')
  } else {
    for (const med of medications) {
      lines.push(`- ${med.patient}: ${med.medication}`)
    }
  }
  lines.push('')

  lines.push('AI Escalations')
  if (escalations.length === 0) {
    lines.push('- None pending at this time.')
  } else {
    for (const row of escalations) {
      lines.push(`- ${row.patientName}: ${row.label} [${row.severity || row.tag}]`)
    }
  }
  lines.push('')

  lines.push('Rehabilitation Updates')
  if (rehabRows.length === 0) {
    lines.push('- No rehabilitation updates captured.')
  } else {
    for (const row of rehabRows) {
      const next = row.nextMilestone ? `Next: ${row.nextMilestone}` : 'Next milestone: monitoring'
      lines.push(`- ${row.patientName}: ${row.statusText}; ${next}`)
    }
  }
  lines.push('')

  lines.push('Supervisor Notes')
  if (supervisorNotes.trim()) {
    lines.push(supervisorNotes)
  } else {
    lines.push('- No supervisor notes added yet.')
  }

  return lines.join('\n')
}

export default function ShiftHandoverPage() {
  const { patients, getById } = usePatients()
  const { notes } = useNursingNotes()
  const [shift, setShift] = useState('morning')
  const [supervisorNotes, setSupervisorNotes] = useState('')
  const [handoverText, setHandoverText] = useState('')
  const [status, setStatus] = useState('Select a shift and generate the handover.')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem(supervisorNotesStorageKey)
    if (saved) setSupervisorNotes(saved)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(supervisorNotesStorageKey, supervisorNotes)
  }, [supervisorNotes])

  const shiftLabel = useMemo(() => shiftOptions.find((item) => item.key === shift)?.label || 'Morning', [shift])
  const shiftNoteLabel = useMemo(() => shiftOptions.find((item) => item.key === shift)?.note || 'Day', [shift])

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => normalizeShift(note.shift) === shift)
  }, [notes, shift])

  const analyses = useMemo(() => analyzeAllPatientsFromNotes(patients, filteredNotes, getById), [patients, filteredNotes, getById])

  const criticalPatients = useMemo(() => {
    return analyses
      .filter((entry) => entry.overallScore >= 55 || entry.anyEscalation)
      .filter((entry) => entry.patientName !== 'Unknown')
      .sort((a, b) => b.overallScore - a.overallScore)
  }, [analyses])

  const medicationReminders = useMemo(() => {
    return patients.flatMap((patient) => {
      const meds = splitMeds(patient.currentMedications)
      return meds.map((medication) => ({ patient: patient.fullName || 'Unknown patient', medication }))
    })
  }, [patients])

  const pendingFollowUps = useMemo(() => {
    const actions = []
    for (const entry of criticalPatients) {
      const sourcePatient = getById(entry.patientId)
      actions.push(...buildFollowUpItems(sourcePatient?.fullName || entry.patientName, entry))
    }
    return actions
  }, [criticalPatients, getById])

  const aiEscalationRows = useMemo(() => {
    const rows = aiAlerts.filter((alert) => alert.status !== 'resolved')
    return buildEscalationRows(rows)
  }, [])

  const rehabilitationRows = useMemo(() => {
    return rehabPrograms.map((entry) => {
      const nextMilestone = entry.milestones.find((item) => !item.done)
      const latest = entry.primaryGoal || 'Goal not provided'
      return {
        patientName: entry.patientName,
        statusText: `Goal: ${latest}`,
        nextMilestone: nextMilestone ? `${nextMilestone.label} due` : null,
      }
    })
  }, [])

  const handoverCards = useMemo(() => {
    return [
      {
        title: 'Critical Patients',
        body: criticalPatients,
        badge: `${criticalPatients.length} priority`,
      },
      {
        title: 'Pending Follow-up',
        body: pendingFollowUps,
        badge: `${pendingFollowUps.length} action`,
      },
      {
        title: 'Medication Reminders',
        body: medicationReminders,
        badge: `${medicationReminders.length} meds`,
      },
      {
        title: 'AI Escalations',
        body: aiEscalationRows,
        badge: `${aiEscalationRows.length} open`,
      },
    ]
  }, [criticalPatients, pendingFollowUps, medicationReminders, aiEscalationRows])

  function generateSummary() {
    const generated = createReport({
      shiftLabel,
      generatedAt: new Date().toLocaleString(),
      criticalPatients,
      pendingFollowUps,
      medications: medicationReminders,
      escalations: aiEscalationRows,
      rehabRows: rehabilitationRows,
      supervisorNotes,
    })
    setHandoverText(generated)
    setStatus('AI-generated handover report created in simulation mode.')
  }

  function printReport() {
    window.print()
  }

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-root {
            margin: 0;
            padding: 0;
            background: #fff;
          }
          .print-panel {
            border: 1px solid #94a3b8 !important;
            break-inside: avoid;
          }
          .print-copy {
            color: #0f172a;
          }
        }
      `}</style>

      <PageHeader
        title="AI Shift Handover Summary"
        description={`Generate a shift-specific handover report for ${shiftLabel}. Simulation mode only.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generateSummary}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              <ClipboardCheck className="h-4 w-4" aria-hidden />
              Generate AI Summary
            </button>
            <button
              type="button"
              onClick={printReport}
              disabled={!handoverText}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" aria-hidden />
              Print report
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh data
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 no-print">
        {shiftOptions.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setShift(item.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              shift === item.key ? 'bg-teal-600 text-white' : 'border border-slate-200 bg-white text-slate-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-slate-600 no-print">{status}</p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {handoverCards.map((card) => (
          <Card key={card.title} padding="p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-500">{card.title}</h3>
              <Badge>{card.badge}</Badge>
            </div>
            <p className="mt-2 text-xl font-bold text-slate-900">
              {Array.isArray(card.body) ? card.body.length : 0}
            </p>
          </Card>
        ))}
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="print-panel">
          <h2 className="text-lg font-semibold text-slate-900">Critical Patients</h2>
          <div className="mt-4 space-y-3">
            {criticalPatients.length === 0 ? <p className="text-sm text-slate-600">No critical patients for this shift.</p> : null}
            {criticalPatients.map((item) => (
              <div key={item.patientId} className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-sm font-semibold text-slate-900">
                  {item.patientName}
                  <Badge className="ml-2" variant="danger">
                    {scoreToLevel(item.overallScore).label}
                  </Badge>
                </p>
                <p className="mt-1 text-xs text-slate-600">Score {item.overallScore}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="print-panel">
          <h2 className="text-lg font-semibold text-slate-900">Pending Follow-up</h2>
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            {pendingFollowUps.length === 0 ? <p>No follow-up tasks currently pending.</p> : null}
            {pendingFollowUps.map((item) => (
              <p key={item} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                {item}
              </p>
            ))}
          </div>
        </Card>

        <Card className="print-panel">
          <h2 className="text-lg font-semibold text-slate-900">Medication Reminders</h2>
          <div className="mt-4 space-y-2">
            {medicationReminders.length === 0 ? <p className="text-sm text-slate-600">No reminders for active med lists.</p> : null}
            {medicationReminders.map((entry, index) => (
              <p key={`${entry.patient}-${entry.medication}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                <span className="font-semibold">{entry.patient}</span>: {entry.medication}
              </p>
            ))}
          </div>
        </Card>

        <Card className="print-panel">
          <h2 className="text-lg font-semibold text-slate-900">AI Escalations</h2>
          <div className="mt-4 space-y-2">
            {aiEscalationRows.length === 0 ? <p className="text-sm text-slate-600">No active AI escalations.</p> : null}
            {aiEscalationRows.map((row) => (
              <p key={row.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                <span className="font-semibold">{row.patientName}</span> · {row.label}
                <span className="ml-2 inline-flex items-center gap-2">
                  <Badge variant={row.severity === 'critical' ? 'danger' : row.severity === 'high' ? 'warning' : 'info'}>
                    {row.severity}
                  </Badge>
                </span>
              </p>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="print-panel">
          <h2 className="text-lg font-semibold text-slate-900">Rehabilitation Updates</h2>
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            {rehabilitationRows.length === 0 ? <p>No rehab updates available.</p> : null}
            {rehabilitationRows.map((row, index) => (
              <p key={`${row.patientName}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="font-semibold">{row.patientName}</span>: {row.statusText}
              </p>
            ))}
          </div>
        </Card>

        <Card className="print-panel">
          <h2 className="text-lg font-semibold text-slate-900">Supervisor Notes</h2>
          <p className="mb-2 mt-3 text-xs uppercase tracking-wide text-slate-500">Simulation notes</p>
          <textarea
            value={supervisorNotes}
            onChange={(event) => setSupervisorNotes(event.target.value)}
            placeholder="Add brief supervisor handover notes..."
            className="h-28 w-full rounded-lg border border-slate-200 p-2 text-sm outline-none ring-1 ring-transparent transition focus:border-teal-400 focus:ring-teal-200"
          />
        </Card>
      </section>

      <Card className="mt-4 print-root print-panel">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Simulated AI-generated handover report</h2>
            <p className="text-sm text-slate-600">This report is generated locally in simulation mode.</p>
          </div>
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden />
            Simulation mode
          </span>
        </div>
        <pre className="max-h-[420px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 print-copy whitespace-pre-wrap">
          {handoverText || 'Generate the AI summary to see a printable shift report.'}
        </pre>
      </Card>
    </div>
  )
}
