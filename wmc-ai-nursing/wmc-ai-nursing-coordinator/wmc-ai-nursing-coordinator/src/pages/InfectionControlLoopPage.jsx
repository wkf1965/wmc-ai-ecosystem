import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  ClipboardPlus,
  FileSpreadsheet,
  Microscope,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Ban,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import {
  bumpInfectionControlScore,
  infectionControlScoreTotalsDisplay,
  mergeInfectionControlInstances,
  upsertInfectionControlInstance,
  getInfectionControlInstancesObject,
} from '../db/infectionControlLoopStorage.js'
import {
  buildInfectionControlAiAlerts,
  buildInfectionControlReportCsv,
  deriveInfectionScoreBand,
  infectionControlAiSummaryBlocks,
  infectionControlBoardBucket,
  infectionControlMasterAiSummary,
  scoreTotalsWithRows,
} from '../lib/infectionControlLoopSimulation.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`
const btnSuccess = `${btn} border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`

const COLS = [
  { key: 'fever_cases', title: 'Fever cases', sub: 'Temperature / febrile illness', badge: 'danger' },
  { key: 'isolation_required', title: 'Isolation required', sub: 'Air/contact cohort', badge: 'warning' },
  { key: 'possible_infection', title: 'Possible infection', sub: 'Surveillance & work-up', badge: 'info' },
  { key: 'ppe_required', title: 'PPE required', sub: 'Precaution compliance', badge: 'teal' },
  { key: 'doctor_review_needed', title: 'Doctor review needed', sub: 'Escalation queue', badge: 'danger' },
  { key: 'resolved_cases', title: 'Resolved cases', sub: 'Cleared / stable', badge: 'success' },
]

function bandBadgeVariant(b) {
  if (b === 'urgent_review') return 'danger'
  if (b === 'isolation_needed') return 'warning'
  if (b === 'suspected_infection') return 'warning'
  if (b === 'monitor') return 'info'
  return 'success'
}

function bumpScoreForBand(band) {
  const map = {
    clear: 'clear',
    monitor: 'monitor',
    suspected_infection: 'suspectedInfection',
    isolation_needed: 'isolationNeeded',
    urgent_review: 'urgentReview',
  }
  const k = map[band]
  if (k) bumpInfectionControlScore(k, 1)
}

function InfectionCard({ row, selected, onSelect }) {
  const bucket = row.boardBucket ?? infectionControlBoardBucket(row)
  const band = row.infectionScoreBand ?? deriveInfectionScoreBand(row)
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(row.patientId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(row.patientId)
        }
      }}
      className={`cursor-pointer border shadow-sm transition-shadow ${selected ? 'ring-2 ring-teal-500 ring-offset-2' : 'border-slate-100'}`}
      padding="p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{row.patientName}</p>
          <p className="text-xs text-slate-600">
            Rm <span className="font-semibold">{row.roomNumber}</span>
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <Badge variant={bandBadgeVariant(band)}>{band.replace(/_/g, ' ')}</Badge>
          <Badge variant="info">{bucket.replace(/_/g, ' ')}</Badge>
        </div>
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Temperature</dt>
          <dd className="font-bold tabular-nums text-slate-900">
            {typeof row.temperatureC === 'number' ? `${row.temperatureC.toFixed(1)}°C` : '—'}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase text-slate-500">Cough / flu</p>
          <p className="mt-0.5 leading-snug">{row.coughFluSymptoms}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase text-slate-500">Wound · UTI · GI</p>
          <p className="mt-0.5 leading-snug">
            <span className="font-medium text-slate-800">W:</span> {row.woundInfectionSigns}{' '}
            <span className="text-slate-400">·</span> <span className="font-medium text-slate-800">U:</span>{' '}
            {row.utiSymptoms}
          </p>
          <p className="mt-1 leading-snug">
            <span className="font-medium text-slate-800">GI:</span> {row.diarrheaVomiting}
          </p>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Isolation</dt>
          <dd className="font-semibold capitalize">{row.isolationStatus}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Precautions</dt>
          <dd className="capitalize">{row.contactPrecautions}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">PPE</dt>
          <dd>{row.ppeRequired ? <Badge variant="warning">Required</Badge> : <span className="text-slate-500">Routine</span>}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Nurse</dt>
          <dd className="font-medium">{row.nurseAssigned}</dd>
        </div>
        <div className="flex justify-between gap-2 text-[11px]">
          <dt className="text-slate-500">Last check</dt>
          <dd>{row.lastInfectionCheckAt ? new Date(row.lastInfectionCheckAt).toLocaleString() : '—'}</dd>
        </div>
        <div className="flex justify-between gap-2 text-[11px]">
          <dt className="text-slate-500">Next due</dt>
          <dd>{row.nextCheckDueAt ? new Date(row.nextCheckDueAt).toLocaleString() : '—'}</dd>
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {row.doctorEscalation ? <Badge variant="danger">MD escalated</Badge> : null}
          {row.resolvedCase ? <Badge variant="success">Resolved</Badge> : null}
        </div>
        {Array.isArray(row.notes) && row.notes.length > 0 ? (
          <div className="rounded-lg bg-teal-50/80 px-2 py-1.5 text-[11px] text-teal-950">
            <p className="font-semibold text-teal-800">Latest note</p>
            <p className="mt-0.5">{row.notes[row.notes.length - 1]?.text}</p>
          </div>
        ) : null}
      </dl>
    </Card>
  )
}

