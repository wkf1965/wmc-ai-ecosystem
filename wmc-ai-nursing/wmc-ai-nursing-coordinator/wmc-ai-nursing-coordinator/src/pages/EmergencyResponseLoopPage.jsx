import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ambulance,
  BellRing,
  ClipboardPlus,
  Download,
  Phone,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  UserRound,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { MED_LOOP_ROOM_MAP } from '../data/medicationLoopSeed.js'
import {
  addEmergencyIncidentDraft,
  upsertEmergencyRecord,
  EMERGENCY_TYPES,
} from '../db/emergencyResponseLoopStorage.js'
import {
  buildEmergencyLoopAiAlerts,
  buildIncidentReportCsv,
  emergencyLoopAiSummary,
  emergencyScoreTotalsDisplay,
  formatDetected,
  listEmergencyRecordsWithBuckets,
  severityBadgeVariant,
  severityDisplay,
} from '../lib/emergencyResponseLoopSimulation.js'
import { usePatients } from '../hooks/usePatients.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-rose-600 text-white hover:bg-rose-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`
const btnSuccess = `${btn} border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`
const btnTeal = `${btn} bg-teal-600 text-white hover:bg-teal-700`

const COLS = [
  { key: 'active_emergency', title: 'Active emergencies', sub: 'Unit response in progress', badge: 'danger' },
  { key: 'pending_doctor', title: 'Pending doctor response', sub: 'MD notified · awaiting callback', badge: 'warning' },
  { key: 'ambulance_required', title: 'Ambulance required', sub: 'EMS pathway', badge: 'danger' },
  { key: 'resolved', title: 'Resolved incidents', sub: 'Closed in sim', badge: 'success' },
  { key: 'follow_up', title: 'Follow-up required', sub: 'Post-incident monitoring', badge: 'info' },
]

function stripBucket(row) {
  const { bucket: _b, ...rest } = row
  return rest
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function NotifyPill({ label, ok }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        ok ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {label}: {ok ? 'Y' : 'N'}
    </span>
  )
}

function EmergencyCard({ row, selected, onSelect }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(row.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(row.id)
        }
      }}
      className={`cursor-pointer border shadow-sm transition-shadow ${selected ? 'ring-2 ring-rose-500 ring-offset-2' : 'border-slate-100'}`}
      padding="p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{row.patientName}</p>
          <p className="text-xs text-slate-600">
            Rm <span className="font-semibold">{row.roomNumber}</span>
            <span className="mx-1 text-slate-400">·</span>
            {formatDetected(row.timeDetected)}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <Badge variant={severityBadgeVariant(row.severityLevel)}>{severityDisplay(row.severityLevel)}</Badge>
          <Badge variant="info">{row.emergencyType}</Badge>
        </div>
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Nurse in charge</dt>
          <dd className="max-w-[58%] text-right font-medium">{row.nurseInCharge}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Actions</dt>
          <dd className="max-w-[62%] text-right leading-snug">{row.actionTaken}</dd>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <NotifyPill label="MD" ok={row.doctorNotified} />
          <NotifyPill label="MD ok" ok={row.doctorResponded} />
          <NotifyPill label="Fam" ok={row.familyNotified} />
          <NotifyPill label="EMS" ok={row.ambulanceCalled} />
          <NotifyPill label="Sup" ok={row.supervisorNotified} />
        </div>
        <div className="pt-1">
          <Badge variant={row.outcomeStatus === 'resolved' ? 'success' : row.outcomeStatus === 'follow_up' ? 'info' : 'warning'}>
            Outcome: {String(row.outcomeStatus).replace(/_/g, ' ')}
          </Badge>
        </div>
      </dl>
    </Card>
  )
}

