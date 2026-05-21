import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Apple,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Footprints,
  GitBranch,
  Heart,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Minus,
  Users,
  ClipboardList,
  Thermometer,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useTelegramDashboardSnapshot } from '../hooks/useTelegramDashboardSnapshot.js'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import { analyzeAllPatientsFromNotes } from '../lib/aiRiskDetection.js'
import { runTimelinePipeline } from '../lib/patientTimelineMemory.js'
import { runHandoverPipeline } from '../lib/shiftHandoverEngine.js'

// ─── Constants ────────────────────────────────────────────────────────────────
const AUTO_REFRESH_MS = 10_000

// ─── Helpers ──────────────────────────────────────────────────────────────────
function riskColor(level) {
  const l = String(level || '').toLowerCase()
  if (l === 'critical' || l === 'emergency') return 'critical'
  if (l === 'high') return 'high'
  if (l === 'warning' || l === 'moderate') return 'moderate'
  return 'low'
}

function scoreToColor(score) {
  const s = Number(score)
  if (s >= 81) return 'critical'
  if (s >= 51) return 'high'
  if (s >= 21) return 'moderate'
  return 'low'
}

const COLOR_CLASSES = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-800 ring-1 ring-red-200',
    dot: 'bg-red-500',
    text: 'text-red-700',
    bar: 'bg-red-400',
    icon: 'text-red-500',
    glow: 'shadow-red-100',
  },
  high: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    badge: 'bg-orange-100 text-orange-800 ring-1 ring-orange-200',
    dot: 'bg-orange-500',
    text: 'text-orange-700',
    bar: 'bg-orange-400',
    icon: 'text-orange-500',
    glow: 'shadow-orange-100',
  },
  moderate: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
    dot: 'bg-amber-400',
    text: 'text-amber-700',
    bar: 'bg-amber-400',
    icon: 'text-amber-500',
    glow: 'shadow-amber-100',
  },
  low: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
    dot: 'bg-emerald-400',
    text: 'text-emerald-700',
    bar: 'bg-emerald-400',
    icon: 'text-emerald-500',
    glow: 'shadow-emerald-100',
  },
}

function RiskBadge({ level, score, className = '' }) {
  const key = score != null ? scoreToColor(score) : riskColor(level)
  const cl = COLOR_CLASSES[key]
  const label = score != null ? `Score ${score}` : (level || 'N/A')
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cl.badge} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cl.dot}`} />
      {label}
    </span>
  )
}

function ScoreBar({ score, max = 120 }) {
  const s = Math.min(Number(score) || 0, max)
  const pct = Math.round((s / max) * 100)
  const key = scoreToColor(s)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full transition-all ${COLOR_CLASSES[key].bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${COLOR_CLASSES[key].text}`}>{s}</span>
    </div>
  )
}

function SectionCard({ title, icon: Icon, iconColor = 'text-slate-500', count, children, defaultOpen = true, badge, id }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section id={id} className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-t-2xl px-5 py-4 text-left hover:bg-slate-50/60"
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon className={`h-4 w-4 ${iconColor}`} aria-hidden />}
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          {count != null && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {count}
            </span>
          )}
          {badge}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="border-t border-slate-100 px-5 pb-5 pt-4">{children}</div>}
    </section>
  )
}

