import { useMemo, useState } from 'react'
import { Smartphone, Thermometer, Send, UserCircle2, X } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import { analyzePatientNotes, analyzeAllPatientsFromNotes, scoreToLevel } from '../lib/aiRiskDetection.js'
import { recommendedActionFromAnalysis } from '../lib/telegramNurseIntegration.js'
import { formToNursingNotePayload } from '../db/nursingNoteSchema.js'

const MOBILE_INPUT_RISK_STORE = 'wmc_mobile_nurse_risk_v1'
const MOBILE_INPUT_ESCALATIONS = 'wmc_mobile_nurse_escalations_v1'

const commonClasses = {
  input:
    'mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-teal-400/20 focus:border-teal-500 focus:ring-2',
  select:
    'mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-teal-400/20 focus:border-teal-500 focus:ring-2',
  button:
    'min-h-14 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50',
}

const quickTemplates = [
  {
    id: 'ate-poorly',
    label: 'Patient ate poorly',
    fill: {
      appetite: 'Patient ate poorly, around 25–50% of offered meal.',
      noteText: 'Nutrition/weight concern; encourage smaller frequent intake and document reoffering.',
      noteKind: 'appetite concern',
    },
  },
  {
    id: 'confused',
    label: 'Patient confused',
    fill: {
      confusion: 'Patient appears confused, requires repeated reorientation.',
      noteText: 'Confusion observed; bedside sitter considerations and safety cueing reinforced.',
      noteKind: 'confusion concern',
    },
  },
  {
    id: 'fall-risk',
    label: 'Patient fall risk',
    fill: {
      fallIncident: 'Increased fall risk noted. Bed/chair alarm reinforced; staff assist required.',
      noteText: 'Mobility unstable today; increased supervision requested.',
      noteKind: 'fall risk',
    },
  },
  {
    id: 'med-given',
    label: 'Medication given',
    fill: {
      medicationStatus: 'Given',
      medicationName: 'Current prescribed medication',
      noteText: 'Medication administration completed as ordered.',
      noteKind: 'medication given',
    },
  },
  {
    id: 'med-missed',
    label: 'Medication missed',
    fill: {
      medicationStatus: 'Missed',
      medicationName: 'Current prescribed medication',
      noteText: 'Medication missed/withheld per incident details.',
      noteKind: 'medication missed',
    },
  },
  {
    id: 'doctor-review',
    label: 'Needs doctor review',
    fill: {
      noteText: 'Needs doctor review at earliest opportunity.',
      noteKind: 'doctor review required',
    },
  },
]

function readEscalations() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(MOBILE_INPUT_ESCALATIONS)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeEscalations(rows) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(MOBILE_INPUT_ESCALATIONS, JSON.stringify(rows))
  } catch {
    // no-op in simulation
  }
}

function riskStoreSet(patientId, payload) {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(MOBILE_INPUT_RISK_STORE)
    const current = raw ? JSON.parse(raw) : {}
    const next = {
      ...(typeof current === 'object' && current !== null ? current : {}),
      [patientId]: {
        ...(typeof current?.[patientId] === 'object' && current?.[patientId] !== null ? current[patientId] : {}),
        ...payload,
      },
    }
    localStorage.setItem(MOBILE_INPUT_RISK_STORE, JSON.stringify(next))
  } catch {
    // no-op in simulation
  }
}

function getRiskStore(patientId) {
  if (typeof window === 'undefined' || !patientId) return null
  try {
    const raw = localStorage.getItem(MOBILE_INPUT_RISK_STORE)
    const data = raw ? JSON.parse(raw) : {}
    if (!data || typeof data !== 'object') return null
    return data[patientId] || null
  } catch {
    return null
  }
}

