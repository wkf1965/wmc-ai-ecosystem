import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardCopy,
  MessageCircleMore,
  MessagesSquare,
  Pencil,
  Send,
  ShieldCheck,
  Sparkles,
  FileDown,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import { mergeDoctorReviewLoopRecords } from '../db/doctorReviewLoopStorage.js'
import { mergeAiRiskPredictionInstances } from '../db/aiRiskPredictionLoopStorage.js'
import {
  bumpFamilyUpdateScore,
  familyUpdateScoreTotalsDisplay,
  mergeFamilyUpdateInstances,
  upsertFamilyUpdateInstance,
  getFamilyUpdateInstancesObject,
} from '../db/familyUpdateLoopStorage.js'
import {
  buildFamilyUpdateAiAlerts,
  exportWeeklyFamilyReport,
  familyUpdateAiSummaryBlocks,
  familyUpdateBoardBucket,
  familyUpdateMasterAiSummary,
  listFamilyUpdateRows,
  regenerateDraftForPatient,
  FAMILY_UPDATE_TYPES,
} from '../lib/familyUpdateLoopSimulation.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`
const btnSuccess = `${btn} border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`

const COLS = [
  { key: 'draft_updates', title: 'Draft updates', sub: 'Message being composed', badge: 'info' },
  { key: 'pending_approval', title: 'Pending approval', sub: 'Supervisor sign-off', badge: 'warning' },
  { key: 'ready_to_send', title: 'Ready to send', sub: 'Approved · awaiting WA', badge: 'teal' },
  { key: 'sent_simulation', title: 'Sent updates', sub: 'Logged delivery', badge: 'success' },
  { key: 'urgent_family_alerts', title: 'Urgent family alerts', sub: 'Risk / MD triggers', badge: 'danger' },
]

const TONES = [
  { id: 'professional', label: 'Professional' },
  { id: 'warm', label: 'Warm and caring' },
  { id: 'short', label: 'Short WhatsApp style' },
  { id: 'detailed', label: 'Detailed clinical summary' },
]

const LANGS = [
  { id: 'en', label: 'English version' },
  { id: 'zh', label: 'Chinese version' },
  { id: 'ms', label: 'Malay version' },
]

function updateTypeBadgeVariant(t) {
  if (t === 'urgent') return 'danger'
  if (t === 'doctor_review') return 'warning'
  if (t === 'rehab_progress') return 'teal'
  if (t === 'weekly') return 'info'
  return 'success'
}

function FamilyCard({ row, selected, onSelect, nowMs }) {
  const bucket = row.boardBucket ?? familyUpdateBoardBucket(row, nowMs)
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
          <Badge variant={updateTypeBadgeVariant(row.updateType)}>{String(row.updateType).replace(/_/g, ' ')}</Badge>
          <Badge variant="info">{bucket.replace(/_/g, ' ')}</Badge>
        </div>
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500 shrink-0">Family contact</dt>
          <dd className="max-w-[62%] text-right font-medium">{row.familyContactName}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500 shrink-0">WhatsApp</dt>
          <dd className="font-mono text-[11px]">{row.whatsAppNumber}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Condition summary</p>
          <p className="mt-0.5 max-h-16 overflow-y-auto leading-snug text-slate-800">{row.latestConditionSummary}</p>
        </div>
        <div className="rounded-lg bg-teal-50/80 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-800">Family message draft</p>
          <p className="mt-0.5 max-h-24 overflow-y-auto leading-snug text-teal-950">{row.familyMessageDraft}</p>
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          <Badge variant={row.approvalStatus === 'sent' ? 'success' : row.approvalStatus === 'approved' ? 'teal' : 'warning'}>
            {row.approvalStatus.replace(/_/g, ' ')}
          </Badge>
          {row.sentStatus ? <Badge variant="success">Sent</Badge> : null}
          {row.nurseApprovedBy ? (
            <Badge variant="info">Nurse: {row.nurseApprovedBy}</Badge>
          ) : null}
          {row.supervisorApprovedBy ? (
            <Badge variant="success">SV: {row.supervisorApprovedBy}</Badge>
          ) : null}
          {row.whatsAppSimulatedAt ? <Badge variant="teal">WA sim</Badge> : null}
        </div>
      </dl>
    </Card>
  )
}