/** Simulation clock anchor — deterministic per tick (no Date.now() in render). */
const SIM_CLOCK_ORIGIN_MS = Date.UTC(2025, 0, 1, 8, 0, 0)
const SIM_MS_PER_TICK = 120000

export default function InfectionControlLoopPage() {
  const { patients } = usePatients()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [selectedPid, setSelectedPid] = useState(null)
  const [mobileCol, setMobileCol] = useState('fever_cases')

  const nowMs = SIM_CLOCK_ORIGIN_MS + tick * SIM_MS_PER_TICK

  const rawMap = useMemo(() => {
    mergeInfectionControlInstances(patients, nowMs)
    return getInfectionControlInstancesObject()
  }, [patients, nowMs])

  const { rows, tallies } = useMemo(() => scoreTotalsWithRows(rawMap), [rawMap])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-infection-control-loop-updated', bump)
    return () => window.removeEventListener('wmc-infection-control-loop-updated', bump)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 120 * 1000)
    return () => window.clearInterval(id)
  }, [])

  const alerts = useMemo(() => buildInfectionControlAiAlerts(rows), [rows])
  const masterAi = useMemo(() => infectionControlMasterAiSummary(rows), [rows])
  const blocks = useMemo(() => infectionControlAiSummaryBlocks(rows), [rows])
  const scores = useMemo(() => infectionControlScoreTotalsDisplay(tallies), [tallies])

  const buckets = useMemo(() => {
    const o = {
      fever_cases: [],
      isolation_required: [],
      possible_infection: [],
      ppe_required: [],
      doctor_review_needed: [],
      resolved_cases: [],
    }
    for (const r of rows) {
      const k = r.boardBucket
      if (o[k]) o[k].push(r)
    }
    return o
  }, [rows])

  const selected = rows.find((r) => r.patientId === selectedPid) || null

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 2600)
  }

  function appendNote(pid, text) {
    const trimmed = String(text || '').trim()
    if (!trimmed) return
    const raw = getInfectionControlInstancesObject()
    const prev = raw[pid] || {}
    const notes = Array.isArray(prev.notes) ? [...prev.notes] : []
    notes.push({ at: new Date().toISOString(), text: trimmed })
    upsertInfectionControlInstance(pid, { notes: notes.slice(-14) })
  }

  function requireSelection() {
    if (!selected) {
      showToast('Select a patient card first.', 'warn')
      return null
    }
    return selected
  }

  function handleRecordCheck() {
    const row = requireSelection()
    if (!row) return
    const tempRaw = window.prompt('Temperature °C (decimal)', String(row.temperatureC ?? 36.8))
    if (tempRaw === null) return
    const t = parseFloat(tempRaw)
    if (!Number.isFinite(t)) {
      showToast('Invalid temperature.', 'warn')
      return
    }
    upsertInfectionControlInstance(row.patientId, {
      temperatureC: t,
      manualTemperatureLock: true,
      lastInfectionCheckAt: new Date().toISOString(),
      nextCheckDueAt: new Date(Date.now() + 4 * 3600000).toISOString(),
    })
    bumpScoreForBand(deriveInfectionScoreBand({ ...row, temperatureC: t, manualTemperatureLock: true }))
    showToast('Infection check recorded.', 'success')
  }

  function handleAddNote() {
    const row = requireSelection()
    if (!row) return
    const text = window.prompt(`Infection note — ${row.patientName}`, '')
    if (text === null) return
    appendNote(row.patientId, text)
    bumpInfectionControlScore('monitor', 1)
    showToast('Note saved.')
  }

  function handleStartIsolation() {
    const row = requireSelection()
    if (!row) return
    upsertInfectionControlInstance(row.patientId, {
      isolationStatus: 'active',
      ppeRequired: true,
      contactPrecautions: row.contactPrecautions === 'standard' ? 'contact' : row.contactPrecautions,
    })
    bumpInfectionControlScore('isolationNeeded', 1)
    showToast('Isolation started.', 'warn')
  }

  function handleMarkPpe() {
    const row = requireSelection()
    if (!row) return
    upsertInfectionControlInstance(row.patientId, {
      ppeRequired: true,
      contactPrecautionsLocked: true,
      contactPrecautions: 'droplet',
    })
    bumpInfectionControlScore('monitor', 1)
    showToast('PPE / droplet precautions flagged.', 'success')
  }

  function handleEscalateMd() {
    const row = requireSelection()
    if (!row) return
    upsertInfectionControlInstance(row.patientId, {
      doctorEscalation: true,
      possibleSepsisFlag: Number(row.temperatureC) >= 38 || row.possibleSepsisFlag,
    })
    bumpInfectionControlScore('urgentReview', 1)
    showToast('Escalated to doctor.', 'warn')
  }

  function handleReport() {
    const csv = buildInfectionControlReportCsv(rows.map((r) => ({ ...r })))
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `infection-control-loop-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Infection report exported.')
  }

  return (
    <div className="mx-auto max-w-[1680px] pb-8">
      <PageHeader
        title="Infection Control Loop"
        description="Local rounding board for febrile illness cues, isolation, PPE, and escalation — always follow facility infection prevention policy."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Local mode</Badge>
            <Link
              to="/wound-care-loop"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Wound care loop
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
          <button type="button" className={btnPrimary} onClick={handleRecordCheck} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
              Record infection check
            </span>
          </button>
          <button type="button" className={btnMuted} onClick={handleAddNote} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <ClipboardPlus className="h-4 w-4 shrink-0" aria-hidden />
              Add infection note
            </span>
          </button>
          <button type="button" className={btnWarn} onClick={handleStartIsolation} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
              Start isolation
            </span>
          </button>
          <button type="button" className={btnMuted} onClick={handleMarkPpe} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <Ban className="h-4 w-4 shrink-0" aria-hidden />
              Mark PPE required
            </span>
          </button>
          <button type="button" className={btnDanger} onClick={handleEscalateMd} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <Stethoscope className="h-4 w-4 shrink-0" aria-hidden />
              Escalate to doctor
            </span>
          </button>
          <button type="button" className={btnSuccess} onClick={handleReport}>
            <span className="inline-flex items-center gap-1">
              <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
              Generate infection report
            </span>
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Tap a resident card, then document checks or precautions. Resolved cases appear in the board as local cues clear.
        </p>
      </Card>

      <Card className="mb-3" padding="p-4">
        <div className="flex items-start gap-2">
          <Sparkles className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI summary</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{masterAi}</p>
          </div>
        </div>
      </Card>

      <div className="mb-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {[
          ['Patients with fever', blocks.patientsWithFever],
          ['Possible infection cases', blocks.possibleInfectionCases],
          ['Isolation checklist', blocks.isolationChecklist],
          ['PPE checklist', blocks.ppeChecklist],
          ['Nurse action checklist', blocks.nurseActionChecklist],
          ['Doctor review recommendation', blocks.doctorReviewRecommendation],
        ].map(([title, body]) => (
          <Card key={title} padding="p-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Microscope className="h-4 w-4 text-slate-500" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            </div>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">{body}</pre>
          </Card>
        ))}
      </div>

      <Card className="mb-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Microscope className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Infection scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Baseline + bumps + live band tallies from roster</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Clear', val: scores.clear },
            { label: 'Monitor', val: scores.monitor },
            { label: 'Suspected infection', val: scores.suspectedInfection },
            { label: 'Isolation needed', val: scores.isolationNeeded },
            { label: 'Urgent review', val: scores.urgentReview },
          ].map((x) => (
            <div key={x.label} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{x.label}</dt>
              <dd className="text-xl font-bold tabular-nums text-slate-900">{x.val}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="mb-8" padding="p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <BellRing className="h-5 w-5 text-amber-600" aria-hidden />
          <div>
            <h3 className="text-base font-semibold text-slate-900">AI alerts</h3>
            <p className="text-sm text-slate-500">
              Fever · sepsis concern · wound · UTI · GI cluster · respiratory cluster · MD review
            </p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No infection alerts on this snapshot.
          </p>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {alerts.map((a) => (
              <li key={a.id} className="flex gap-2 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-sm">
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    a.severity === 'critical'
                      ? 'text-red-600'
                      : a.severity === 'high'
                        ? 'text-orange-600'
                        : 'text-amber-600'
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

      <div className="xl:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Infection control board</p>
        <div className="flex gap-1 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
          {COLS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ring-1 ring-inset transition-colors ${
                mobileCol === c.key ? 'bg-teal-600 text-white ring-teal-700' : 'bg-white text-slate-600 ring-slate-200'
              }`}
              onClick={() => setMobileCol(c.key)}
            >
              <span className="line-clamp-2 max-w-[104px] text-left">{c.title}</span>
              <span className="ml-1 tabular-nums opacity-80">({buckets[c.key]?.length ?? 0})</span>
            </button>
          ))}
        </div>
        <div className="space-y-3 pb-8">
          {(buckets[mobileCol] || []).map((row) => (
            <InfectionCard key={row.patientId} row={row} selected={selectedPid === row.patientId} onSelect={setSelectedPid} />
          ))}
          {(buckets[mobileCol] || []).length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-600">
              No patients in this lane.
            </p>
          ) : null}
        </div>
      </div>

      <div className="hidden gap-3 xl:grid xl:grid-cols-6">
        {COLS.map((col) => (
          <div key={col.key} className="flex min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50">
            <div className="shrink-0 border-b border-slate-200/80 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-bold leading-tight text-slate-900">{col.title}</h3>
                <Badge variant={col.badge}>{buckets[col.key]?.length ?? 0}</Badge>
              </div>
              <p className="mt-0.5 text-[10px] text-slate-500">{col.sub}</p>
            </div>
            <div className="max-h-[calc(100vh-12rem)] min-h-[200px] space-y-3 overflow-y-auto overscroll-contain p-2">
              {(buckets[col.key] || []).map((row) => (
                <InfectionCard key={row.patientId} row={row} selected={selectedPid === row.patientId} onSelect={setSelectedPid} />
              ))}
              {(buckets[col.key] || []).length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">Empty</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