function KpiCard({ label, value, icon: Icon, colorKey = 'low', sub }) {
  const cl = COLOR_CLASSES[colorKey]
  return (
    <div className={`rounded-2xl border p-4 ${cl.bg} ${cl.border} shadow-sm ${cl.glow}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        {Icon && <Icon className={`h-4 w-4 ${cl.icon}`} aria-hidden />}
      </div>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${cl.text}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

function TrendIcon({ trend }) {
  if (trend === 'deteriorating' || trend === 'critical_ongoing') return <TrendingDown className="h-4 w-4 text-red-500" />
  if (trend === 'improving') return <TrendingUp className="h-4 w-4 text-emerald-500" />
  return <Minus className="h-4 w-4 text-slate-400" />
}

function fmtTime(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true })
  } catch { return '—' }
}
function fmtDateTime(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('en-MY', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch { return '—' }
}
function timeAgo(ts) {
  if (!ts) return ''
  const ms = Date.now() - new Date(ts).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function Empty({ text = 'No data yet.' }) {
  return <p className="py-4 text-center text-sm text-slate-400">{text}</p>
}

// ─── Section 1: Critical Alerts ───────────────────────────────────────────────
function CriticalAlertsSection({ emergencies, highRiskAlerts }) {
  const criticals = useMemo(() => {
    const em = (emergencies || []).map((a) => ({ ...a, _tier: 'Emergency' }))
    const hi = (highRiskAlerts || [])
      .filter((a) => Number(a.riskScore) >= 81 && !em.some((e) => e.id === a.id))
      .map((a) => ({ ...a, _tier: 'Critical' }))
    return [...em, ...hi]
  }, [emergencies, highRiskAlerts])

  return (
    <SectionCard
      id="critical-alerts"
      title="Critical Alerts"
      icon={ShieldAlert}
      iconColor="text-red-500"
      count={criticals.length}
      defaultOpen
      badge={
        criticals.length > 0 ? (
          <span className="ml-1 inline-flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
        ) : null
      }
    >
      {criticals.length === 0 ? (
        <Empty text="No critical alerts at this time." />
      ) : (
        <div className="space-y-3">
          {criticals.map((a) => (
            <div key={a.id || a.patientId} className="rounded-xl border border-red-100 bg-red-50 p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />
                    <p className="text-sm font-bold text-red-900">
                      Room {a.room ?? '—'} — {a.patientName ?? 'Unknown'}
                    </p>
                  </div>
                  {a.latestNote && (
                    <p className="mt-1 text-xs text-red-700 line-clamp-2">{a.latestNote}</p>
                  )}
                  {a.suggestedAction && (
                    <p className="mt-1 text-xs font-medium text-red-800">→ {a.suggestedAction}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <RiskBadge level={a._tier} score={a.riskScore} />
                  <span className="text-[11px] text-slate-400">{timeAgo(a.timestamp)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ─── Section 2: High Risk Patients ────────────────────────────────────────────
function HighRiskPatientsSection({ highRiskAlerts, patientAnalysis }) {
  const rows = useMemo(() => {
    const fromAlerts = (highRiskAlerts || []).map((a) => ({
      key: a.id || a.patientId,
      room: a.room,
      name: a.patientName,
      score: Number(a.riskScore) || 0,
      level: a.riskLevel,
      categories: a.categories,
      ts: a.timestamp,
    }))

    // Merge with local AI analysis
    const fromLocal = (patientAnalysis || [])
      .filter((e) => e.overallScore >= 21 && e.patientName !== 'Unknown')
      .map((e) => ({
        key: `local-${e.patientId}`,
        room: null,
        name: e.patientName,
        score: e.overallScore,
        level: e.overallScore >= 81 ? 'Critical' : e.overallScore >= 51 ? 'High' : 'Moderate',
        categories: (e.categories || []).map((c) => c.label).join(', '),
        ts: e.lastNoteDate,
      }))
      .filter((l) => !fromAlerts.some((a) => a.name === l.name))

    return [...fromAlerts, ...fromLocal].sort((a, b) => b.score - a.score)
  }, [highRiskAlerts, patientAnalysis])

  // Build mini trend chart data from last 10 entries (score by time)
  const chartData = useMemo(() =>
    rows.slice(0, 8).map((r, i) => ({ name: r.room ? `R${r.room}` : `P${i + 1}`, score: r.score })),
  [rows])

  return (
    <SectionCard
      id="high-risk"
      title="High Risk Patients"
      icon={Heart}
      iconColor="text-orange-500"
      count={rows.length}
      defaultOpen
    >
      {rows.length === 0 ? (
        <Empty text="No high-risk patients detected." />
      ) : (
        <>
          <div className="mb-4 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 120]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(v) => [`Score: ${v}`, '']}
                />
                <Area type="monotone" dataKey="score" stroke="#f97316" fill="url(#riskGrad)" strokeWidth={2} dot={{ r: 3, fill: '#f97316' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {rows.map((r) => {
              const cl = COLOR_CLASSES[scoreToColor(r.score)]
              return (
                <div key={r.key} className={`rounded-xl border p-3 ${cl.bg} ${cl.border}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {r.room ? <span className="mr-1 text-slate-500">Room {r.room} —</span> : null}
                        {r.name ?? 'Unknown'}
                      </p>
                      {r.categories && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">{r.categories}</p>
                      )}
                    </div>
                    <RiskBadge level={r.level} score={r.score} />
                  </div>
                  <div className="mt-2">
                    <ScoreBar score={r.score} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </SectionCard>
  )
}