export default function FamilyUpdateLoopPage() {
  const { patients } = usePatients()
  const { notes } = useNursingNotes()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [selectedPid, setSelectedPid] = useState(null)
  const [mobileCol, setMobileCol] = useState('draft_updates')
  const [tone, setTone] = useState('professional')
  const [language, setLanguage] = useState('en')

  const nowMs = useMemo(() => Date.now(), [tick])

  const rawMap = useMemo(() => {
    mergeDoctorReviewLoopRecords(patients, notes)
    mergeAiRiskPredictionInstances(patients, notes)
    mergeFamilyUpdateInstances(patients, notes, nowMs)
    return getFamilyUpdateInstancesObject()
  }, [patients, notes, tick, nowMs])

  const rows = useMemo(() => listFamilyUpdateRows(rawMap, nowMs), [rawMap, nowMs])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-family-update-loop-updated', bump)
    return () => window.removeEventListener('wmc-family-update-loop-updated', bump)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 120 * 1000)
    return () => window.clearInterval(id)
  }, [])

  const alerts = useMemo(() => buildFamilyUpdateAiAlerts(rows, nowMs), [rows, nowMs])

  const tallies = useMemo(() => {
    const t = {
      upToDate: 0,
      pending: 0,
      overdue: 0,
      urgent: 0,
      supervisorReviewNeeded: 0,
    }
    for (const row of rows) {
      const b = row.communicationBand
      if (t[b] !== undefined) t[b] += 1
    }
    return t
  }, [rows])

  const scores = useMemo(() => familyUpdateScoreTotalsDisplay(tallies), [tallies, tick])

  const masterAi = useMemo(() => familyUpdateMasterAiSummary(rows, nowMs), [rows, nowMs])
  const summaryBlocks = useMemo(() => familyUpdateAiSummaryBlocks(rows), [rows])

  const buckets = useMemo(() => {
    return {
      draft_updates: rows.filter((r) => r.boardBucket === 'draft_updates'),
      pending_approval: rows.filter((r) => r.boardBucket === 'pending_approval'),
      ready_to_send: rows.filter((r) => r.boardBucket === 'ready_to_send'),
      sent_simulation: rows.filter((r) => r.boardBucket === 'sent_simulation'),
      urgent_family_alerts: rows.filter((r) => r.boardBucket === 'urgent_family_alerts'),
    }
  }, [rows])

  const selected = rows.find((r) => r.patientId === selectedPid) || null

  function showToast(msg, toneArg = 'info') {
    setToast({ msg, tone: toneArg })
    window.setTimeout(() => setToast(null), 2800)
  }

  function requireSelection() {
    if (!selected) {
      showToast('Select a resident card first.', 'warn')
      return null
    }
    return selected
  }

  function handleGenerateFamilyUpdate() {
    const row = requireSelection()
    if (!row) return
    const patch = regenerateDraftForPatient(row, tone, language, patients, notes, nowMs)
    upsertFamilyUpdateInstance(row.patientId, {
      ...patch,
      tonePreference: tone,
      languagePreference: language,
      nurseApprovedBy: null,
      supervisorApprovedBy: null,
      approvalStatus: 'draft',
      whatsAppSimulatedAt: null,
      familyDraftSyncedDoctor: false,
    })
    bumpFamilyUpdateScore('pending', 1)
    showToast('Family update draft regenerated.', 'success')
  }

  function handleEditMessage() {
    const row = requireSelection()
    if (!row) return
    const next = window.prompt('Edit family message', row.familyMessageDraft || '')
    if (next === null) return
    upsertFamilyUpdateInstance(row.patientId, { familyMessageDraft: next })
    showToast('Message updated locally.', 'success')
  }

  function handleApproveMessage() {
    const row = requireSelection()
    if (!row) return
    if (!row.nurseApprovedBy) {
      upsertFamilyUpdateInstance(row.patientId, {
        nurseApprovedBy: 'Charge RN',
      })
      bumpFamilyUpdateScore(row.needsSupervisorApproval ? 'supervisorReviewNeeded' : 'pending', 1)
      showToast('Nurse approval recorded.', 'success')
      return
    }
    if (row.needsSupervisorApproval && !row.supervisorApprovedBy) {
      upsertFamilyUpdateInstance(row.patientId, {
        supervisorApprovedBy: 'Nursing supervisor',
      })
      bumpFamilyUpdateScore('upToDate', 1)
      showToast('Supervisor approval recorded.', 'success')
      return
    }
    showToast('Already fully approved.', 'info')
  }

  function handleCopyWhatsApp() {
    const row = requireSelection()
    if (!row) return
    const block = `${row.familyMessageDraft || ''}\n\n— ${row.patientName} · Rm ${row.roomNumber}`
    navigator.clipboard.writeText(block).catch(() => {})
    showToast('Copied draft to clipboard.', 'success')
  }

  function handleSimulateSendWhatsApp() {
    const row = requireSelection()
    if (!row) return
    upsertFamilyUpdateInstance(row.patientId, {
      whatsAppSimulatedAt: new Date().toISOString(),
    })
    bumpFamilyUpdateScore('pending', 1)
    showToast(`Simulated WhatsApp to ${row.whatsAppNumber}`, 'info')
  }

  function handleMarkSent() {
    const row = requireSelection()
    if (!row) return
    upsertFamilyUpdateInstance(row.patientId, {
      sentStatus: true,
      approvalStatus: 'sent',
      lastSentAt: new Date().toISOString(),
    })
    bumpFamilyUpdateScore('upToDate', 1)
    showToast('Marked as sent.', 'success')
  }

  function handleWeeklyReport() {
    const text = exportWeeklyFamilyReport(rows, new Date().toISOString())
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `family-update-weekly-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    bumpFamilyUpdateScore('upToDate', 1)
    showToast('Weekly family report downloaded.', 'success')
  }

  return (
    <div className="mx-auto max-w-[1600px] pb-8">
      <PageHeader
        title="Family Update Loop"
        description="Local workspace merging nursing notes, vitals, meds, intake, hydration, sleep, rehab, mental health, doctor review, and AI risk signals into WhatsApp-ready drafts."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Local mode</Badge>
            <Link
              to="/family-updates"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Classic family updates
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
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="fam-tone" className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              AI message tone
            </label>
            <select
              id="fam-tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="mt-1 min-h-[44px] w-[min(100%,220px)] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            >
              {TONES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fam-lang" className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Language
            </label>
            <select
              id="fam-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 min-h-[44px] w-[min(100%,200px)] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            >
              {LANGS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={handleGenerateFamilyUpdate} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
              Generate family update
            </span>
          </button>
          <button type="button" className={btnMuted} onClick={handleEditMessage} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <Pencil className="h-4 w-4 shrink-0" aria-hidden />
              Edit message
            </span>
          </button>
          <button type="button" className={btnSuccess} onClick={handleApproveMessage} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              Approve message
            </span>
          </button>
          <button type="button" className={btnMuted} onClick={handleCopyWhatsApp} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <ClipboardCopy className="h-4 w-4 shrink-0" aria-hidden />
              Copy WhatsApp message
            </span>
          </button>
          <button type="button" className={btnWarn} onClick={handleSimulateSendWhatsApp} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <Send className="h-4 w-4 shrink-0" aria-hidden />
              Simulate send WhatsApp
            </span>
          </button>
          <button type="button" className={btnDanger} onClick={handleMarkSent} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <MessageCircleMore className="h-4 w-4 shrink-0" aria-hidden />
              Mark as sent
            </span>
          </button>
          <button type="button" className={btnMuted} onClick={handleWeeklyReport}>
            <span className="inline-flex items-center gap-1">
              <FileDown className="h-4 w-4 shrink-0" aria-hidden />
              Generate weekly family report
            </span>
          </button>
        </div>

        {selected ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-slate-500">Update type override:</span>
            {FAMILY_UPDATE_TYPES.map((ut) => (
              <button
                key={ut}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
                  selected.updateType === ut ? 'bg-teal-600 text-white ring-teal-700' : 'bg-white text-slate-600 ring-slate-200'
                }`}
                onClick={() =>
                  upsertFamilyUpdateInstance(selected.patientId, { updateType: ut, updateTypeLocked: true })
                }
              >
                {ut.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        ) : null}

        <p className="mt-3 text-xs text-slate-500">
          Sources refresh from nursing notes, vital records, medication loop, nutrition/meals, hydration, sleep monitoring,
          rehabilitation loop, mental-health checks, doctor-review queue, AI risk predictions, and AI alerts.
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

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {[
          ["Today's family updates", summaryBlocks.todaysUpdates],
          ['Urgent family communication list', summaryBlocks.urgentList],
          ['Suggested WhatsApp messages', summaryBlocks.suggestedWhatsApp],
          ['Family reassurance draft', summaryBlocks.reassuranceDraft],
          ['Supervisor approval checklist', summaryBlocks.supervisorChecklist],
        ].map(([title, body]) => (
          <Card key={title} padding="p-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <MessagesSquare className="h-4 w-4 text-slate-500" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            </div>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">{body}</pre>
          </Card>
        ))}
      </div>

      <Card className="mb-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Family communication scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Baseline + action bumps + live band tallies from roster drafts</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Up to date', val: scores.upToDate },
            { label: 'Pending', val: scores.pending },
            { label: 'Overdue', val: scores.overdue },
            { label: 'Urgent', val: scores.urgent },
            { label: 'Supervisor review needed', val: scores.supervisorReviewNeeded },
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
              Overdue cadence · urgent channel · doctor-review alignment · rehab milestones · risk escalations
            </p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No automated family-comms alerts on this snapshot.
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
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Family update board</p>
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
              <span className="line-clamp-2 max-w-[118px] text-left">{c.title}</span>
              <span className="ml-1 tabular-nums opacity-80">({buckets[c.key].length})</span>
            </button>
          ))}
        </div>
        <div className="space-y-3 pb-8">
          {buckets[mobileCol].map((row) => (
            <FamilyCard key={row.patientId} row={row} selected={selectedPid === row.patientId} onSelect={setSelectedPid} nowMs={nowMs} />
          ))}
          {buckets[mobileCol].length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-600">
              No cards in this lane.
            </p>
          ) : null}
        </div>
      </div>

      <div className="hidden gap-3 xl:grid xl:grid-cols-5">
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
                <FamilyCard key={row.patientId} row={row} selected={selectedPid === row.patientId} onSelect={setSelectedPid} nowMs={nowMs} />
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