function createEscalationFromAnalysis(analysis) {
  const active = analysis.categories.filter((c) => c.escalation)
  const reasons = active.length > 0 ? active.map((item) => item.label).join('; ') : 'AI clinical concern'
  return {
    id: `esc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    patientId: analysis.patientId,
    patientName: analysis.patientName,
    score: analysis.overallScore,
    reasons,
    level: scoreToLevel(analysis.overallScore).level,
    noteCount: analysis.noteCount,
    createdAt: new Date().toISOString(),
    status: 'open',
    source: 'mobile-nurse-input',
  }
}

function hasFreshEscalation(existing, analysis) {
  return existing.some((row) => row.patientId === analysis.patientId && row.status === 'open' && row.score === analysis.overallScore)
}

function serializeToast(message, type = 'success') {
  return { message, type }
}

function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export default function MobileNurseInputPage() {
  const { patients, getById, savePatient } = usePatients()
  const { notes, addNote } = useNursingNotes()

  const [form, setForm] = useState(() => ({
    patientId: '',
    date: new Date().toISOString().slice(0, 10),
    shift: 'Day',
    nurse: '',
    appetite: '',
    hydration: '',
    painScore: '0',
    mood: '',
    confusion: '',
    bloodPressure: '',
    temperature: '',
    heartRate: '',
    spo2: '',
    bloodSugar: '',
    fallIncident: '',
    medicationStatus: 'Given',
    medicationName: '',
    medicationNotes: '',
    noteText: '',
  }))

  const [toast, setToast] = useState(null)
  const [errors, setErrors] = useState({})
  const [activePatientId, setActivePatientId] = useState('')
  const [latestRiskLabel, setLatestRiskLabel] = useState('No score yet')
  const [latestEscalation, setLatestEscalation] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const orderedRecentNotes = useMemo(() => {
    if (!activePatientId) return []
    return [...notes]
      .filter((note) => note.patientId === activePatientId)
      .sort((a, b) => {
        const da = a.date || ''
        const db = b.date || ''
        if (da !== db) return db.localeCompare(da)
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      })
      .slice(0, 4)
  }, [notes, activePatientId])

  function triggerToast(msg, type = 'success') {
    setToast(serializeToast(msg, type))
    setTimeout(() => setToast(null), 2800)
  }

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    if (errors[name]) {
      setErrors((current) => {
        const next = { ...current }
        delete next[name]
        return next
      })
    }
  }

  function applyTemplate(templateId) {
    const tpl = quickTemplates.find((item) => item.id === templateId)
    if (!tpl) return
    setForm((current) => ({
      ...current,
      appetite: tpl.fill.appetite || current.appetite,
      hydration: tpl.fill.hydration || current.hydration,
      confusion: tpl.fill.confusion || current.confusion,
      fallIncident: tpl.fill.fallIncident || current.fallIncident,
      medicationStatus: tpl.fill.medicationStatus || current.medicationStatus,
      medicationName: tpl.fill.medicationName || current.medicationName,
      noteText: `${current.noteText ? `${current.noteText} ` : ''}${tpl.fill.noteText}`.trim(),
      noteKind: tpl.fill.noteKind || current.noteKind,
    }))
    triggerToast(`Template applied: ${tpl.label}`)
  }

  function buildNurseNarrative() {
    const sections = []
    if (form.noteText) sections.push(form.noteText)
    const riskHints = []
    if (form.fallIncident) riskHints.push(`Fall incident: ${form.fallIncident}`)
    if (form.medicationStatus && form.medicationName) {
      riskHints.push(`Medication ${form.medicationStatus.toLowerCase()}: ${form.medicationName}. ${form.medicationNotes || ''}`.trim())
    }
    if (form.confusion) riskHints.push(`Confusion: ${form.confusion}`)
    if (form.appetite || form.hydration) riskHints.push(`Nutrition/hydration: ${form.appetite || 'not noted'}; ${form.hydration || 'not noted'}`)
    if (form.temperature || form.heartRate || form.spo2 || form.bloodPressure || form.bloodSugar) {
      const v = [
        form.bloodPressure ? `BP ${form.bloodPressure}` : '',
        form.heartRate ? `HR ${form.heartRate}` : '',
        form.spo2 ? `SpO₂ ${form.spo2}%` : '',
        form.temperature ? `Temp ${form.temperature}°C` : '',
        form.bloodSugar ? `BS ${form.bloodSugar}` : '',
      ].filter(Boolean)
      riskHints.push(`Vitals: ${v.join(' | ')}`)
    }
    if (riskHints.length > 0) sections.push(riskHints.join(' · '))
    const full = sections.join(' | ')
    return full || 'Routine nursing documentation submitted from mobile input.'
  }

  function saveEscalationIfNeeded(analysis) {
    if (!analysis.anyEscalation) {
      return false
    }
    const entries = readEscalations()
    const payload = createEscalationFromAnalysis(analysis)
    if (hasFreshEscalation(entries, analysis)) return false
    entries.unshift(payload)
    const next = entries.slice(0, 40)
    writeEscalations(next)
    setLatestEscalation(true)
    return true
  }

  function getVitalsText() {
    const bits = []
    if (form.bloodPressure) bits.push(`Blood pressure ${form.bloodPressure}`)
    if (form.temperature) bits.push(`Temp ${form.temperature}°C`)
    if (form.heartRate) bits.push(`HR ${form.heartRate}`)
    if (form.spo2) bits.push(`SpO2 ${form.spo2}%`)
    if (form.bloodSugar) bits.push(`BS ${form.bloodSugar}`)
    return bits.join(' | ')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const selectedPatient = form.patientId
    const patient = getById(selectedPatient)

    const nextErrors = {}
    if (!selectedPatient) nextErrors.patientId = 'Select a patient'
    if (!form.date) nextErrors.date = 'Date is required'
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      triggerToast('Please complete required fields first.', 'warning')
      return
    }

    const appetiteText = `Appetite: ${form.appetite || 'not documented'}. Hydration: ${form.hydration || 'not documented'}`
    const moodText = `Mood: ${form.mood || 'as observed'}. Confusion: ${form.confusion || 'not observed'}.`
    const abn = [
      form.fallIncident ? `Fall incident: ${form.fallIncident}` : '',
      form.medicationName
        ? `Medication ${form.medicationStatus}: ${form.medicationName}${form.medicationNotes ? ` (${form.medicationNotes})` : ''}`
        : '',
      form.noteKind ? `Alert note: ${form.noteKind}` : '',
    ]
      .filter(Boolean)
      .join(' · ')

    const payload = formToNursingNotePayload(
      {
        patientId: selectedPatient,
        date: form.date,
        shift: form.shift,
        author: form.nurse,
        appetite: appetiteText,
        sleep: '',
        painScore: safeNumber(form.painScore, 0),
        mood: moodText,
        bloodPressure: form.bloodPressure,
        bloodSugar: getVitalsText(),
        urination: '',
        bowelMovement: '',
        skinCondition: '',
        abnormalEvents: abn,
        nurseRemarks: buildNurseNarrative(),
      },
      patient?.fullName || 'Unknown patient',
    )

    setIsSubmitting(true)
    try {
      const result = await addNote(payload)
      if (result?.googleSheetSyncStatus === 'failed') {
        throw new Error(result?.googleSheetSyncMessage || 'Failed to sync note to Google Sheet.')
      }
      triggerToast('Saved to Google Sheet database')
    } catch (error) {
      triggerToast(error instanceof Error ? error.message : 'Failed to save note with Google Sheet sync.', 'warning')
      setIsSubmitting(false)
      return
    }

    const nowAnalyses = [...notes, { ...payload, patientNameSnapshot: patient?.fullName || 'Unknown patient' }]
      .filter((note) => note.patientId === selectedPatient)
      .map((note) => ({
        ...note,
        painScore: Number.isFinite(Number(note.painScore)) ? Number(note.painScore) : 0,
      }))
      .sort((a, b) => {
        if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '')
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      })

    const analysis = analyzePatientNotes(nowAnalyses, patient || null)
    const escalationTriggered = saveEscalationIfNeeded(analysis)
    const riskScore = Number.isFinite(analysis.overallScore) ? analysis.overallScore : 0

    savePatient(selectedPatient, {
      latestAiRiskScore: riskScore,
      latestAiRiskAt: new Date().toISOString(),
      latestAiRiskLevel: scoreToLevel(riskScore).label,
      latestAiRiskReasons: analysis.categories
        .filter((row) => row.escalationAlert)
        .map((row) => row.label)
        .join('; '),
    })
    riskStoreSet(selectedPatient, {
      score: riskScore,
      level: scoreToLevel(riskScore).label,
      at: new Date().toISOString(),
      reasons: analysis.categories.filter((cat) => cat.escalationAlert).map((cat) => cat.label),
    })

    let telegramHint = ''
    try {
      const mobileRes = await fetch('/api/nursing/mobile-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient,
          room: patient?.room ?? '',
          nurseName: form.nurse || '',
          narrative: buildNurseNarrative(),
          overallScore: analysis.overallScore,
          suggestedAction: recommendedActionFromAnalysis(analysis),
          primaryLoop: analysis.categories?.[0]?.id ?? null,
        }),
      })
      const mobileJson = await mobileRes.json().catch(() => ({}))
      if (!mobileRes.ok) {
        throw new Error(mobileJson.error || `HTTP ${mobileRes.status}`)
      }
      if (mobileJson.telegramSent) {
        telegramHint = ' Telegram group notified.'
      } else if (mobileJson.telegramError) {
        telegramHint = ` Telegram not sent: ${mobileJson.telegramError}.`
      }
    } catch (telErr) {
      telegramHint = ` Telegram notify failed: ${telErr instanceof Error ? telErr.message : String(telErr)}.`
    }

    setLatestRiskLabel(`AI risk ${riskScore} • ${analysis.categories[0]?.levelLabel || 'Monitoring'}`)
    setActivePatientId(selectedPatient)
    setLatestEscalation(Boolean(escalationTriggered))
    if (escalationTriggered) {
      triggerToast(
        `Saved note for ${patient?.fullName || 'patient'} and triggered escalation. Doctor review recommended.${telegramHint}`,
        'warning',
      )
    } else {
      triggerToast(`Saved note for ${patient?.fullName || 'patient'} and updated AI risk profile.${telegramHint}`)
    }
    window.dispatchEvent(new Event('wmc-clinical-data-updated'))

    if (typeof window !== 'undefined') {
      try {
        const currentEscalations = readEscalations()
        if (currentEscalations.some((row) => row.patientId === selectedPatient && row.status === 'open')) {
          triggerToast('Dashboard and AI risk indicators refreshed in simulation mode.')
        }
      } catch {
        // noop
      }
    }
    setIsSubmitting(false)
  }

  function handleReset() {
    setForm((current) => ({
      ...current,
      shift: 'Day',
      appetite: '',
      hydration: '',
      painScore: '0',
      mood: '',
      confusion: '',
      bloodPressure: '',
      temperature: '',
      heartRate: '',
      spo2: '',
      bloodSugar: '',
      fallIncident: '',
      medicationStatus: 'Given',
      medicationName: '',
      medicationNotes: '',
      noteText: '',
      noteKind: undefined,
    }))
    setErrors({})
  }

  const analyses = useMemo(() => {
    const rows = analyzeAllPatientsFromNotes(patients, notes, getById).filter((row) => row.patientId === activePatientId)
    return rows
  }, [activePatientId, notes, patients, getById])

  const latestAnalysis = useMemo(() => (analyses.length > 0 ? analyses[0] : null), [analyses])
  const cachedSnapshot = useMemo(() => {
    if (!activePatientId) return null
    return getRiskStore(activePatientId)
  }, [activePatientId, notes.length])

  return (
    <div>
      <PageHeader
        title="Mobile Nurse Input"
        description="Phone-friendly, one-screen note capture for bedside staff."
        action={
          <Badge variant="info" className="self-start">
            Simulation mode
          </Badge>
        }
      />

      {toast ? (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
            toast.type === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Select patient</h2>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <Smartphone className="mr-2 h-3.5 w-3.5" aria-hidden />
            Mobile-first
          </span>
        </div>
        <div className="space-y-1">
          <label htmlFor="mn-patient" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Patient
          </label>
          <select
            id="mn-patient"
            value={form.patientId}
            onChange={(event) => {
              const patientId = event.target.value
              setField('patientId', patientId)
              setActivePatientId(patientId)
            }}
            className={commonClasses.select}
            aria-invalid={Boolean(errors.patientId)}
          >
            <option value="">Select patient…</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.fullName}
              </option>
            ))}
          </select>
          {errors.patientId ? <p className="mt-1 text-xs text-red-600">{errors.patientId}</p> : null}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="text-lg font-semibold text-slate-900">Quick input templates</h2>
        <p className="mt-1 text-sm text-slate-600">Touch one button to preload your note.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {quickTemplates.map((template) => (
            <button
              type="button"
              key={template.id}
              onClick={() => applyTemplate(template.id)}
              className={`${commonClasses.button} text-left`}
            >
              {template.label}
            </button>
          ))}
        </div>
      </Card>

      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Shift + nurse info</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</span>
              <input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} className={commonClasses.input} />
              {errors.date ? <p className="mt-1 text-xs text-red-600">{errors.date}</p> : null}
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shift</span>
              <select value={form.shift} onChange={(e) => setField('shift', e.target.value)} className={commonClasses.select}>
                <option value="Day">Day</option>
                <option value="Evening">Evening</option>
                <option value="Night">Night</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documenting nurse</span>
              <input
                type="text"
                placeholder="R.N. / L.P.N."
                value={form.nurse}
                onChange={(e) => setField('nurse', e.target.value)}
                className={commonClasses.input}
              />
            </label>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Nursing observations</h2>
            <Badge variant={latestEscalation ? 'warning' : 'default'}>
              {latestRiskLabel}
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Appetite</span>
              <textarea
                value={form.appetite}
                onChange={(e) => setField('appetite', e.target.value)}
                rows={3}
                className={commonClasses.input}
                placeholder="Meal completion percentage and quality"
              />
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hydration status</span>
              <textarea
                value={form.hydration}
                onChange={(e) => setField('hydration', e.target.value)}
                rows={3}
                className={commonClasses.input}
                placeholder="Fluids offered, fluids accepted, urine pattern"
              />
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pain score (0–10)</span>
              <input
                type="number"
                min="0"
                max="10"
                value={form.painScore}
                onChange={(e) => setField('painScore', e.target.value)}
                className={commonClasses.input}
              />
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mood</span>
              <input
                type="text"
                value={form.mood}
                onChange={(e) => setField('mood', e.target.value)}
                className={commonClasses.input}
                placeholder="Calm, anxious, fatigued, agitated"
              />
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confusion observation</span>
              <input
                type="text"
                value={form.confusion}
                onChange={(e) => setField('confusion', e.target.value)}
                className={commonClasses.input}
                placeholder="Disoriented, poor safety awareness"
              />
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fall incident</span>
              <textarea
                value={form.fallIncident}
                onChange={(e) => setField('fallIncident', e.target.value)}
                rows={3}
                className={commonClasses.input}
                placeholder="Unsteady, stumble, near-fall details"
              />
            </label>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Vital signs</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Blood pressure</span>
              <input
                value={form.bloodPressure}
                onChange={(e) => setField('bloodPressure', e.target.value)}
                className={commonClasses.input}
                placeholder="e.g. 128/76"
              />
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Temperature °C</span>
              <div className="relative">
                <Thermometer className="absolute left-4 top-5 h-4 w-4 text-slate-400" aria-hidden />
                <input
                  type="number"
                  step="0.1"
                  value={form.temperature}
                  onChange={(e) => setField('temperature', e.target.value)}
                  className={`${commonClasses.input} pl-10`}
                  placeholder="36.7"
                />
              </div>
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Heart rate</span>
              <input
                type="number"
                value={form.heartRate}
                onChange={(e) => setField('heartRate', e.target.value)}
                className={commonClasses.input}
                placeholder="72"
              />
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">SpO₂</span>
              <input
                type="number"
                value={form.spo2}
                onChange={(e) => setField('spo2', e.target.value)}
                className={commonClasses.input}
                placeholder="96"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Blood sugar / other</span>
              <input
                type="text"
                value={form.bloodSugar}
                onChange={(e) => setField('bloodSugar', e.target.value)}
                className={commonClasses.input}
                placeholder="Random 130 / random lab context"
              />
            </label>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Medication update</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Medication status</span>
              <select
                value={form.medicationStatus}
                onChange={(e) => setField('medicationStatus', e.target.value)}
                className={commonClasses.select}
              >
                <option value="Given">Medication given</option>
                <option value="Missed">Medication missed</option>
                <option value="Not given">Not given / held</option>
              </select>
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Medication name</span>
              <input
                value={form.medicationName}
                onChange={(e) => setField('medicationName', e.target.value)}
                className={commonClasses.input}
                placeholder="e.g. Lisinopril"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Medication note</span>
              <textarea
                value={form.medicationNotes}
                onChange={(e) => setField('medicationNotes', e.target.value)}
                rows={2}
                className={commonClasses.input}
                placeholder="Dose, route, reaction, timing"
              />
            </label>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Free text note</h2>
          <textarea
            value={form.noteText}
            onChange={(e) => setField('noteText', e.target.value)}
            rows={3}
            className={commonClasses.input}
            placeholder="Add additional context, interventions, and plan."
          />
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleReset}
            className={`${commonClasses.button} border-rose-200 text-rose-700`}
          >
            <X className="mr-2 inline h-4 w-4" aria-hidden />
            Clear form
          </button>
          <button
            type="submit"
            className="min-h-14 rounded-2xl bg-teal-600 px-4 py-3 text-base font-bold text-white shadow-md hover:bg-teal-700"
            disabled={isSubmitting}
          >
            <Send className="mr-2 inline h-4 w-4" aria-hidden />
            {isSubmitting ? 'Submitting...' : 'Submit mobile nurse input'}
          </button>
        </div>
      </form>

      {activePatientId ? (
        <Card className="mt-4">
          <div className="flex items-start gap-3">
            <UserCircle2 className="mt-1 h-5 w-5 text-slate-600" aria-hidden />
            <div>
              <h3 className="text-lg font-semibold text-slate-900">AI support preview</h3>
              <p className="mt-1 text-sm text-slate-600">
                {latestAnalysis
                  ? `Latest AI risk for ${latestAnalysis.patientName}: ${latestAnalysis.overallScore} (${latestAnalysis.categories[0]?.levelLabel || 'monitor'})`
                  : cachedSnapshot
                    ? `Latest saved AI risk: ${cachedSnapshot.score} (${cachedSnapshot.level})`
                    : 'Capture the first entry to generate a live AI risk score.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(latestAnalysis?.categories || []).slice(0, 4).map((row) => (
                  <Badge key={row.id} variant={row.escalation ? 'danger' : 'default'}>
                    {row.label}: {row.score}
                  </Badge>
                ))}
                {latestAnalysis && latestAnalysis.categories.length === 0 ? <Badge>No risk signals</Badge> : null}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-sm font-semibold text-slate-900">Recent submissions</h4>
            {orderedRecentNotes.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No notes yet for this patient.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {orderedRecentNotes.map((note) => (
                  <li key={note.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-900">
                      {new Date(note.date).toLocaleDateString()} — {note.nurseRemarks ? note.nurseRemarks.slice(0, 140) : 'Routine note'}
                    </p>
                    <p className="text-xs text-slate-600">Pain {note.painScore ?? 0}/10</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
