import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  BedDouble,
  ClipboardList,
  Download,
  Dumbbell,
  LayoutGrid,
  MessageSquare,
  PillBottle,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  Timer,
  UserCircle,
  UtensilsCrossed,
  Users,
} from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { AppErrorBoundary } from '../components/AppErrorBoundary.jsx'
import { useTelegramDashboardSnapshot } from '../hooks/useTelegramDashboardSnapshot'
import TelegramDashboardLive from '../components/telegram-dashboard/TelegramDashboardLive'

const MEMORY_API = '/api/integrations/telegram/nursing-memory'

function rowDashboardCategories(row) {
  if (Array.isArray(row.dashboardCategories) && row.dashboardCategories.length > 0) {
    return row.dashboardCategories.map((x) => String(x))
  }
  return String(row.categories || '')
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean)
}

function rowMatchesCategory(row, needle) {
  return rowDashboardCategories(row).some((c) => c.includes(needle))
}

function isHighRisk(row) {
  const s = Number(row.riskScore) || 0
  const lv = String(row.riskLevel || '')
  return s >= 55 || ['Warning', 'High', 'Emergency', 'Critical'].includes(lv)
}

function needsDoctorReview(row) {
  return (
    row.primaryLoop === 'doctor_review' ||
    String(row.categories || '').includes('Emergency') ||
    String(row.categories || '').includes('Doctor review') ||
    row.escalatedToDoctor ||
    isHighRisk(row)
  )
}

function nutritionRisk(row) {
  return row.primaryLoop === 'nutrition' || rowMatchesCategory(row, 'Nutrition')
}

function rehabRisk(row) {
  return row.primaryLoop === 'rehabilitation' || rowMatchesCategory(row, 'Mobility')
}

function medicationRisk(row) {
  return row.primaryLoop === 'medication' || rowMatchesCategory(row, 'Medication')
}

function turningReminder(row) {
  const t = `${row.originalMessage || ''} ${row.symptoms || ''}`.toLowerCase()
  return /\bturn\b|reposition|q2h|q\s*2\s*h|lateral|pressure\s+relief|every\s+2\s+hours/.test(t)
}

function otRelated(row) {
  const t = `${row.originalMessage || ''} ${row.categories || ''}`.toLowerCase()
  return /\bot\b|occupational\s+therapy|ot\s+session|ot\s+report/.test(t)
}

function shiftHandoverRow(row) {
  return (
    rowMatchesCategory(row, 'Shift Handover') ||
    /\bhandover\b|shift\s+report|change\s+of\s+shift|end\s+of\s+shift/i.test(row.originalMessage || '')
  )
}

function familyUpdateRow(row) {
  return rowMatchesCategory(row, 'Family Update')
}

function followUpQueue(rows) {
  return rows.filter((r) => r.status !== 'completed')
}

function startOfLocalDayMs(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}

function isToday(ts) {
  if (!ts) return false
  const t = new Date(ts).getTime()
  const day = startOfLocalDayMs()
  return t >= day && t < day + 86400000
}

function buildFamilyDraft(row) {
  const who = row.patientName || (row.room ? `resident in Room ${row.room}` : 'your loved one')
  const focus = row.categories || 'care update'
  return (
    `Draft family SMS — Re: ${who} (${focus}). ` +
    `Staff reviewed the Telegram report and are addressing: ${String(row.suggestedAction || 'follow-up per unit protocol').slice(0, 160)}. ` +
    `This draft is non-clinical wording only; verify facts at the bedside. Call the nursing desk for clinical detail.`
  )
}

function topSuggestedActions(rows, n = 3) {
  const counts = new Map()
  for (const r of rows) {
    const a = String(r.suggestedAction || '').trim()
    if (!a) continue
    const key = a.length > 120 ? `${a.slice(0, 117)}…` : a
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([text, count]) => ({ text, count }))
}

const btnGhost =
  'rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50'
const btnPrimary =
  'rounded-xl bg-teal-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-45'
const btnRose =
  'rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100'

