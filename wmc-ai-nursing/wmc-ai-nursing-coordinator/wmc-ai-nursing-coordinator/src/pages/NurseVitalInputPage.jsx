import { useState, useMemo } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Droplets,
  Heart,
  Send,
  Smartphone,
  Thermometer,
  Wind,
  X,
  BellRing,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { assessVitalRisks, riskLevelStyle, RISK_LEVELS } from '../lib/vitalRiskDetection.js'
import { saveVitalRecord, getPatientVitals, generateVitalId } from '../db/vitalStorage.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const MOOD_OPTIONS = [
  { value: 'Calm', emoji: '😌' },
  { value: 'Cooperative', emoji: '🤝' },
  { value: 'Anxious', emoji: '😟' },
  { value: 'Confused', emoji: '😕' },
  { value: 'Agitated', emoji: '😤' },
  { value: 'Combative', emoji: '😠' },
  { value: 'Withdrawn', emoji: '😶' },
  { value: 'Fatigued', emoji: '😴' },
]

const PAIN_LABELS = ['No pain', 'Mild', 'Mild', 'Moderate', 'Moderate', 'Moderate', 'Severe', 'Severe', 'Very severe', 'Worst', 'Unbearable']
const PAIN_COLORS = [
  'from-emerald-400 to-emerald-500 via-emerald-400',
  'from-green-400 to-green-500 via-green-400',
  'from-lime-400 to-lime-500 via-lime-400',
  'from-yellow-400 to-yellow-500 via-yellow-400',
  'from-amber-400 to-amber-500 via-amber-400',
  'from-orange-400 to-orange-500 via-orange-400',
  'from-orange-500 to-red-500 via-orange-600',
  'from-red-400 to-red-500 via-red-400',
  'from-red-500 to-red-600 via-red-500',
  'from-red-600 to-red-700 via-red-600',
  'from-red-700 to-rose-800 via-red-700',
]

const MED_STATUS_OPTIONS = ['Given', 'Partial', 'Missed', 'Refused', 'Held']

