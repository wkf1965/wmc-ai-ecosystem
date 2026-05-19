import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  BedDouble,
  ClipboardSignature,
  Clock,
  HeartHandshake,
  LayoutList,
  MessageSquare,
  PillBottle,
  Radio,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { Badge, Card } from '../ui'

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 48) return `${Math.floor(h / 24)}d`
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function CountdownLabel({ iso }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000)
    return () => window.clearInterval(id)
  }, [iso])
  const due = new Date(iso || 0).getTime()
  if (!iso || !Number.isFinite(due)) return <span className="text-slate-400">—</span>
  const ms = due - Date.now()
  if (ms <= 0) return <span className="font-semibold text-rose-700">Overdue {fmtDuration(-ms)}</span>
  return <span className="font-semibold text-teal-800">Due in {fmtDuration(ms)}</span>
}

function riskCardClass(level) {
  const lv = String(level || '')
  if (lv === 'Emergency') return 'border-rose-400 bg-rose-50/95 ring-1 ring-rose-200'
  if (lv === 'High') return 'border-orange-400 bg-orange-50/90 ring-1 ring-orange-100'
  if (lv === 'Warning') return 'border-amber-400 bg-amber-50/85 ring-1 ring-amber-100'
  return 'border-slate-200 bg-white'
}

function RiskBadge({ level }) {
  const lv = String(level || '')
  const variant =
    lv === 'Emergency' ? 'danger' : lv === 'High' ? 'danger' : lv === 'Warning' ? 'warning' : 'default'
  return <Badge variant={variant}>{lv || '—'}</Badge>
}

const navItems = [
  { id: 'dash-risk', label: 'Risk alerts', icon: AlertTriangle },
  { id: 'dash-rooms', label: 'Room board', icon: BedDouble },
  { id: 'dash-feed', label: 'Live feed', icon: Radio },
  { id: 'dash-turning', label: 'Turning', icon: ArrowRightLeft },
  { id: 'dash-rehab', label: 'Rehab', icon: Activity },
  { id: 'dash-handover', label: 'Handover', icon: ClipboardSignature },
  { id: 'dash-family', label: 'Family', icon: HeartHandshake },
  { id: 'dash-med', label: 'Medication', icon: PillBottle },
]