export default function EmergencyResponseLoopPage() {
  const { patients } = usePatients()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [mobileCol, setMobileCol] = useState('active_emergency')

  useEffect(() => {
    listEmergencyRecordsWithBuckets(patients)
  }, [patients])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-emergency-response-loop-updated', bump)
    return () => window.removeEventListener('wmc-emergency-response-loop-updated', bump)
  }, [])

  const rows = useMemo(() => listEmergencyRecordsWithBuckets(patients), [patients, tick])

  const alerts = useMemo(() => buildEmergencyLoopAiAlerts(rows.map(stripBucket)), [rows])
  const summary = useMemo(() => emergencyLoopAiSummary(rows.map(stripBucket)), [rows])
  const scores = useMemo(() => emergencyScoreTotalsDisplay(), [tick])

  const buckets = useMemo(() => {
    return {
      active_emergency: rows.filter((r) => r.bucket === 'active_emergency'),
      pending_doctor: rows.filter((r) => r.bucket === 'pending_doctor'),
      ambulance_required: rows.filter((r) => r.bucket === 'ambulance_required'),
      resolved: rows.filter((r) => r.bucket === 'resolved'),
      follow_up: rows.filter((r) => r.bucket === 'follow_up'),
    }
  }, [rows])

  const selected = rows.find((r) => r.id === selectedId) || null

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 2600)
  }

  function requireSelection() {
    if (!selected) {
      showToast('Select an incident card first.', 'warn')
      return null
    }
    return selected
  }

  function handleTriggerEmergency() {
    const roster = patients.length ? patients : [{ id: 'p1', fullName: 'Sim Resident A (demo)' }]
    const menu = roster.map((p, i) => `${i + 1}. ${p.fullName} (${p.id})`).join('\n')
    const pick = window.prompt(`Choose patient #:\n${menu}`, '1')
    if (pick === null) return
    const idx = parseInt(pick, 10) - 1
    const p = roster[idx >= 0 && idx < roster.length ? idx : 0]
    const typeMenu = EMERGENCY_TYPES.map((t, i) => `${i + 1}. ${t}`).join('\n')
    const tPick = window.prompt(`Emergency type #:\n${typeMenu}`, '1')
    if (tPick === null) return
    const tIdx = parseInt(tPick, 10) - 1
    const emergencyType = EMERGENCY_TYPES[tIdx >= 0 && tIdx < EMERGENCY_TYPES.length ? tIdx : 0]
    const sPick = window.prompt('Severity: mild | moderate | severe | critical | code_red', 'moderate')
    if (sPick === null) return
    const severityLevel = String(sPick).toLowerCase().replace(/\s+/g, '_')
    const allowed = ['mild', 'moderate', 'severe', 'critical', 'code_red']
    const sev = allowed.includes(severityLevel) ? severityLevel : 'moderate'
    const roomNumber = MED_LOOP_ROOM_MAP[p.id] || `TBD-${p.id}`
    addEmergencyIncidentDraft({
      patientId: p.id,
      patientName: p.fullName,
      roomNumber,
      emergencyType,
      severityLevel: sev,
    })
    showToast(`Emergency triggered (sim): ${emergencyType}`, 'success')
  }

  function handleNotifyDoctor() {
    const row = requireSelection()
    if (!row || row.outcomeStatus !== 'active') {
      if (row && row.outcomeStatus !== 'active') showToast('Only active incidents accept notify workflow.', 'warn')
      return
    }
    const base = stripBucket(row)
    if (!base.doctorNotified) {
      upsertEmergencyRecord({ ...base, doctorNotified: true, doctorResponded: false })
      showToast('Doctor notified (simulation).', 'success')
      return
    }
    upsertEmergencyRecord({ ...base, doctorResponded: true })
    showToast('Doctor response recorded (simulation).', 'success')
  }

  function handleNotifySupervisor() {
    const row = requireSelection()
    if (!row) return
    upsertEmergencyRecord({ ...stripBucket(row), supervisorNotified: true })
    showToast('Supervisor notified (simulation).', 'success')
  }

  function handleNotifyFamily() {
    const row = requireSelection()
    if (!row) return
    upsertEmergencyRecord({ ...stripBucket(row), familyNotified: true })
    showToast('Family notified (simulation).', 'success')
  }

  function handleAmbulance() {
    const row = requireSelection()
    if (!row) return
    upsertEmergencyRecord({ ...stripBucket(row), ambulanceCalled: true })
    showToast('Ambulance called — EMS staged (simulation).', 'warn')
  }

  function handleMarkResolved() {
    const row = requireSelection()
    if (!row) return
    upsertEmergencyRecord({
      ...stripBucket(row),
      outcomeStatus: 'resolved',
      doctorResponded: true,
    })
    showToast('Incident marked resolved (simulation).', 'success')
  }

  function handleFlagFollowUp() {
    const row = requireSelection()
    if (!row) return
    upsertEmergencyRecord({ ...stripBucket(row), outcomeStatus: 'follow_up' })
    showToast('Follow-up pathway flagged.', 'success')
  }

  function handleIncidentReport() {
    const csv = buildIncidentReportCsv(rows.map(stripBucket))
    downloadText(`emergency-incidents-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    showToast('Incident report CSV downloaded.')
  }

  return (
    <div className="mx-auto max-w-[1600px] pb-8">
      <PageHeader
        title="Emergency response loop"
        description="Rapid simulated escalation board for falls, cardiorespiratory events, neuro red flags, and medication reactions. Demo only — follow your facility emergency operations plan."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Simulation mode</Badge>
            <Link
              to="/supervisor"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Supervisor center
            </Link>
          </div>
        }
      />

      {toast ? (
        <div
          role="status"
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
            toast.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : toast.tone === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-sky-200 bg-sky-50 text-sky-900'
          }`}
        >
          {toast.msg}
        </div>
      ) : null}

      <Card className="mb-3" padding="p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={handleTriggerEmergency}>
            Trigger emergency
          </button>
          <button type="button" className={btnTeal} onClick={handleNotifyDoctor} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <Stethoscope className="h-4 w-4 shrink-0" aria-hidden />
              Notify doctor (sim)
            </span>
          </button>
          <button type="button" className={btnWarn} onClick={handleNotifySupervisor} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
              Notify supervisor (sim)
            </span>
          </button>
          <button type="button" className={btnMuted} onClick={handleNotifyFamily} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <Users className="h-4 w-4 shrink-0" aria-hidden />
              Notify family (sim)
            </span>
          </button>
          <button type="button" className={btnDanger} onClick={handleAmbulance} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <Ambulance className="h-4 w-4 shrink-0" aria-hidden />
              Call ambulance (sim)
            </span>
          </button>
          <button type="button" className={btnSuccess} onClick={handleMarkResolved} disabled={!selected}>
            Mark resolved
          </button>
          <button type="button" className={btnMuted} onClick={handleFlagFollowUp} disabled={!selected}>
            Flag follow-up
          </button>
          <button type="button" className={btnMuted} onClick={handleIncidentReport}>
            <span className="inline-flex items-center gap-1">
              <Download className="h-4 w-4 shrink-0" aria-hidden />
              Generate incident report
            </span>
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          <strong className="text-slate-700">Doctor notify:</strong> first click pages MD (sim); second click marks MD response received.
          Select a card to apply notification actions.
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-rose-400 to-red-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Phone className="h-5 w-5 shrink-0 text-rose-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Immediate checklist</p>
              <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">{summary.immediateActionChecklist}</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-teal-400 to-cyan-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <ClipboardPlus className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Doctor handover</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-800">{summary.doctorHandoverSummary}</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden sm:col-span-2" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-violet-400 to-indigo-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <UserRound className="h-5 w-5 shrink-0 text-violet-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Family update draft</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-800">{summary.familyUpdateDraft}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-3" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">AI emergency summary</h3>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Incident report summary</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{summary.incidentReportSummary}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Follow-up care recommendation</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{summary.followUpCareRecommendation}</p>
          </div>
        </div>
      </Card>

      <Card className="mt-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Emergency scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Simulation tally · includes demo baseline · bumps when new incidents trigger</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Mild', val: scores.mild },
            { label: 'Moderate', val: scores.moderate },
            { label: 'Severe', val: scores.severe },
            { label: 'Critical', val: scores.critical },
            { label: 'Code Red', val: scores.codeRed },
          ].map((x) => (
            <div key={x.label} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{x.label}</dt>
              <dd className="text-xl font-bold tabular-nums text-slate-900">{x.val}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="mt-4" padding="p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <BellRing className="h-5 w-5 text-amber-600" aria-hidden />
          <div>
            <h3 className="text-base font-semibold text-slate-900">AI alerts</h3>
            <p className="text-sm text-slate-500">Critical events · stroke · falls · oxygen · sepsis · medication reactions</p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No AI escalation flags on this roster snapshot.
          </p>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {alerts.map((a) => (
              <li key={a.id} className="flex gap-2 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-sm">
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    a.severity === 'critical' ? 'text-red-600' : a.severity === 'high' ? 'text-orange-600' : 'text-amber-600'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{a.title}</p>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{a.category}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6 xl:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Emergency board</p>
        <div className="flex gap-1 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
          {COLS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ring-1 ring-inset transition-colors ${
                mobileCol === c.key ? 'bg-rose-600 text-white ring-rose-700' : 'bg-white text-slate-600 ring-slate-200'
              }`}
              onClick={() => setMobileCol(c.key)}
            >
              <span className="line-clamp-2 max-w-[140px] text-left">{c.title}</span>
              <span className="ml-1 tabular-nums opacity-80">({buckets[c.key].length})</span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {buckets[mobileCol].map((row) => (
            <EmergencyCard key={row.id} row={row} selected={selectedId === row.id} onSelect={setSelectedId} />
          ))}
          {buckets[mobileCol].length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-600">
              No incidents in this column.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 hidden gap-3 xl:grid xl:grid-cols-5">
        {COLS.map((col) => (
          <div key={col.key} className="flex min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50">
            <div className="shrink-0 border-b border-slate-200/80 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold leading-tight text-slate-900">{col.title}</h3>
                <Badge variant={col.badge}>{buckets[col.key].length}</Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">{col.sub}</p>
            </div>
            <div className="max-h-[calc(100vh-13rem)] min-h-[220px] space-y-3 overflow-y-auto overscroll-contain p-3">
              {buckets[col.key].map((row) => (
                <EmergencyCard key={row.id} row={row} selected={selectedId === row.id} onSelect={setSelectedId} />
              ))}
              {buckets[col.key].length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">Empty</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