const cls = {
  input:
    'mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-teal-400/20 focus:border-teal-500 focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500',
  label: 'text-xs font-semibold uppercase tracking-wide text-slate-500',
  sectionTitle: 'text-base font-semibold text-slate-900',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyForm() {
  return {
    patientId: '',
    nurse: '',
    date: new Date().toISOString().slice(0, 10),
    shift: 'Day',
    bpSystolic: '',
    bpDiastolic: '',
    pulse: '',
    temperature: '',
    spo2: '',
    glucose: '',
    painScore: 0,
    mood: '',
    medicationTaken: 'Given',
    medicationName: '',
    medicationNotes: '',
    notes: '',
  }
}

function formatTime(isoString) {
  if (!isoString) return '—'
  try {
    return new Date(isoString).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

function VitalBadge({ label, value, icon: Icon, unit = '', warn = false, critical = false }) {
  const color = critical
    ? 'border-red-200 bg-red-50 text-red-800'
    : warn
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-slate-200 bg-slate-50 text-slate-700'
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${color}`}>
      {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden /> : null}
      <span className="min-w-0">
        <span className="text-xs opacity-70">{label}: </span>
        <span className="font-semibold">{value ?? '—'}{value && unit ? ` ${unit}` : ''}</span>
      </span>
    </div>
  )
}

function RiskCard({ risk }) {
  const style = riskLevelStyle(risk.level)
  const [open, setOpen] = useState(risk.level === RISK_LEVELS.CRITICAL || risk.level === RISK_LEVELS.HIGH)
  return (
    <div className={`rounded-2xl border ${style.border} ${style.bg} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${style.text}`}
      >
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
          <span className="font-semibold">{risk.label}</span>
          <span
            className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${style.badgeBg} ${style.badgeText}`}
          >
            {style.label}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold opacity-80">{risk.value}</span>
          {open ? <ChevronUp className="h-4 w-4 opacity-60" /> : <ChevronDown className="h-4 w-4 opacity-60" />}
        </div>
      </button>
      {open ? (
        <div className={`border-t ${style.border} px-4 pb-4 pt-3`}>
          <p className={`text-sm ${style.text}`}>{risk.message}</p>
          <p className={`mt-2 rounded-xl border ${style.border} px-3 py-2 text-xs font-semibold ${style.text} bg-white/60`}>
            <span className="uppercase tracking-wide opacity-60">Recommended action: </span>
            {risk.action}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function TelegramButton({ riskSummary, patientName }) {
  const [sent, setSent] = useState(false)
  const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN
  const chatId = import.meta.env.VITE_TELEGRAM_CHAT_ID

  function handleSend() {
    if (!botToken || !chatId) {
      alert(
        'Telegram integration not configured.\n\n' +
          'To enable real alerts, add the following to your .env file:\n\n' +
          '  VITE_TELEGRAM_BOT_TOKEN=your_bot_token\n' +
          '  VITE_TELEGRAM_CHAT_ID=your_chat_id\n\n' +
          `[DEMO] Alert would send:\n"🚨 ${patientName}: ${riskSummary}"`,
      )
      return
    }
    const text = encodeURIComponent(`🚨 WMC Nursing Alert\nPatient: ${patientName}\n${riskSummary}`)
    fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${text}`)
      .then(() => setSent(true))
      .catch(() =>
        alert('Failed to send Telegram message. Check your bot token and chat ID.'),
      )
  }

  return (
    <button
      type="button"
      onClick={handleSend}
      className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-5 py-3.5 text-sm font-semibold shadow-sm transition-colors ${
        sent
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100'
      }`}
    >
      <BellRing className="h-4 w-4" aria-hidden />
      {sent ? 'Telegram alert sent ✓' : 'Send Telegram Alert'}
    </button>
  )
}

// ─── History row ──────────────────────────────────────────────────────────────

function HistoryRow({ record }) {
  const style = riskLevelStyle(record.overallRiskLevel)
  return (
    <li className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="h-3 w-3 shrink-0" aria-hidden />
            {formatTime(record.recordedAt)}
            {record.nurse ? ` · ${record.nurse}` : ''}
            {record.shift ? ` · ${record.shift} shift` : ''}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {record.vitals.bpSystolic ? (
              <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                BP {record.vitals.bpSystolic}/{record.vitals.bpDiastolic}
              </span>
            ) : null}
            {record.vitals.pulse ? (
              <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                ♥ {record.vitals.pulse} bpm
              </span>
            ) : null}
            {record.vitals.temperature ? (
              <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {record.vitals.temperature} °C
              </span>
            ) : null}
            {record.vitals.spo2 ? (
              <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                SpO₂ {record.vitals.spo2}%
              </span>
            ) : null}
            {record.vitals.glucose ? (
              <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                Gluc {record.vitals.glucose} mmol/L
              </span>
            ) : null}
            {record.vitals.mood ? (
              <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {record.vitals.mood}
              </span>
            ) : null}
            <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              Pain {record.vitals.painScore}/10
            </span>
          </div>
          {record.vitals.notes ? (
            <p className="mt-1 text-xs text-slate-600 line-clamp-2">{record.vitals.notes}</p>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${style.badgeBg} ${style.badgeText}`}
        >
          {style.label}
        </span>
      </div>
      {record.risks && record.risks.filter((r) => r.level !== RISK_LEVELS.NORMAL).length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {record.risks
            .filter((r) => r.level !== RISK_LEVELS.NORMAL)
            .map((r) => {
              const rs = riskLevelStyle(r.level)
              return (
                <span
                  key={r.id}
                  className={`rounded-lg border ${rs.border} px-2 py-0.5 text-xs font-semibold ${rs.text}`}
                >
                  {r.label}: {r.value}
                </span>
              )
            })}
        </div>
      ) : null}
    </li>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NurseVitalInputPage() {
  const { patients, getById } = usePatients()

  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [latestResult, setLatestResult] = useState(null)
  const [historyRefresh, setHistoryRefresh] = useState(0)

  const selectedPatient = useMemo(() => (form.patientId ? getById(form.patientId) : null), [form.patientId, getById])

  const patientHistory = useMemo(
    () => (form.patientId ? getPatientVitals(form.patientId, 10) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.patientId, historyRefresh],
  )

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => { const next = { ...prev }; delete next[name]; return next })
  }

  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3200)
  }

  function validate() {
    const errs = {}
    if (!form.patientId) errs.patientId = 'Select a patient'
    if (!form.date) errs.date = 'Date is required'
    const hasAnyVital =
      form.bpSystolic || form.pulse || form.temperature || form.spo2 || form.glucose || form.mood
    if (!hasAnyVital) errs.vitals = 'Enter at least one vital sign or observation'
    return errs
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      showToast('Please complete required fields.', 'warning')
      return
    }

    setIsSubmitting(true)
    try {
      const { risks, overallRiskLevel } = assessVitalRisks(form)
      const record = {
        id: generateVitalId(),
        patientId: form.patientId,
        patientName: selectedPatient?.fullName || 'Unknown',
        nurse: form.nurse,
        date: form.date,
        shift: form.shift,
        recordedAt: new Date().toISOString(),
        overallRiskLevel,
        risks,
        vitals: {
          bpSystolic: form.bpSystolic,
          bpDiastolic: form.bpDiastolic,
          pulse: form.pulse,
          temperature: form.temperature,
          spo2: form.spo2,
          glucose: form.glucose,
          painScore: form.painScore,
          mood: form.mood,
          medicationTaken: form.medicationTaken,
          medicationName: form.medicationName,
          medicationNotes: form.medicationNotes,
          notes: form.notes,
        },
      }
      saveVitalRecord(record)
      setLatestResult(record)
      setHistoryRefresh((v) => v + 1)
      window.dispatchEvent(new Event('wmc-clinical-data-updated'))

      if (overallRiskLevel === RISK_LEVELS.CRITICAL) {
        showToast(`⚠️ Critical alert saved for ${selectedPatient?.fullName}. Notify physician immediately.`, 'error')
      } else if (overallRiskLevel === RISK_LEVELS.HIGH) {
        showToast(`⚠️ High risk vitals recorded for ${selectedPatient?.fullName}. Notify charge nurse.`, 'warning')
      } else {
        showToast(`Vitals saved for ${selectedPatient?.fullName || 'patient'}.`)
      }
    } catch (err) {
      showToast('Failed to save record. Please try again.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleClear() {
    setForm((prev) => ({
      ...emptyForm(),
      patientId: prev.patientId,
      nurse: prev.nurse,
      date: prev.date,
      shift: prev.shift,
    }))
    setErrors({})
    setLatestResult(null)
  }

  const painColor = PAIN_COLORS[form.painScore] || PAIN_COLORS[0]
  const criticalRisks = latestResult?.risks.filter((r) => r.level === RISK_LEVELS.CRITICAL) || []
  const nonNormalRisks = latestResult?.risks.filter((r) => r.level !== RISK_LEVELS.NORMAL) || []
  const riskSummaryText = nonNormalRisks.map((r) => `${r.label}: ${r.value} (${riskLevelStyle(r.level).label})`).join('; ')

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Nurse Vital Input"
        description="Record patient vitals, medication and observations. AI risk scoring runs automatically on save."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
            Mobile-optimised
          </span>
        }
      />

      {/* Toast */}
      {toast ? (
        <div
          role="status"
          className={`mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${
            toast.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-900'
              : toast.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {toast.type === 'error' || toast.type === 'warning' ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>{toast.message}</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* ── Patient & Shift ── */}
        <Card>
          <h2 className={cls.sectionTitle}>Patient & shift</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="nvi-patient" className={cls.label}>
                Patient <span className="text-red-500">*</span>
              </label>
              <select
                id="nvi-patient"
                value={form.patientId}
                onChange={(e) => setField('patientId', e.target.value)}
                className={`${cls.input} ${errors.patientId ? 'border-red-400 ring-2 ring-red-200' : ''}`}
              >
                <option value="">Select patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
              {errors.patientId ? <p className="mt-1 text-xs text-red-600">{errors.patientId}</p> : null}
            </div>
            <div>
              <label htmlFor="nvi-date" className={cls.label}>
                Date <span className="text-red-500">*</span>
              </label>
              <input
                id="nvi-date"
                type="date"
                value={form.date}
                onChange={(e) => setField('date', e.target.value)}
                className={cls.input}
              />
            </div>
            <div>
              <label htmlFor="nvi-shift" className={cls.label}>
                Shift
              </label>
              <select
                id="nvi-shift"
                value={form.shift}
                onChange={(e) => setField('shift', e.target.value)}
                className={cls.input}
              >
                <option value="Day">Day</option>
                <option value="Evening">Evening</option>
                <option value="Night">Night</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="nvi-nurse" className={cls.label}>
                Documenting nurse
              </label>
              <input
                id="nvi-nurse"
                type="text"
                placeholder="R.N. / L.P.N. name"
                value={form.nurse}
                onChange={(e) => setField('nurse', e.target.value)}
                className={cls.input}
              />
            </div>
          </div>
        </Card>

        {/* ── Vital Signs ── */}
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className={cls.sectionTitle}>Vital signs</h2>
            {errors.vitals ? (
              <p className="text-xs font-semibold text-red-600">{errors.vitals}</p>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">

            {/* Blood Pressure */}
            <div>
              <span className={cls.label}>Blood pressure (mmHg)</span>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min="60"
                  max="250"
                  placeholder="Systolic"
                  value={form.bpSystolic}
                  onChange={(e) => setField('bpSystolic', e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-teal-400/20 focus:border-teal-500 focus:ring-2"
                  aria-label="Systolic blood pressure"
                />
                <span className="flex items-center text-slate-400 font-semibold">/</span>
                <input
                  type="number"
                  min="40"
                  max="160"
                  placeholder="Diastolic"
                  value={form.bpDiastolic}
                  onChange={(e) => setField('bpDiastolic', e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-teal-400/20 focus:border-teal-500 focus:ring-2"
                  aria-label="Diastolic blood pressure"
                />
              </div>
            </div>

            {/* Pulse */}
            <div>
              <label htmlFor="nvi-pulse" className={cls.label}>
                <span className="flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5 text-red-500" aria-hidden />
                  Pulse (bpm)
                </span>
              </label>
              <input
                id="nvi-pulse"
                type="number"
                min="30"
                max="250"
                placeholder="e.g. 76"
                value={form.pulse}
                onChange={(e) => setField('pulse', e.target.value)}
                className={cls.input}
              />
            </div>

            {/* Temperature */}
            <div>
              <label htmlFor="nvi-temp" className={cls.label}>
                <span className="flex items-center gap-1.5">
                  <Thermometer className="h-3.5 w-3.5 text-orange-500" aria-hidden />
                  Temperature (°C)
                </span>
              </label>
              <input
                id="nvi-temp"
                type="number"
                step="0.1"
                min="34"
                max="42"
                placeholder="e.g. 36.8"
                value={form.temperature}
                onChange={(e) => setField('temperature', e.target.value)}
                className={cls.input}
              />
              <p className="mt-1 text-xs text-slate-400">Normal: 36.1 – 37.2 °C</p>
            </div>

            {/* SpO2 */}
            <div>
              <label htmlFor="nvi-spo2" className={cls.label}>
                <span className="flex items-center gap-1.5">
                  <Wind className="h-3.5 w-3.5 text-sky-500" aria-hidden />
                  Oxygen sat. SpO₂ (%)
                </span>
              </label>
              <input
                id="nvi-spo2"
                type="number"
                min="70"
                max="100"
                placeholder="e.g. 97"
                value={form.spo2}
                onChange={(e) => setField('spo2', e.target.value)}
                className={cls.input}
              />
              <p className="mt-1 text-xs text-slate-400">Normal: ≥ 95%</p>
            </div>

            {/* Glucose */}
            <div>
              <label htmlFor="nvi-glucose" className={cls.label}>
                <span className="flex items-center gap-1.5">
                  <Droplets className="h-3.5 w-3.5 text-purple-500" aria-hidden />
                  Blood glucose (mmol/L)
                </span>
              </label>
              <input
                id="nvi-glucose"
                type="number"
                step="0.1"
                min="1"
                max="30"
                placeholder="e.g. 5.6"
                value={form.glucose}
                onChange={(e) => setField('glucose', e.target.value)}
                className={cls.input}
              />
              <p className="mt-1 text-xs text-slate-400">Normal: 4.0 – 7.8 mmol/L</p>
            </div>

          </div>
        </Card>

        {/* ── Pain Score ── */}
        <Card>
          <h2 className={cls.sectionTitle}>Pain score</h2>
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <span className={cls.label}>Score: 0 – 10</span>
              <span
                className={`rounded-2xl bg-linear-to-r ${painColor} px-4 py-1.5 text-2xl font-black text-white shadow-sm tabular-nums`}
              >
                {form.painScore}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={form.painScore}
              onChange={(e) => setField('painScore', parseInt(e.target.value, 10))}
              className="mt-3 h-3 w-full cursor-pointer appearance-none rounded-full bg-linear-to-r from-emerald-400 via-amber-400 to-red-600 accent-slate-700"
              aria-label="Pain score"
            />
            <div className="mt-1 flex justify-between px-0.5">
              {Array.from({ length: 11 }, (_, i) => (
                <span key={i} className={`text-[10px] font-semibold ${i === form.painScore ? 'text-slate-900' : 'text-slate-400'}`}>
                  {i}
                </span>
              ))}
            </div>
            <p className="mt-2 text-center text-sm font-medium text-slate-700">
              {PAIN_LABELS[form.painScore]}
            </p>
          </div>
        </Card>

        {/* ── Mood / Behaviour ── */}
        <Card>
          <h2 className={cls.sectionTitle}>Mood / behaviour</h2>
          <p className="mt-1 text-sm text-slate-500">Tap to select — triggers AI behaviour risk scoring.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MOOD_OPTIONS.map(({ value, emoji }) => {
              const isSelected = form.mood === value
              const isCritical = ['Combative'].includes(value)
              const isHigh = ['Agitated'].includes(value)
              return (
                <button
                  type="button"
                  key={value}
                  onClick={() => setField('mood', isSelected ? '' : value)}
                  className={`flex flex-col items-center gap-1 rounded-2xl border px-3 py-3 text-sm font-semibold transition-all ${
                    isSelected
                      ? isCritical
                        ? 'border-red-400 bg-red-500 text-white shadow-md shadow-red-200'
                        : isHigh
                          ? 'border-orange-400 bg-orange-500 text-white shadow-md shadow-orange-200'
                          : 'border-teal-400 bg-teal-500 text-white shadow-md shadow-teal-200'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-xl leading-none" role="img" aria-hidden>
                    {emoji}
                  </span>
                  {value}
                </button>
              )
            })}
          </div>
          {form.mood ? (
            <p className="mt-2 text-xs text-slate-500">
              Selected: <strong className="text-slate-800">{form.mood}</strong>
            </p>
          ) : null}
        </Card>

        {/* ── Medication ── */}
        <Card>
          <h2 className={cls.sectionTitle}>Medication record</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <span className={cls.label}>Medication taken</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {MED_STATUS_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    onClick={() => setField('medicationTaken', opt)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                      form.medicationTaken === opt
                        ? opt === 'Missed' || opt === 'Refused'
                          ? 'border-red-400 bg-red-500 text-white'
                          : opt === 'Partial'
                            ? 'border-amber-400 bg-amber-500 text-white'
                            : 'border-teal-400 bg-teal-500 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="nvi-medname" className={cls.label}>
                Medication name
              </label>
              <input
                id="nvi-medname"
                type="text"
                placeholder="e.g. Metformin 500mg"
                value={form.medicationName}
                onChange={(e) => setField('medicationName', e.target.value)}
                className={cls.input}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="nvi-mednotes" className={cls.label}>
                Medication notes
              </label>
              <textarea
                id="nvi-mednotes"
                rows={2}
                placeholder="Route, reaction, reason for missed dose…"
                value={form.medicationNotes}
                onChange={(e) => setField('medicationNotes', e.target.value)}
                className={cls.input}
              />
            </div>
          </div>
        </Card>

        {/* ── Additional notes ── */}
        <Card>
          <label htmlFor="nvi-notes">
            <h2 className={cls.sectionTitle}>Additional clinical notes</h2>
          </label>
          <textarea
            id="nvi-notes"
            rows={3}
            placeholder="Observations, interventions, follow-up plan…"
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            className={`${cls.input} mt-3`}
          />
        </Card>

        {/* ── Action buttons ── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleClear}
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50"
          >
            <X className="h-4 w-4" aria-hidden />
            Clear
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-teal-600 px-4 py-3 text-base font-bold text-white shadow-md hover:bg-teal-700 disabled:opacity-60"
          >
            <Send className="h-4 w-4" aria-hidden />
            {isSubmitting ? 'Saving…' : 'Save & analyse'}
          </button>
        </div>
      </form>

      {/* ── AI Risk Results ── */}
      {latestResult ? (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-teal-600" aria-hidden />
            <h2 className="text-lg font-bold text-slate-900">AI Risk Assessment</h2>
            {(() => {
              const style = riskLevelStyle(latestResult.overallRiskLevel)
              return (
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${style.badgeBg} ${style.badgeText}`}>
                  Overall: {style.label}
                </span>
              )
            })()}
          </div>

          {criticalRisks.length > 0 ? (
            <div className="rounded-2xl border-2 border-red-400 bg-red-50 px-4 py-4 shadow-md">
              <div className="flex items-center gap-2 text-red-800">
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
                <strong className="text-base font-bold">Critical alert — notify physician immediately</strong>
              </div>
              <ul className="mt-2 space-y-1">
                {criticalRisks.map((r) => (
                  <li key={r.id} className="text-sm font-semibold text-red-700">
                    • {r.label}: {r.value} — {r.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-2">
            {latestResult.risks.map((risk) => (
              <RiskCard key={risk.id} risk={risk} />
            ))}
          </div>

          {/* Vitals summary */}
          <Card>
            <h3 className="text-sm font-semibold text-slate-700">Recorded vitals summary</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {latestResult.vitals.bpSystolic ? (
                <VitalBadge
                  label="BP"
                  value={`${latestResult.vitals.bpSystolic}/${latestResult.vitals.bpDiastolic}`}
                  unit="mmHg"
                  warn={parseInt(latestResult.vitals.bpSystolic, 10) >= 140}
                  critical={parseInt(latestResult.vitals.bpSystolic, 10) >= 160}
                />
              ) : null}
              {latestResult.vitals.pulse ? (
                <VitalBadge
                  label="Pulse"
                  value={latestResult.vitals.pulse}
                  unit="bpm"
                  icon={Heart}
                  warn={parseInt(latestResult.vitals.pulse, 10) > 100 || parseInt(latestResult.vitals.pulse, 10) < 60}
                />
              ) : null}
              {latestResult.vitals.temperature ? (
                <VitalBadge
                  label="Temp"
                  value={latestResult.vitals.temperature}
                  unit="°C"
                  icon={Thermometer}
                  warn={parseFloat(latestResult.vitals.temperature) >= 37.5}
                  critical={parseFloat(latestResult.vitals.temperature) >= 38.5}
                />
              ) : null}
              {latestResult.vitals.spo2 ? (
                <VitalBadge
                  label="SpO₂"
                  value={latestResult.vitals.spo2}
                  unit="%"
                  icon={Wind}
                  warn={parseInt(latestResult.vitals.spo2, 10) < 95}
                  critical={parseInt(latestResult.vitals.spo2, 10) < 92}
                />
              ) : null}
              {latestResult.vitals.glucose ? (
                <VitalBadge
                  label="Glucose"
                  value={latestResult.vitals.glucose}
                  unit="mmol/L"
                  icon={Droplets}
                  warn={parseFloat(latestResult.vitals.glucose) > 11}
                  critical={parseFloat(latestResult.vitals.glucose) < 3.5 || parseFloat(latestResult.vitals.glucose) > 20}
                />
              ) : null}
              <VitalBadge
                label="Pain"
                value={`${latestResult.vitals.painScore}/10`}
                warn={latestResult.vitals.painScore >= 5}
                critical={latestResult.vitals.painScore >= 8}
              />
              {latestResult.vitals.mood ? (
                <VitalBadge label="Mood" value={latestResult.vitals.mood} />
              ) : null}
              {latestResult.vitals.medicationName ? (
                <VitalBadge
                  label="Medication"
                  value={`${latestResult.vitals.medicationTaken}: ${latestResult.vitals.medicationName}`}
                  warn={latestResult.vitals.medicationTaken === 'Partial'}
                  critical={latestResult.vitals.medicationTaken === 'Missed' || latestResult.vitals.medicationTaken === 'Refused'}
                  icon={ClipboardList}
                />
              ) : null}
            </div>
          </Card>

          {/* Telegram alert */}
          {nonNormalRisks.length > 0 ? (
            <TelegramButton
              riskSummary={riskSummaryText || 'Vital signs recorded — review recommended.'}
              patientName={latestResult.patientName}
            />
          ) : null}
        </div>
      ) : null}

      {/* ── Patient vitals history ── */}
      {form.patientId && patientHistory.length > 0 ? (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-slate-500" aria-hidden />
            <h2 className="text-base font-semibold text-slate-900">
              Recent vitals — {selectedPatient?.fullName || 'Patient'}
            </h2>
            <Badge variant="default">{patientHistory.length}</Badge>
          </div>
          <ul className="space-y-2">
            {patientHistory.map((record) => (
              <HistoryRow key={record.id} record={record} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