function scrollToId(id) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function TelegramDashboardLive({ snapshot, loading, error, onRefresh, pollHint }) {
  if (loading && !snapshot) {
    return (
      <Card padding="p-6" className="border-teal-100 bg-teal-50/40">
        <p className="text-sm text-slate-700">Loading live dashboard snapshot…</p>
      </Card>
    )
  }

  if (error && !snapshot) {
    return (
      <Card padding="p-4" className="border-rose-200 bg-rose-50">
        <p className="text-sm text-rose-900">{error}</p>
        <button type="button" className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold shadow border border-rose-200" onClick={onRefresh}>
          Retry
        </button>
      </Card>
    )
  }

  const emergencies = snapshot?.emergencies ?? []
  const alerts = snapshot?.highRiskAlerts ?? []
  const rooms = snapshot?.roomStatusBoard ?? []
  const feed = snapshot?.telegramLiveFeed ?? []
  const turning = snapshot?.turningSchedule ?? []
  const rehab = snapshot?.rehabTracking ?? { telegram: [], sheetSessions: [] }
  const handover = snapshot?.shiftHandoverSummary ?? {}
  const familyQ = snapshot?.familyUpdateQueue ?? []
  const medObs = snapshot?.medicationObservations ?? []
  const sources = snapshot?.sources ?? {}
  const sheetMeta = sources.googleSheet ?? {}

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <nav
        aria-label="Dashboard sections"
        className="xl:border-teal-100 xl:sticky xl:top-16 xl:w-48 xl:shrink-0 xl:rounded-2xl xl:border xl:bg-white xl:p-3 xl:shadow-sm"
      >
        <p className="mb-2 hidden text-[11px] font-semibold uppercase tracking-wide text-slate-500 xl:block">
          Sections
        </p>
        <ul className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:gap-1 xl:overflow-visible xl:pb-0">
          {navItems.map(({ id, label, icon: Icon }) => (
            <li key={id} className="shrink-0">
              <button
                type="button"
                onClick={() => scrollToId(id)}
                className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-800 shadow-sm hover:border-teal-300 hover:bg-teal-50/60 xl:border-0 xl:shadow-none"
              >
                <Icon className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                {label}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 hidden border-t border-slate-100 pt-3 xl:block">
          <button
            type="button"
            onClick={onRefresh}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh now
          </button>
          {pollHint ? <p className="mt-2 text-[10px] text-slate-500">{pollHint}</p> : null}
        </div>
      </nav>

      <div className="min-w-0 flex-1 space-y-10 scroll-mt-20">
        <div className="flex flex-wrap items-center justify-between gap-2 xl:hidden">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh snapshot
          </button>
          {snapshot?.generatedAt ? (
            <span className="text-[11px] text-slate-500">
              Updated {new Date(snapshot.generatedAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>

        {emergencies.length > 0 ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border-2 border-rose-600 bg-rose-600 px-4 py-3 text-white shadow-lg"
          >
            <Bell className="mt-0.5 h-6 w-6 shrink-0 animate-pulse" aria-hidden />
            <div>
              <p className="text-sm font-bold">Emergency attention — live Telegram risk tier</p>
              <p className="mt-1 text-xs leading-relaxed text-rose-100">
                {emergencies.length} active Emergency-level entr
                {emergencies.length === 1 ? 'y' : 'ies'} in memory. Please notify nurse-in-charge / doctor immediately per
                protocol; verify at bedside.
              </p>
              <ul className="mt-2 list-inside list-disc text-xs text-rose-50">
                {emergencies.slice(0, 6).map((e) => (
                  <li key={e.id}>
                    Room {e.room ?? '—'} · {e.patientName ?? 'Roster name pending'} · {e.categories?.slice(0, 80)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <Card padding="p-4 sm:p-5" className="border-slate-200 bg-slate-50/80">
          <div className="flex flex-wrap items-start gap-3">
            <ShieldAlert className="h-8 w-8 shrink-0 text-teal-600" aria-hidden />
            <div className="min-w-0 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Live data sources</p>
              <ul className="mt-2 space-y-1 text-xs">
                <li>
                  Telegram memory: <strong>{sources.telegramMemoryCount ?? 0}</strong> rows (disk-backed JSON).
                </li>
                <li>
                  Sheet Patientsroom:{' '}
                  {sheetMeta.patientsroom?.ok ? (
                    <strong>{sheetMeta.patientsroom.rowCount} roster rows</strong>
                  ) : (
                    <span className="text-amber-800">
                      unavailable ({sheetMeta.patientsroom?.error || 'set GOOGLE_SHEET_MODE=live'})
                    </span>
                  )}
                </li>
                <li className="text-slate-500">
                  Room board stays empty until the Patientsroom roster loads from Google Sheets; Telegram widgets still update from memory.
                </li>
              </ul>
            </div>
          </div>
        </Card>

        <section id="dash-risk" className="scroll-mt-24 space-y-3">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900">High risk alerts</h2>
            <Badge variant="info">Warning / High / Emergency · severity sorted</Badge>
          </header>
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-600">No elevated-risk Telegram rows in memory.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {alerts.map((a) => (
                <Card key={a.id} padding="p-4" className={riskCardClass(a.riskLevel)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge level={a.riskLevel} />
                    <Badge variant="teal">{a.categories || '—'}</Badge>
                    <span className="text-sm font-semibold text-slate-900">Room {a.room ?? '—'}</span>
                    {a.patientName ? <span className="text-sm text-slate-700">{a.patientName}</span> : null}
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    {a.timestamp ? new Date(a.timestamp).toLocaleString() : '—'}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-900">{a.latestNote}</p>
                  {a.suggestedAction ? (
                    <p className="mt-2 text-xs text-slate-700">
                      <span className="font-semibold">Suggested:</span> {a.suggestedAction}
                    </p>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </section>

        <section id="dash-rooms" className="scroll-mt-24 space-y-3">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
            <BedDouble className="h-5 w-5 text-teal-600" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900">Room status board</h2>
            <Badge variant="info">Roster-only · Sheet + Telegram cues</Badge>
          </header>
          {!snapshot?.rosterAvailable ? (
            <Card padding="p-4" className="border-amber-200 bg-amber-50/80">
              <p className="text-sm text-amber-950">
                No roster loaded — enable <code className="rounded bg-white px-1">GOOGLE_SHEET_MODE=live</code> with{' '}
                <code className="rounded bg-white px-1">GOOGLE_SHEET_WEBHOOK_URL</code> and a populated{' '}
                <strong>Patientsroom</strong> tab.
              </p>
            </Card>
          ) : rooms.length === 0 ? (
            <p className="text-sm text-slate-600">Roster returned zero patient rows.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
              <table className="min-w-[840px] w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Room</th>
                    <th className="px-3 py-2">Patient</th>
                    <th className="px-3 py-2">Mobility</th>
                    <th className="px-3 py-2">Appetite</th>
                    <th className="px-3 py-2">Turning</th>
                    <th className="px-3 py-2">Rehab</th>
                    <th className="px-3 py-2">Fall risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rooms.map((row) => (
                    <tr key={String(row.patientId)} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.room}</td>
                      <td className="px-3 py-2 text-slate-800">{row.patientName}</td>
                      <td className="max-w-[140px] px-3 py-2 text-slate-700">{row.mobility}</td>
                      <td className="max-w-[140px] px-3 py-2 text-slate-700">{row.appetite}</td>
                      <td className="max-w-[120px] px-3 py-2 text-slate-700">{row.turning}</td>
                      <td className="max-w-[120px] px-3 py-2 text-slate-700">{row.rehab}</td>
                      <td className="max-w-[120px] px-3 py-2 text-slate-700">{row.fallRisk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section id="dash-feed" className="scroll-mt-24 space-y-3">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
            <Radio className="h-5 w-5 text-teal-600" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900">Telegram live feed</h2>
            <Badge variant="info">Newest first</Badge>
          </header>
          <div className="space-y-2">
            {feed.length === 0 ? (
              <p className="text-sm text-slate-600">No Telegram memory rows.</p>
            ) : (
              feed.map((row) => (
                <Card key={row.id} padding="p-3 sm:p-4" className="border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default">{row.status || '—'}</Badge>
                    <RiskBadge level={row.riskLevel} />
                    <Badge variant="teal">{row.classification || '—'}</Badge>
                    <span className="text-xs text-slate-500">{new Date(row.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Nurse: <strong>{row.nurseName || '—'}</strong> · Room {row.room ?? '—'}{' '}
                    {row.patientName ? <>· {row.patientName}</> : null}
                  </p>
                  <p className="mt-1 text-sm text-slate-900">{row.nurseInput}</p>
                </Card>
              ))
            )}
          </div>
        </section>

        <section id="dash-turning" className="scroll-mt-24 space-y-3">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
            <ArrowRightLeft className="h-5 w-5 text-teal-600" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900">Turning schedule</h2>
            <Badge variant="info">Roster-linked · q2h from last Telegram turning cue</Badge>
          </header>
          {turning.length === 0 ? (
            <p className="text-sm text-slate-600">
              No turning cues tied to roster patients yet — message keywords turn · reposition · q2h in Telegram.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {turning.map((t) => (
                <Card
                  key={`${t.patientId}-${t.lastTurnDocumentedAt}`}
                  padding="p-4"
                  className={
                    t.missed ? 'border-rose-300 bg-rose-50/90 ring-1 ring-rose-100' : 'border-teal-100 bg-white'
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">Room {t.room ?? '—'}</span>
                    {t.patientName ? <span className="text-sm text-slate-700">{t.patientName}</span> : null}
                    {t.missed ? <Badge variant="danger">Missed window</Badge> : <Badge variant="success">On watch</Badge>}
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Last documented: {t.lastTurnDocumentedAt ? new Date(t.lastTurnDocumentedAt).toLocaleString() : '—'}
                  </p>
                  <p className="mt-2 text-sm font-medium text-teal-900">
                    <Clock className="mr-1 inline h-4 w-4" aria-hidden />
                    <CountdownLabel iso={t.nextDueAt} />
                  </p>
                  <p className="mt-2 text-xs text-slate-700">{t.lastSnippet}</p>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section id="dash-rehab" className="scroll-mt-24 space-y-3">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
            <Activity className="h-5 w-5 text-teal-600" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900">Rehab tracking</h2>
            <Badge variant="info">Telegram PT/OT + Sheet rehab_sessions</Badge>
          </header>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Telegram mobility / OT</h3>
              {rehab.telegram?.length === 0 ? (
                <p className="text-sm text-slate-600">None.</p>
              ) : (
                rehab.telegram.map((r) => (
                  <Card key={r.id} padding="p-3" className="border-slate-100">
                    <p className="text-xs text-slate-500">{new Date(r.timestamp).toLocaleString()}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      Room {r.room ?? '—'} {r.patientName ? `· ${r.patientName}` : ''}
                    </p>
                    <Badge variant="teal" className="mt-1">
                      {r.categories}
                    </Badge>
                    <p className="mt-2 text-xs text-slate-800">{r.summary}</p>
                  </Card>
                ))
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sheet sessions (roster-filtered)
              </h3>
              {!sheetMeta.rehab_sessions?.ok ? (
                <p className="text-sm text-slate-600">
                  Sheet unreadable ({sheetMeta.rehab_sessions?.error || 'offline'}).
                </p>
              ) : rehab.sheetSessions?.length === 0 ? (
                <p className="text-sm text-slate-600">No rehab_sessions rows for roster IDs.</p>
              ) : (
                rehab.sheetSessions.slice(0, 12).map((row, idx) => (
                  <Card key={`rehab-sheet-${idx}`} padding="p-3" className="border-slate-100">
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-800">
                      {JSON.stringify(row).slice(0, 420)}
                    </pre>
                  </Card>
                ))
              )}
            </div>
          </div>
        </section>

        <section id="dash-handover" className="scroll-mt-24 space-y-3">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
            <ClipboardSignature className="h-5 w-5 text-teal-600" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900">Shift handover</h2>
            <Badge variant="info">Auto summary · real patients only</Badge>
          </header>
          <Card padding="p-4" className="border-teal-100 bg-teal-50/40">
            <p className="text-sm font-semibold text-slate-900">{handover.headline}</p>
            {handover.highPriorityPatients?.length > 0 ? (
              <p className="mt-2 text-sm text-slate-800">
                <span className="font-semibold">High-attention patients:</span>{' '}
                {handover.highPriorityPatients.join(', ')}
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No roster-named alerts in the elevated-risk bucket.</p>
            )}
            <p className="mt-2 text-xs text-slate-600">
              Shift_handover sheet rows (count): {handover.sheetShiftHandoverRows ?? 0}
            </p>
          </Card>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-slate-500">Recent handover-tagged Telegram lines</h3>
            {(handover.recentHandoverMessages ?? []).length === 0 ? (
              <p className="text-sm text-slate-600">None.</p>
            ) : (
              handover.recentHandoverMessages.map((m) => (
                <Card key={m.id} padding="p-3" className="border-slate-100">
                  <p className="text-xs text-slate-500">{new Date(m.timestamp).toLocaleString()}</p>
                  <p className="mt-1 text-sm text-slate-900">{m.summary}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Room {m.room ?? '—'} {m.patientName ? `· ${m.patientName}` : ''}
                  </p>
                </Card>
              ))
            )}
          </div>
        </section>

        <section id="dash-family" className="scroll-mt-24 space-y-3">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
            <HeartHandshake className="h-5 w-5 text-teal-600" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900">Family update queue</h2>
            <Badge variant="info">Open items · Telegram memory</Badge>
          </header>
          {familyQ.length === 0 ? (
            <p className="text-sm text-slate-600">No open family-update queue rows.</p>
          ) : (
            familyQ.map((r) => (
              <Card key={r.id} padding="p-4" className="border-sky-100 bg-sky-50/50">
                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                  <span>{new Date(r.timestamp).toLocaleString()}</span>
                  <span className="font-semibold text-slate-900">Room {r.room ?? '—'}</span>
                  {r.patientName ? <span>{r.patientName}</span> : null}
                </div>
                <p className="mt-2 text-sm text-slate-900">{r.snippet}</p>
                {r.draft ? (
                  <p className="mt-2 rounded-lg border border-sky-200 bg-white/90 p-2 text-xs text-sky-950">
                    <span className="font-semibold">Draft log:</span> {r.draft}
                  </p>
                ) : null}
              </Card>
            ))
          )}
        </section>

        <section id="dash-med" className="scroll-mt-24 space-y-3">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
            <PillBottle className="h-5 w-5 text-teal-600" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900">Medication observations</h2>
            <Badge variant="warning">No dosing guidance · escalate clinically</Badge>
          </header>
          <Card padding="p-3" className="border-amber-200 bg-amber-50/70">
            <p className="text-xs text-amber-950">
              Observations only; numeric doses redacted in snapshot text. All medication decisions belong at the bedside /
              pharmacist / prescriber workflow — not this dashboard.
            </p>
          </Card>
          {medObs.length === 0 ? (
            <p className="text-sm text-slate-600">No medication-tagged Telegram rows or Sheet medication_notes.</p>
          ) : (
            <div className="space-y-2">
              {medObs.map((m, i) => (
                <Card key={`${m.source}-${m.id}-${i}`} padding="p-3" className="border-slate-100">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant={m.source === 'telegram' ? 'info' : 'default'}>{m.source}</Badge>
                    <span className="text-slate-500">{m.timestamp ? String(m.timestamp) : '—'}</span>
                    <span className="font-semibold text-slate-900">Room {m.room ?? '—'}</span>
                    {m.patientName ? <span>{m.patientName}</span> : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-900">{m.text}</p>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <LayoutList className="h-4 w-4" aria-hidden />
          <span>
            Snapshot <code className="rounded bg-slate-100 px-1">GET /api/integrations/telegram/dashboard</code> ·{' '}
            <MessageSquare className="inline h-3 w-3" aria-hidden /> Telegram JSON + optional Sheets
          </span>
          {snapshot?.generatedAt ? <span className="ml-auto">{new Date(snapshot.generatedAt).toISOString()}</span> : null}
        </section>
      </div>
    </div>
  )
}