function MemoryRowCard({ row, onPatch, busyId }) {
  const busy = busyId === row.id
  return (
    <Card padding="p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={row.status === 'completed' ? 'success' : row.status === 'acknowledged' ? 'info' : 'warning'}>
              {row.status}
            </Badge>
            <Badge variant={isHighRisk(row) ? 'danger' : 'default'}>{row.riskLevel}</Badge>
            <Badge variant="teal">{row.categories}</Badge>
            {row.room ? (
              <span className="text-sm font-semibold text-slate-900">Room {row.room}</span>
            ) : (
              <span className="text-sm text-slate-500">Room —</span>
            )}
            {row.patientName ? <span className="text-sm text-slate-600">{row.patientName}</span> : null}
            {row.nurseName ? (
              <Badge variant="default" className="font-normal">
                Nurse: {row.nurseName}
              </Badge>
            ) : null}
            {row.escalatedToDoctor ? <Badge variant="danger">MD flagged</Badge> : null}
          </div>
          {row.symptoms ? (
            <p className="text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Symptoms / cues:</span> {row.symptoms}
            </p>
          ) : null}
          <p className="text-sm leading-relaxed text-slate-800">{row.originalMessage}</p>
          <p className="text-xs text-slate-500">
            Score {row.riskScore ?? '—'} · Chat {row.chatId ?? '—'} ·{' '}
            {row.timestamp ? new Date(row.timestamp).toLocaleString() : '—'}
          </p>
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Action:</span> {row.suggestedAction || '—'}
          </p>
          {row.familyUpdateDraft ? (
            <div className="rounded-xl border border-sky-100 bg-sky-50/80 p-3 text-xs text-sky-950">
              <span className="font-semibold">Family draft:</span> {row.familyUpdateDraft}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 lg:items-end">
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button type="button" disabled={busy} className={btnGhost} onClick={() => onPatch(row.id, { status: 'acknowledged' })}>
              Mark acknowledged
            </button>
            <button type="button" disabled={busy} className={btnPrimary} onClick={() => onPatch(row.id, { status: 'completed' })}>
              Mark completed
            </button>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button type="button" disabled={busy} className={btnRose} onClick={() => onPatch(row.id, { escalatedToDoctor: true })}>
              Escalate to doctor
            </button>
            <button
              type="button"
              disabled={busy}
              className={btnGhost}
              onClick={() => onPatch(row.id, { familyUpdateDraft: buildFamilyDraft(row) })}
            >
              Generate family update
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function Section({ title, icon: Icon, subtitle, children }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
        <Icon className="h-5 w-5 text-teal-600" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export default function TelegramNursingDashboardPage() {
  const [records, setRecords] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [selectedPatientName, setSelectedPatientName] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${MEMORY_API}?limit=500`)
      const j = await r.json()
      if (j.ok && Array.isArray(j.records)) {
        setRecords(j.records)
        setLoadError(null)
      } else {
        setLoadError(j.error || 'Unable to load nursing memory')
      }
    } catch (e) {
      setLoadError(String(e?.message || e))
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      load()
    }, 0)
    const id = window.setInterval(() => load(), 45_000)
    return () => {
      window.clearTimeout(t)
      window.clearInterval(id)
    }
  }, [load])

  const onPatch = useCallback(async (id, patch) => {
    setBusyId(id)
    try {
      const r = await fetch(MEMORY_API, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      const j = await r.json()
      if (j.ok && j.record) {
        setRecords((prev) => prev.map((x) => (x.id === id ? j.record : x)))
      }
    } finally {
      setBusyId(null)
    }
  }, [])

  const summary = useMemo(() => {
    const todayCount = records.filter((r) => isToday(r.timestamp)).length
    const highRisk = records.filter(isHighRisk).length
    const followRooms = new Set(
      followUpQueue(records)
        .map((r) => r.room)
        .filter(Boolean),
    ).size
    const topActs = topSuggestedActions(records, 3)
    return { todayCount, highRisk, followRooms, topActs }
  }, [records])

  const latest = useMemo(() => records.slice(0, 25), [records])
  const highRiskRows = useMemo(() => records.filter(isHighRisk).slice(0, 20), [records])
  const nutritionRows = useMemo(() => records.filter(nutritionRisk).slice(0, 15), [records])
  const rehabRows = useMemo(() => records.filter(rehabRisk).slice(0, 15), [records])
  const medRows = useMemo(() => records.filter(medicationRisk).slice(0, 15), [records])
  const doctorRows = useMemo(() => records.filter(needsDoctorReview).slice(0, 20), [records])
  const queueRows = useMemo(() => followUpQueue(records).slice(0, 30), [records])

  const todayRows = useMemo(() => records.filter((r) => isToday(r.timestamp)), [records])

  const roomDirectory = useMemo(() => {
    const m = new Map()
    for (const r of records) {
      const room = r.room != null && String(r.room).trim() !== '' ? String(r.room).trim() : null
      if (!room) continue
      m.set(room, (m.get(room) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }),
    )
  }, [records])

  const patientsForRoom = useMemo(() => {
    if (!selectedRoom) return []
    const names = new Set()
    for (const r of records) {
      if (String(r.room || '') !== selectedRoom) continue
      if (r.patientName && String(r.patientName).trim()) names.add(String(r.patientName).trim())
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [records, selectedRoom])

  const profileRows = useMemo(() => {
    if (!selectedRoom) return []
    return records.filter((r) => {
      if (String(r.room || '') !== selectedRoom) return false
      if (selectedPatientName && String(r.patientName || '') !== selectedPatientName) return false
      return true
    })
  }, [records, selectedRoom, selectedPatientName])

  const turningRows = useMemo(() => records.filter(turningReminder).slice(0, 25), [records])
  const otRowsFiltered = useMemo(() => records.filter(otRelated).slice(0, 25), [records])
  const handoverRows = useMemo(() => records.filter(shiftHandoverRow).slice(0, 30), [records])
  const familyRowsFiltered = useMemo(() => records.filter(familyUpdateRow).slice(0, 30), [records])

  const { snapshot: liveSnap, error: liveError, loading: liveLoading, refetch: refetchLive } =
    useTelegramDashboardSnapshot(12_000)

  function exportSummary() {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `telegram-nursing-memory-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-[1200px] pb-10">
      <PageHeader
        title="WMC AI Nursing Telegram Dashboard"
        description="Telegram nurse messages flow through webhook → roster verification (Google Sheet) → structured memory + optional Sheet tabs (nursing_notes, risk_alerts, rehab_tracking, shift_handover, family_updates, ot_report, turning_schedule, medication_notes). Patient names appear only when matched to your roster."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Memory file: telegram-nursing-memory.json</Badge>
            <button type="button" className={btnGhost} onClick={() => load()}>
              <RefreshCw className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Refresh
            </button>
            <button type="button" className={btnPrimary} onClick={exportSummary}>
              <Download className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Export summary
            </button>
          </div>
        }
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 ring-1 ring-amber-100">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
        <p>
          <strong>No fabricated residents:</strong> Names and rooms come from matched Sheet roster rows only. Unmatched
          messages still store the raw Telegram text for audit. Local memory is written when webhooks hit Vite (dev) or{' '}
          <code className="rounded bg-white/80 px-1">npm run telegram</code>. PATCH updates require the same origin API.
          Google Sheets POST stays off while{' '}
          <code className="rounded bg-white/80 px-1">GOOGLE_SHEET_MODE=simulation</code>.
        </p>
      </div>

      {loadError ? (
        <Card className="mb-4 border-rose-200 bg-rose-50" padding="p-4">
          <p className="text-sm text-rose-900">{loadError}</p>
        </Card>
      ) : null}

      <AppErrorBoundary>
        <TelegramDashboardLive
          snapshot={liveSnap}
          loading={liveLoading}
          error={liveError}
          onRefresh={refetchLive}
          pollHint="Auto-refresh every 12s while this page is open."
        />
      </AppErrorBoundary>

      <Card className="mb-6 border-teal-100 bg-gradient-to-br from-teal-50/90 to-white" padding="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <LayoutGrid className="h-8 w-8 shrink-0 text-teal-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">AI-style ward summary (Telegram channel)</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-teal-100 bg-white/90 px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Messages today</dt>
                <dd className="mt-1 text-2xl font-bold text-slate-900">{summary.todayCount}</dd>
              </div>
              <div className="rounded-xl border border-teal-100 bg-white/90 px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">High risk cases</dt>
                <dd className="mt-1 text-2xl font-bold text-rose-700">{summary.highRisk}</dd>
              </div>
              <div className="rounded-xl border border-teal-100 bg-white/90 px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rooms needing follow-up</dt>
                <dd className="mt-1 text-2xl font-bold text-slate-900">{summary.followRooms}</dd>
              </div>
              <div className="rounded-xl border border-teal-100 bg-white/90 px-3 py-2 sm:col-span-2 lg:col-span-1">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Top suggested actions</dt>
                <dd className="mt-1 space-y-1 text-xs text-slate-700">
                  {summary.topActs.length === 0 ? (
                    <span className="text-slate-500">No actions yet.</span>
                  ) : (
                    summary.topActs.map((x, i) => (
                      <div key={x.text}>
                        <span className="font-semibold text-teal-800">{i + 1}.</span> {x.text}{' '}
                        <span className="text-slate-400">({x.count}×)</span>
                      </div>
                    ))
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>

      <div className="grid gap-8 lg:grid-cols-[minmax(220px,280px)_1fr] lg:items-start">
        <aside className="space-y-4 lg:sticky lg:top-4">
          <Card padding="p-4">
            <div className="mb-3 flex items-center gap-2">
              <BedDouble className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
              <h2 className="text-sm font-semibold text-slate-900">Room list</h2>
            </div>
            {roomDirectory.length === 0 ? (
              <p className="text-xs leading-relaxed text-slate-600">
                No rooms in memory yet. After Telegram messages match your Sheet roster, room numbers appear here.
              </p>
            ) : (
              <ul className="flex max-h-[min(40vh,320px)] flex-col gap-1 overflow-y-auto pr-0.5">
                {roomDirectory.map(([room, count]) => (
                  <li key={room}>
                    <button
                      type="button"
                      className={`w-full rounded-lg px-2 py-2 text-left text-xs font-semibold transition-colors ${
                        selectedRoom === room
                          ? 'bg-teal-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                      }`}
                      onClick={() => {
                        setSelectedRoom(room)
                        setSelectedPatientName(null)
                      }}
                    >
                      Room {room}{' '}
                      <span className={selectedRoom === room ? 'font-normal text-teal-100' : 'font-normal text-slate-500'}>
                        ({count})
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedRoom ? (
              <button
                type="button"
                className={`mt-3 w-full ${btnGhost}`}
                onClick={() => {
                  setSelectedRoom(null)
                  setSelectedPatientName(null)
                }}
              >
                Clear room filter
              </button>
            ) : null}
          </Card>

          <Card padding="p-4">
            <div className="mb-3 flex items-center gap-2">
              <UserCircle className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
              <h2 className="text-sm font-semibold text-slate-900">Patient profile</h2>
            </div>
            {!selectedRoom ? (
              <p className="text-xs leading-relaxed text-slate-600">
                Select a room to filter Telegram updates by roster-resolved patients in that room.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600">
                  Room <span className="font-semibold text-slate-900">{selectedRoom}</span>
                  {selectedPatientName ? (
                    <>
                      {' · '}
                      <span className="font-semibold text-slate-900">{selectedPatientName}</span>
                    </>
                  ) : (
                    <span> · all roster-matched patients</span>
                  )}
                </p>
                {patientsForRoom.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={`${btnGhost} !py-1 text-[11px]`}
                      onClick={() => setSelectedPatientName(null)}
                    >
                      All patients
                    </button>
                    {patientsForRoom.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className={`rounded-lg px-2 py-1 text-[11px] font-semibold shadow-sm transition-colors ${
                          selectedPatientName === name
                            ? 'bg-teal-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                        onClick={() => setSelectedPatientName(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-900">
                    No roster-linked patient name recorded for this room in Telegram memory yet.
                  </p>
                )}
                <p className="text-xs text-slate-600">
                  Matching updates: <span className="font-semibold text-slate-900">{profileRows.length}</span>
                </p>
              </div>
            )}
          </Card>
        </aside>

        <div className="min-w-0 space-y-10">
        <Section
          title="Today's patient updates"
          icon={ClipboardList}
          subtitle="Local calendar day · roster-linked rows preferred"
        >
          {todayRows.length === 0 ? (
            <p className="text-sm text-slate-600">No Telegram updates stamped for today.</p>
          ) : (
            todayRows.map((row) => <MemoryRowCard key={row.id} row={row} onPatch={onPatch} busyId={busyId} />)
          )}
        </Section>

        <Section
          title="Filtered chart (room / patient)"
          icon={LayoutGrid}
          subtitle="Refine main feed using the sidebar — same cards as below"
        >
          {!selectedRoom ? (
            <p className="text-sm text-slate-600">Choose a room on the left to show only those Telegram rows.</p>
          ) : profileRows.length === 0 ? (
            <p className="text-sm text-slate-600">No rows match this room / patient filter.</p>
          ) : (
            profileRows.map((row) => <MemoryRowCard key={row.id} row={row} onPatch={onPatch} busyId={busyId} />)
          )}
        </Section>

        <Section title="Latest Telegram nurse notes" icon={MessageSquare} subtitle="Newest first · full feed">
          {latest.length === 0 ? (
            <p className="text-sm text-slate-600">No Telegram rows yet — POST a webhook or use Telegram Test.</p>
          ) : (
            latest.map((row) => <MemoryRowCard key={row.id} row={row} onPatch={onPatch} busyId={busyId} />)
          )}
        </Section>

        <Section title="High risk alerts" icon={AlertTriangle} subtitle="Risk Warning / High / Emergency or score ≥ 55">
          {highRiskRows.length === 0 ? (
            <p className="text-sm text-slate-600">None in memory.</p>
          ) : (
            highRiskRows.map((row) => <MemoryRowCard key={row.id} row={row} onPatch={onPatch} busyId={busyId} />)
          )}
        </Section>

        <Section title="Nutrition risks" icon={UtensilsCrossed} subtitle="Category cues or nutrition loop">
          {nutritionRows.length === 0 ? (
            <p className="text-sm text-slate-600">None flagged.</p>
          ) : (
            nutritionRows.map((row) => <MemoryRowCard key={row.id} row={row} onPatch={onPatch} busyId={busyId} />)
          )}
        </Section>

        <Section title="Rehabilitation risks" icon={Dumbbell} subtitle="Mobility / rehab loop signals">
          {rehabRows.length === 0 ? (
            <p className="text-sm text-slate-600">None flagged.</p>
          ) : (
            rehabRows.map((row) => <MemoryRowCard key={row.id} row={row} onPatch={onPatch} busyId={busyId} />)
          )}
        </Section>

        <Section title="Medication risks" icon={PillBottle} subtitle="MAR / medication loop">
          {medRows.length === 0 ? (
            <p className="text-sm text-slate-600">None flagged.</p>
          ) : (
            medRows.map((row) => <MemoryRowCard key={row.id} row={row} onPatch={onPatch} busyId={busyId} />)
          )}
        </Section>

        <Section title="Turning reminders" icon={ArrowRightLeft} subtitle="Keywords: turn · reposition · q2h · pressure relief">
          {turningRows.length === 0 ? (
            <p className="text-sm text-slate-600">No turning cues detected in stored messages.</p>
          ) : (
            turningRows.map((row) => <MemoryRowCard key={row.id} row={row} onPatch={onPatch} busyId={busyId} />)
          )}
        </Section>

        <Section title="OT report queue" icon={Timer} subtitle="Occupational therapy / OT wording in Telegram text">
          {otRowsFiltered.length === 0 ? (
            <p className="text-sm text-slate-600">No OT-tagged rows.</p>
          ) : (
            otRowsFiltered.map((row) => <MemoryRowCard key={row.id} row={row} onPatch={onPatch} busyId={busyId} />)
          )}
        </Section>

        <Section title="Doctor review needed" icon={Stethoscope} subtitle="Doctor-review loop, escalation flag, or high risk band">
          {doctorRows.length === 0 ? (
            <p className="text-sm text-slate-600">None flagged.</p>
          ) : (
            doctorRows.map((row) => <MemoryRowCard key={row.id} row={row} onPatch={onPatch} busyId={busyId} />)
          )}
        </Section>

        <Section title="Follow-up queue" icon={ClipboardList} subtitle="Items not marked completed">
          {queueRows.length === 0 ? (
            <p className="text-sm text-slate-600">Queue is clear.</p>
          ) : (
            queueRows.map((row) => <MemoryRowCard key={row.id} row={row} onPatch={onPatch} busyId={busyId} />)
          )}
        </Section>

        <Section title="Shift handover summary" icon={MessageSquare} subtitle="Handover phrases or Shift Handover category">
          {handoverRows.length === 0 ? (
            <p className="text-sm text-slate-600">No shift handover rows.</p>
          ) : (
            handoverRows.map((row) => <MemoryRowCard key={row.id} row={row} onPatch={onPatch} busyId={busyId} />)
          )}
        </Section>

        <Section title="Family update log" icon={Users} subtitle="Family Update category or family-contact wording">
          {familyRowsFiltered.length === 0 ? (
            <p className="text-sm text-slate-600">No family-update rows.</p>
          ) : (
            familyRowsFiltered.map((row) => <MemoryRowCard key={row.id} row={row} onPatch={onPatch} busyId={busyId} />)
          )}
        </Section>

        <Section title="Sheet routing reference" icon={Users} subtitle="Apps Script deployment">
          <Card padding="p-4">
            <p className="text-sm text-slate-700">
              Total rows in local memory: <strong>{records.length}</strong>. Live POST targets mirror{' '}
              <code className="rounded bg-slate-100 px-1">telegramSheetRouting.mjs</code>
              : nursing_notes, risk_alerts, ai_risks (legacy), rehab_tracking, shift_handover, family_updates,
              ot_report, turning_schedule, medication, medication_notes, nutrition, fall_risk, infection,
              doctor_review. Master <strong>patients</strong> tab is loaded for roster match only — Telegram does not
              fabricate patient rows.
            </p>
          </Card>
        </Section>
      </div>
      </div>
    </div>
  )
}