// ─── Section 3: Recent Nursing Notes ─────────────────────────────────────────
function RecentNotesSection({ telegramLiveFeed, notes }) {
  const items = useMemo(() => {
    const tg = (telegramLiveFeed || []).slice(0, 8).map((r) => ({
      key: r.id,
      ts: r.timestamp,
      nurse: r.nurseName,
      room: r.room,
      patient: r.patientName,
      note: r.nurseInput,
      category: r.classification,
      level: r.riskLevel,
      source: 'telegram',
    }))

    const local = (notes || [])
      .slice()
      .sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')))
      .slice(0, 5)
      .map((n) => ({
        key: n.id,
        ts: n.createdAt || n.date,
        nurse: n.author,
        room: null,
        patient: n.patientNameSnapshot,
        note: n.nurseRemarks || n.abnormalEvents,
        category: null,
        level: null,
        source: 'local',
      }))
      .filter((l) => !tg.some(() => false))

    return [...tg, ...local].slice(0, 10)
  }, [telegramLiveFeed, notes])

  return (
    <SectionCard
      id="recent-notes"
      title="Recent Nursing Notes"
      icon={ClipboardList}
      iconColor="text-sky-500"
      count={items.length}
      defaultOpen={false}
    >
      {items.length === 0 ? (
        <Empty text="No nursing notes recorded yet." />
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div key={item.key} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.room && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                        Room {item.room}
                      </span>
                    )}
                    {item.patient && item.patient !== 'Unknown' && (
                      <span className="text-xs font-medium text-slate-700">{item.patient}</span>
                    )}
                    {item.nurse && (
                      <span className="text-[11px] text-slate-400">· {item.nurse}</span>
                    )}
                    {item.source === 'telegram' && (
                      <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 ring-1 ring-sky-100">
                        Telegram
                      </span>
                    )}
                  </div>
                  {item.note && (
                    <p className="mt-1 text-xs text-slate-600 line-clamp-2">{item.note}</p>
                  )}
                  {item.category && (
                    <p className="mt-0.5 text-[11px] text-slate-400">{item.category}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {item.level && <RiskBadge level={item.level} />}
                  <span className="text-[11px] text-slate-400">{fmtTime(item.ts)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ─── Section 4: Fall Risk Panel ───────────────────────────────────────────────
function FallRiskSection({ highRiskAlerts, roomStatusBoard }) {
  const rows = useMemo(() => {
    const fromAlerts = (highRiskAlerts || [])
      .filter((a) => /fall/i.test(a.categories || ''))
      .map((a) => ({
        key: a.id || a.patientId,
        room: a.room,
        name: a.patientName,
        status: 'Telegram fall-risk cue',
        score: a.riskScore,
        ts: a.timestamp,
      }))

    const fromBoard = (roomStatusBoard || [])
      .filter((r) => r.fallRisk && r.fallRisk !== '—')
      .map((r) => ({
        key: `board-${r.patientId}`,
        room: r.room,
        name: r.patientName,
        status: r.fallRisk,
        score: null,
        ts: r.lastTelegramAt,
      }))
      .filter((b) => !fromAlerts.some((a) => a.room === b.room && a.name === b.name))

    return [...fromAlerts, ...fromBoard]
  }, [highRiskAlerts, roomStatusBoard])

  return (
    <SectionCard
      id="fall-risk"
      title="Fall Risk Panel"
      icon={Footprints}
      iconColor="text-purple-500"
      count={rows.length}
      defaultOpen
    >
      {rows.length === 0 ? (
        <Empty text="No fall-risk patients flagged." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="pb-2 text-xs font-semibold text-slate-500">Room</th>
                <th className="pb-2 text-xs font-semibold text-slate-500">Patient</th>
                <th className="pb-2 text-xs font-semibold text-slate-500">Status</th>
                <th className="pb-2 text-xs font-semibold text-slate-500 text-right">Last Event</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-2 pr-3 font-semibold text-slate-900">{r.room ?? '—'}</td>
                  <td className="py-2 pr-3 text-slate-700">{r.name ?? 'Unknown'}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-800 ring-1 ring-purple-100">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                      {String(r.status).slice(0, 40)}
                    </span>
                  </td>
                  <td className="py-2 text-right text-xs text-slate-400">{timeAgo(r.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}

// ─── Section 5: Nutrition Monitoring ─────────────────────────────────────────
function NutritionSection({ highRiskAlerts, roomModuleBoard }) {
  const rows = useMemo(() => {
    const fromAlerts = (highRiskAlerts || [])
      .filter((a) => /nutrition|appetite|meal/i.test(a.categories || ''))
      .map((a) => ({
        key: a.id,
        room: a.room,
        name: a.patientName,
        appetite: 'Nutrition risk flagged via Telegram',
        score: a.riskScore,
        ts: a.timestamp,
      }))

    const fromBoard = (roomModuleBoard || [])
      .filter((r) => r.appetiteStatus && r.appetiteStatus !== '—')
      .map((r) => ({
        key: `board-${r.patientId}`,
        room: r.room,
        name: r.patientName,
        appetite: r.appetiteStatus,
        score: null,
        ts: null,
      }))
      .filter((b) => !fromAlerts.some((a) => a.room === b.room))

    return [...fromAlerts, ...fromBoard]
  }, [highRiskAlerts, roomModuleBoard])

  return (
    <SectionCard
      id="nutrition"
      title="Nutrition Monitoring"
      icon={Apple}
      iconColor="text-teal-500"
      count={rows.length}
      defaultOpen
    >
      {rows.length === 0 ? (
        <Empty text="No nutrition concerns flagged." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="rounded-xl border border-teal-100 bg-teal-50/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {r.room ? <span className="text-slate-500">Room {r.room} — </span> : null}
                    {r.name ?? 'Unknown'}
                  </p>
                  <p className="mt-0.5 text-xs text-teal-800 line-clamp-2">{r.appetite}</p>
                </div>
                <div className="shrink-0 text-right">
                  {r.score != null && <RiskBadge score={r.score} />}
                  {r.ts && <p className="mt-1 text-[11px] text-slate-400">{timeAgo(r.ts)}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ─── Section 6: Patient Timeline ─────────────────────────────────────────────
function PatientTimelineSection({ telegramLiveFeed }) {
  const timelines = useMemo(() => {
    const entries = Array.isArray(telegramLiveFeed) ? telegramLiveFeed : []
    if (entries.length === 0) return []
    try {
      const { timelines: tls } = runTimelinePipeline(entries, { maxDays: 7 })
      return tls
    } catch {
      return []
    }
  }, [telegramLiveFeed])

  const TREND_STYLE = {
    deteriorating: 'border-red-200 bg-red-50',
    critical_ongoing: 'border-red-300 bg-red-50',
    improving: 'border-emerald-200 bg-emerald-50',
    stable: 'border-slate-200 bg-slate-50',
    unknown: 'border-slate-200 bg-slate-50',
  }
  const STATUS_STYLE = {
    deteriorating: 'text-red-700',
    critical_ongoing: 'text-red-800 font-semibold',
    improving: 'text-emerald-700',
    stable: 'text-slate-600',
    unknown: 'text-slate-500',
  }

  return (
    <SectionCard
      id="timeline"
      title="Patient Timeline"
      icon={GitBranch}
      iconColor="text-indigo-500"
      count={timelines.length}
      defaultOpen
    >
      {timelines.length === 0 ? (
        <Empty text="No patient timeline data in the last 7 days." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {timelines.map((tl) => {
            const trend = tl.summary?.trend?.trend || 'unknown'
            return (
              <div
                key={tl.key}
                className={`rounded-xl border p-3 ${TREND_STYLE[trend] || TREND_STYLE.unknown}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{tl.name}</p>
                    {tl.room && (
                      <p className="text-xs text-slate-500">Room {tl.room}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendIcon trend={trend} />
                    {tl.summary?.trend?.scoreRecent != null && (
                      <span className="text-xs font-semibold text-slate-600">
                        {tl.summary.trend.scoreRecent}
                      </span>
                    )}
                  </div>
                </div>

                {tl.summary?.bullets?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {tl.summary.bullets.slice(0, 4).map((b) => (
                      <li key={b} className="flex items-start gap-1.5 text-xs text-slate-700">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}

                <p className={`mt-2 text-xs ${STATUS_STYLE[trend] || STATUS_STYLE.unknown}`}>
                  {tl.summary?.trend?.trendEmoji} {tl.summary?.statusLine}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {tl.entryCount} record{tl.entryCount !== 1 ? 's' : ''} · last {timeAgo(tl.lastSeen)}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

// ─── Section 7: Shift Summary ─────────────────────────────────────────────────
function ShiftSummarySection({ telegramLiveFeed, shiftHandoverSummary }) {
  const handoverReport = useMemo(() => {
    const entries = Array.isArray(telegramLiveFeed) ? telegramLiveFeed : []
    try {
      const { report } = runHandoverPipeline(entries, [], { now: new Date() })
      return report
    } catch {
      return null
    }
  }, [telegramLiveFeed])

  return (
    <SectionCard
      id="shift-summary"
      title="Shift Summary"
      icon={Stethoscope}
      iconColor="text-slate-500"
      defaultOpen={false}
    >
      <div className="space-y-4">
        {shiftHandoverSummary && (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dashboard Summary</p>
            <p className="mt-1.5 text-sm text-slate-700">{shiftHandoverSummary.headline}</p>
            {shiftHandoverSummary.highPriorityPatients?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-500">High-priority patients:</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {shiftHandoverSummary.highPriorityPatients.map((name) => (
                    <span key={name} className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800 ring-1 ring-orange-100">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {handoverReport && (
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              AI-Generated Handover Report
            </p>
            <pre className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
              {handoverReport}
            </pre>
          </div>
        )}

        {shiftHandoverSummary?.recentHandoverMessages?.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Recent Handover Messages</p>
            <div className="space-y-2">
              {shiftHandoverSummary.recentHandoverMessages.map((m) => (
                <div key={m.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">
                      {m.room ? `Room ${m.room}` : '—'}{m.patientName ? ` — ${m.patientName}` : ''}
                    </span>
                    <span className="text-slate-400">{fmtDateTime(m.timestamp)}</span>
                  </div>
                  <p className="mt-1 text-slate-600 line-clamp-2">{m.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function NursingSupervisorDashboardPage() {
  const { snapshot, loading, error, refetch, generatedAt } = useTelegramDashboardSnapshot(AUTO_REFRESH_MS)
  const { patients, getById } = usePatients()
  const { notes } = useNursingNotes()

  const patientAnalysis = useMemo(
    () => analyzeAllPatientsFromNotes(patients, notes, getById),
    [patients, notes, getById],
  )

  const {
    emergencies = [],
    highRiskAlerts = [],
    roomStatusBoard = [],
    roomModuleBoard = [],
    telegramLiveFeed = [],
    shiftHandoverSummary = null,
    sources = {},
  } = snapshot || {}

  const criticalCount = useMemo(
    () => (emergencies.length + (highRiskAlerts || []).filter((a) => Number(a.riskScore) >= 81).length),
    [emergencies, highRiskAlerts],
  )
  const highRiskCount = useMemo(
    () => (highRiskAlerts || []).filter((a) => Number(a.riskScore) >= 51).length,
    [highRiskAlerts],
  )
  const fallRiskCount = useMemo(
    () => (highRiskAlerts || []).filter((a) => /fall/i.test(a.categories || '')).length,
    [highRiskAlerts],
  )
  const nutritionCount = useMemo(
    () => (highRiskAlerts || []).filter((a) => /nutrition|appetite/i.test(a.categories || '')).length,
    [highRiskAlerts],
  )

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 to-white">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto max-w-7xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-sky-500 to-indigo-600 shadow-md shadow-indigo-200">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 sm:text-lg">
                Nursing Supervisor Dashboard
              </h1>
              <p className="text-xs text-slate-500">
                Auto-refreshes every {AUTO_REFRESH_MS / 1000}s
                {generatedAt && ` · Last updated ${timeAgo(generatedAt)}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {loading && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                <RefreshCw className="h-3 w-3 animate-spin" /> Loading…
              </span>
            )}
            {error && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                <AlertTriangle className="h-3 w-3" /> Connection error
              </span>
            )}
            {!loading && !error && snapshot && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Live
              </span>
            )}
            <button
              type="button"
              onClick={refetch}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* ── Data source badges ── */}
        <div className="mb-6 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            <Users className="h-3 w-3" />
            {sources.telegramMemoryCount ?? 0} Telegram records
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            <Clock className="h-3 w-3" />
            {fmtDateTime(generatedAt)}
          </span>
          {sources.googleSheet?.patientsroom?.ok && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Google Sheet connected
            </span>
          )}
        </div>

        {/* ── KPI Strip ── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Critical Patients"
            value={criticalCount}
            icon={ShieldAlert}
            colorKey={criticalCount > 0 ? 'critical' : 'low'}
            sub="Score ≥ 81"
          />
          <KpiCard
            label="High Risk"
            value={highRiskCount}
            icon={BellRing}
            colorKey={highRiskCount > 0 ? 'high' : 'low'}
            sub="Score 51–80"
          />
          <KpiCard
            label="Fall Risk"
            value={fallRiskCount}
            icon={Footprints}
            colorKey={fallRiskCount > 0 ? 'moderate' : 'low'}
            sub="Active fall flags"
          />
          <KpiCard
            label="Nutrition Alerts"
            value={nutritionCount}
            icon={Thermometer}
            colorKey={nutritionCount > 0 ? 'moderate' : 'low'}
            sub="Appetite / intake"
          />
        </div>

        {/* ── Sections grid ── */}
        <div className="space-y-4">
          {/* Row 1: Critical Alerts (full width) */}
          <CriticalAlertsSection
            emergencies={emergencies}
            highRiskAlerts={highRiskAlerts}
          />

          {/* Row 2: High Risk + Recent Notes (2 col) */}
          <div className="grid gap-4 xl:grid-cols-2">
            <HighRiskPatientsSection
              highRiskAlerts={highRiskAlerts}
              patientAnalysis={patientAnalysis}
            />
            <RecentNotesSection
              telegramLiveFeed={telegramLiveFeed}
              notes={notes}
            />
          </div>

          {/* Row 3: Fall Risk + Nutrition (2 col) */}
          <div className="grid gap-4 xl:grid-cols-2">
            <FallRiskSection
              highRiskAlerts={highRiskAlerts}
              roomStatusBoard={roomStatusBoard}
            />
            <NutritionSection
              highRiskAlerts={highRiskAlerts}
              roomModuleBoard={roomModuleBoard}
            />
          </div>

          {/* Row 4: Patient Timeline (full width) */}
          <PatientTimelineSection telegramLiveFeed={telegramLiveFeed} />

          {/* Row 5: Shift Summary (full width) */}
          <ShiftSummarySection
            telegramLiveFeed={telegramLiveFeed}
            shiftHandoverSummary={shiftHandoverSummary}
          />
        </div>

        {/* ── Footer ── */}
        <p className="mt-8 text-center text-xs text-slate-400">
          WMC-AI Nursing Supervisor Dashboard · {new Date().getFullYear()} · Not a regulated medical device — always verify findings at the bedside.
        </p>
      </div>
    </div>
  )
}
