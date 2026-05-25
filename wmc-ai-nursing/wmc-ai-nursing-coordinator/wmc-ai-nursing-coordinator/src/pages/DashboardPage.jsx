import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  ClipboardCheck,
  HeartPulse,
  Users,
  BellRing,
  Timer,
  ClipboardClock,
  TrendingUp,
  Repeat2,
  UserRoundX,
  ClipboardX,
  Activity,
  ClipboardList,
  BedDouble,
  FileText,
  PlusCircle,
  UserCheck,
  Smartphone,
  DoorOpen,
  Pill,
  Footprints,
  ListChecks,
  TriangleAlert,
  Siren,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { aiAlerts, censusTrend, alertSeverityCounts, shiftCoverage } from '../data/dummyData'
import { usePatients } from '../hooks/usePatients.js'
import { deriveRiskScore } from '../db/patientSchema.js'
import { analyzeAllPatientsFromNotes } from '../lib/aiRiskDetection.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import { getRecentVitalAlerts } from '../db/vitalStorage.js'
import { getDashboardOtSnapshot } from '../db/otStorage.js'
import { riskLevelStyle } from '../lib/vitalRiskDetection.js'
import { getDashboardCareLoopsSummary } from '../lib/careLoopsSimulation.js'
import { getHealthCheckDashboardMetrics } from '../lib/healthCheckLoopSimulation.js'

const openAlerts = aiAlerts.filter((a) => a.status !== 'resolved').length
const highCritical = aiAlerts.filter(
  (a) => (a.severity === 'high' || a.severity === 'critical') && a.status !== 'resolved',
).length

function formatVitalTime(isoString) {
  if (!isoString) return '—'
  try {
    return new Date(isoString).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return isoString
  }
}

export default function DashboardPage() {
  const { patients, getById } = usePatients()
  const { notes } = useNursingNotes()

  const [vitalAlerts, setVitalAlerts] = useState(() => getRecentVitalAlerts(24))
  const [otSnap, setOtSnap] = useState(() => getDashboardOtSnapshot())
  const [careLoopsRev, setCareLoopsRev] = useState(0)
  const [healthLoopRev, setHealthLoopRev] = useState(0)

  useEffect(() => {
    function refresh() {
      setVitalAlerts(getRecentVitalAlerts(24))
      setOtSnap(getDashboardOtSnapshot())
    }
    window.addEventListener('wmc-clinical-data-updated', refresh)
    return () => window.removeEventListener('wmc-clinical-data-updated', refresh)
  }, [])

  useEffect(() => {
    function bumpCareLoops() {
      setCareLoopsRev((r) => r + 1)
    }
    window.addEventListener('wmc-care-loops-updated', bumpCareLoops)
    return () => window.removeEventListener('wmc-care-loops-updated', bumpCareLoops)
  }, [])

  useEffect(() => {
    function bumpHealthLoops() {
      setHealthLoopRev((r) => r + 1)
    }
    window.addEventListener('wmc-health-check-loops-updated', bumpHealthLoops)
    return () => window.removeEventListener('wmc-health-check-loops-updated', bumpHealthLoops)
  }, [])

  const riskRows = useMemo(() => analyzeAllPatientsFromNotes(patients, notes, getById), [patients, notes, getById])
  const todayWindowMs = 24 * 60 * 60 * 1000
  const notesToday = useMemo(
    () =>
      notes.filter((note) => {
        const created = note.createdAt ? Date.now() - new Date(note.createdAt).getTime() : Number.POSITIVE_INFINITY
        return created >= 0 && created <= todayWindowMs
      }).length,
    [notes],
  )

  const liveOpenAlerts = riskRows.filter((row) => row.anyEscalation && !row.insufficientData).length
  const patientRiskAvg = useMemo(() => {
    if (patients.length === 0) return 0
    const sum = riskRows.reduce((acc, row) => acc + (row.insufficientData ? deriveRiskScore(getById(row.patientId) || {}) : row.overallScore), 0)
    return Math.round(sum / riskRows.length)
  }, [riskRows, getById, patients.length])

  const statCards = useMemo(() => {
    const n = patients.length
    const rehabN = patients.filter((p) => p.rehabilitationStatus === 'Active rehabilitation').length
    const combinedOpenAlerts = openAlerts + liveOpenAlerts
    const combinedHighCritical = highCritical + Math.min(liveOpenAlerts, 5)
    return [
      {
        label: 'Patient census',
        value: String(n),
        sub: `${rehabN} flagged for intensified nursing care`,
        icon: Users,
        accent: 'from-teal-500 to-cyan-600',
      },
      {
        label: 'Open AI alerts',
        value: combinedOpenAlerts.toString(),
        sub: `${combinedHighCritical} with active escalation`,
        icon: AlertTriangle,
        accent: 'from-amber-500 to-orange-600',
      },
      {
        label: 'Notes filed (24h)',
        value: String(notesToday),
        sub: 'Across all units',
        icon: ClipboardCheck,
        accent: 'from-sky-500 to-indigo-600',
      },
      {
        label: 'Avg. risk index',
        value: n > 0 ? String(patientRiskAvg) : '—',
        sub: n > 0 ? 'From live nursing note analysis + roster baseline' : 'Add patients to compute',
        icon: HeartPulse,
        accent: 'from-emerald-500 to-teal-600',
      },
    ]
  }, [patients, notesToday, patientRiskAvg, liveOpenAlerts])

  const otStatCards = useMemo(() => {
    const { openToday, pendingOt, approvedOtHoursMonth, lateArrivalsMonth, monthLabel } = otSnap
    return [
      {
        label: 'Open check-ins today',
        value: String(openToday),
        sub: 'Nurse attendance board',
        icon: ClipboardClock,
        accent: 'from-sky-500 to-indigo-600',
        to: '/staff-attendance',
      },
      {
        label: 'Pending OT approvals',
        value: String(pendingOt),
        sub: 'Supervisor queue',
        icon: Timer,
        accent: 'from-amber-500 to-orange-600',
        to: '/ot-management',
      },
      {
        label: 'Approved OT (month)',
        value: `${approvedOtHoursMonth}h`,
        sub: monthLabel,
        icon: TrendingUp,
        accent: 'from-teal-500 to-emerald-600',
        to: '/ot-reports',
      },
      {
        label: 'Late arrivals (month)',
        value: String(lateArrivalsMonth),
        sub: 'From attendance clock-in vs shift start',
        icon: AlertTriangle,
        accent: 'from-rose-500 to-red-600',
        to: '/ot-reports',
      },
    ]
  }, [otSnap])

  const careLoopsSummary = useMemo(
    () => getDashboardCareLoopsSummary(patients),
    [patients, careLoopsRev],
  )

  const healthLoopMetrics = useMemo(
    () => getHealthCheckDashboardMetrics(patients),
    [patients, healthLoopRev],
  )

  const healthLoopStatCards = useMemo(() => {
    const { urgentPatients, missedChecks, criticalAlerts } = healthLoopMetrics
    return [
      {
        label: 'Patients requiring urgent check',
        value: String(urgentPatients),
        sub: 'Due / overdue / abnormal reading',
        icon: UserRoundX,
        accent: 'from-orange-500 to-amber-600',
      },
      {
        label: 'Missed health checks',
        value: String(missedChecks),
        sub: 'Loops past next due (sim clock)',
        icon: ClipboardX,
        accent: 'from-rose-500 to-red-600',
      },
      {
        label: 'Critical alerts',
        value: String(criticalAlerts),
        sub: 'Critical reads + AI severity',
        icon: AlertTriangle,
        accent: 'from-red-600 to-red-800',
      },
      {
        label: 'Live monitoring lines',
        value: String(healthLoopMetrics.liveLines?.length ?? 0),
        sub: 'Residents on roster pulse strip',
        icon: Activity,
        accent: 'from-teal-500 to-cyan-600',
      },
    ]
  }, [healthLoopMetrics])

  const moduleCards = [
    { label: 'Patient Rooms', icon: DoorOpen, to: '/room-module', color: 'from-slate-500 to-slate-700', desc: 'Room allocation and occupancy' },
    { label: 'Side Turning', icon: BedDouble, to: '/side-turning', color: 'from-violet-500 to-purple-600', desc: 'Pressure relief turning schedule' },
    { label: 'Medication Tracking', icon: Pill, to: '/medications', color: 'from-blue-500 to-indigo-700', desc: 'Medication administration and checks' },
    { label: 'Shift Handover', icon: FileText, to: '/shift-handover', color: 'from-emerald-500 to-teal-600', desc: 'Nurse-to-nurse shift updates' },
    { label: 'Fall Incidents', icon: Footprints, to: '/fall-prevention-loop', color: 'from-rose-500 to-red-600', desc: 'Fall risk and incident follow-up' },
    { label: 'Nurse Task Board', icon: ListChecks, to: '/care-loops', color: 'from-cyan-500 to-sky-700', desc: 'Due and overdue bedside tasks' },
    { label: 'OT Tracking', icon: Timer, to: '/ot-reports', color: 'from-amber-500 to-orange-600', desc: 'Overtime and attendance analytics' },
    { label: 'Vital Signs Monitoring', icon: HeartPulse, to: '/nurse-input', color: 'from-red-500 to-rose-600', desc: 'Live vitals input and monitoring' },
    { label: 'Nursing Alerts', icon: Siren, to: '/alerts', color: 'from-fuchsia-500 to-pink-600', desc: 'AI-assisted nursing alert stream' },
    { label: 'High Risk Patients', icon: TriangleAlert, to: '/ai-risk', color: 'from-orange-500 to-amber-600', desc: 'Priority patients needing close watch' },
    { label: 'Family Updates', icon: Users, to: '/family-updates', color: 'from-teal-500 to-cyan-600', desc: 'Family communication and updates' },
  ]

  const quickInputLinks = [
    {
      label: 'New Nursing Note',
      icon: PlusCircle,
      to: '/nursing-notes/new',
      page: 'NursingNoteFormPage',
      color: 'bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100',
    },
    {
      label: 'Log Side Turning',
      icon: BedDouble,
      to: '/side-turning',
      page: 'SideTurningScheduleBoardPage',
      color: 'bg-violet-50 border-violet-200 text-violet-800 hover:bg-violet-100',
    },
    {
      label: 'Log OT / Overtime',
      icon: Timer,
      to: '/overtime',
      page: 'OvertimePage',
      color: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100',
    },
    {
      label: 'Shift Handover',
      icon: FileText,
      to: '/shift-handover',
      page: 'ShiftHandoverPage',
      color: 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100',
    },
    {
      label: 'Record Vitals',
      icon: HeartPulse,
      to: '/nurse-input',
      page: 'NurseVitalInputPage',
      color: 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100',
    },
    {
      label: 'Staff Attendance',
      icon: UserCheck,
      to: '/staff-attendance',
      page: 'StaffAttendancePage',
      color: 'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100',
    },
  ]

  return (
    <div>
      <PageHeader
        title="WMC AI Nursing Coordinator"
        description="Professional nursing operations dashboard for live care coordination at WMC."
      />

      {/* Module access cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {moduleCards.map(({ label, icon: Icon, to, color, desc }) => (
          <Link
            key={label}
            to={to}
            className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow-md hover:-translate-y-0.5"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br ${color} text-white shadow`}>
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 group-hover:text-teal-700">{label}</p>
              <p className="text-xs text-slate-500">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Input — direct links to existing input form pages */}
      <div className="mb-8">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          {quickInputLinks.map(({ label, icon: Icon, to, color }) => (
            <Link
              key={to}
              to={to}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${color}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, sub, icon: Icon, accent }) => (
          <Card key={label} className="relative overflow-hidden" padding="p-5">
            <div
              className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-2xl`}
            />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
                <p className="mt-1 text-xs text-slate-600">{sub}</p>
              </div>
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-md`}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">OT &amp; attendance (local)</h3>
          <Link
            to="/staff-attendance"
            className="text-xs font-semibold text-teal-700 hover:underline"
          >
            Staff Attendance
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {otStatCards.map(({ label, value, sub, icon: Icon, accent, to }) => (
            <Link key={label} to={to} className="block">
              <Card className="relative h-full overflow-hidden transition-shadow hover:shadow-md" padding="p-5">
                <div
                  className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-linear-to-br ${accent} opacity-20 blur-2xl`}
                />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{label}</p>
                    <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
                    <p className="mt-1 text-xs text-slate-600">{sub}</p>
                  </div>
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${accent} text-white shadow-md`}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <Card padding="p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Repeat2 className="h-5 w-5 text-teal-600" aria-hidden />
              <div>
                <h3 className="text-base font-semibold text-slate-900">Care Loops Due Now</h3>
                <p className="text-sm text-slate-500">Recurring bedside tasks — local roster</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {careLoopsSummary.overdue > 0 ? (
                <span className="rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white">
                  {careLoopsSummary.overdue} overdue
                </span>
              ) : null}
              <Link
                to="/care-loops"
                className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100"
              >
                Open Care Loops
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 pb-4">
            <p className="text-4xl font-bold tabular-nums text-slate-900">{careLoopsSummary.dueNow}</p>
            <p className="text-sm font-medium text-slate-600">loops need attention (due or overdue)</p>
          </div>
          {careLoopsSummary.preview.length === 0 ? (
            <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
              No care loops in due/overdue window — nice work.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {careLoopsSummary.preview.map((row) => (
                <li key={row.key} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{row.patientName}</p>
                    <p className="truncate text-xs text-slate-500">
                      Rm {row.room} · {row.loopTypeLabel} · {row.nurseInCharge}
                    </p>
                  </div>
                  <Badge variant={row.status === 'overdue' ? 'danger' : 'warning'}>{row.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Health check loops</h3>
          <Link
            to="/health-check-loop"
            className="text-xs font-semibold text-teal-700 hover:underline"
          >
            Health Check Loop
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {healthLoopStatCards.map(({ label, value, sub, icon: Icon, accent }) => (
            <Link key={label} to="/health-check-loop" className="block">
              <Card className="relative h-full overflow-hidden transition-shadow hover:shadow-md" padding="p-5">
                <div
                  className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-linear-to-br ${accent} opacity-20 blur-2xl`}
                />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{label}</p>
                    <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
                    <p className="mt-1 text-xs text-slate-600">{sub}</p>
                  </div>
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${accent} text-white shadow-md`}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        <Card className="mt-4" padding="p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-teal-600" aria-hidden />
              <div>
                <h3 className="text-base font-semibold text-slate-900">Live patient monitoring</h3>
                <p className="text-sm text-slate-500">Snapshot from health loops + latest readings</p>
              </div>
            </div>
            <Badge variant="teal">Live feed</Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {healthLoopMetrics.liveLines.map((line) => (
              <li key={line.patientId} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{line.patientName}</p>
                  <p className="truncate text-xs text-slate-500">{line.summary}</p>
                </div>
                <Badge
                  variant={
                    line.statusLabel === 'Critical' ? 'danger' : line.statusLabel === 'Watch' ? 'warning' : line.statusLabel === 'Due' ? 'info' : 'success'
                  }
                >
                  {line.statusLabel}
                </Badge>
              </li>
            ))}
          </ul>
          {healthLoopMetrics.aiPreview?.length > 0 ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top AI signals</p>
              <ul className="mt-2 space-y-2">
                {healthLoopMetrics.aiPreview.map((a) => (
                  <li key={a.id} className="flex gap-2 text-sm text-slate-700">
                    <span className="text-slate-400" aria-hidden>
                      •
                    </span>
                    <span>
                      <span className="font-medium text-slate-900">{a.category}</span> — {a.title}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" padding="p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Census & flow</h3>
              <p className="text-sm text-slate-500">Occupancy vs admits / discharges</p>
            </div>
            <Badge variant="teal">YTD trend</Badge>
          </div>
          <div className="h-64 w-full min-h-[16rem] sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={censusTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillOcc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" domain={[80, 100]} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="occupancy"
                  name="Occupancy %"
                  stroke="#0d9488"
                  fill="url(#fillOcc)"
                  strokeWidth={2}
                />
                <Area type="monotone" dataKey="admits" name="Admits" stroke="#6366f1" fillOpacity={0} strokeWidth={2} />
                <Area
                  type="monotone"
                  dataKey="discharges"
                  name="Discharges"
                  stroke="#f97316"
                  fillOpacity={0}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card padding="p-4 sm:p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">AI alert mix</h3>
            <p className="text-sm text-slate-500">Rolling 30 days (simulated)</p>
          </div>
          <div className="h-56 w-full min-h-[14rem]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={alertSeverityCounts}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={2}
                >
                  {alertSeverityCounts.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card padding="p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Shift coverage</h3>
              <p className="text-sm text-slate-500">Staffed vs required (RN+LPN mix)</p>
            </div>
            <Badge variant="warning">Night gap</Badge>
          </div>
          <div className="h-56 w-full min-h-[14rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shiftCoverage} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis type="category" dataKey="shift" width={64} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="staffed" name="Staffed" fill="#14b8a6" radius={[0, 6, 6, 0]} />
                <Bar dataKey="required" name="Required" fill="#cbd5e1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card padding="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900">Recent AI signals</h3>
          <p className="text-sm text-slate-500">Highest severity items</p>
          <ul className="mt-4 divide-y divide-slate-100">
            {aiAlerts.slice(0, 4).map((a) => (
              <li key={a.id} className="flex gap-3 py-3 first:pt-0">
                <span
                  className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                    a.severity === 'critical'
                      ? 'bg-red-500'
                      : a.severity === 'high'
                        ? 'bg-orange-500'
                        : a.severity === 'medium'
                          ? 'bg-amber-400'
                          : 'bg-emerald-500'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{a.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {a.patientName} · {a.category}
                  </p>
                </div>
                <Badge
                  variant={
                    a.status === 'resolved' ? 'success' : a.status === 'acknowledged' ? 'info' : 'warning'
                  }
                >
                  {a.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ── Live Vital Alerts from Nurse Input ─────────────────────────────── */}
      <div className="mt-6">
        <Card padding="p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-red-500" aria-hidden />
              <div>
                <h3 className="text-base font-semibold text-slate-900">Live vital alerts (last 24 h)</h3>
                <p className="text-sm text-slate-500">From Nurse Vital Input — high &amp; critical readings only</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {vitalAlerts.length > 0 ? (
                <span className="rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white">
                  {vitalAlerts.length} alert{vitalAlerts.length !== 1 ? 's' : ''}
                </span>
              ) : (
                <Badge variant="success">All clear</Badge>
              )}
              <Link
                to="/nurse-input"
                className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100"
              >
                + New vitals
              </Link>
            </div>
          </div>

          {vitalAlerts.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-emerald-800">No critical or high vital alerts in the last 24 hours.</p>
              <p className="mt-1 text-xs text-emerald-700">Record patient vitals via Nurse Vital Input to see live alerts here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {vitalAlerts.slice(0, 8).map((record) => {
                const style = riskLevelStyle(record.overallRiskLevel)
                const topRisks = (record.risks || []).filter((r) => r.level === 'critical' || r.level === 'high')
                return (
                  <li key={record.id} className="flex gap-3 py-3 first:pt-0">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{record.patientName}</p>
                      <p className="truncate text-xs text-slate-500">
                        {formatVitalTime(record.recordedAt)}
                        {record.nurse ? ` · ${record.nurse}` : ''}
                        {record.shift ? ` · ${record.shift}` : ''}
                      </p>
                      {topRisks.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {topRisks.map((r) => {
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
                    </div>
                    <span className={`shrink-0 self-start rounded-full px-2.5 py-1 text-xs font-bold ${style.badgeBg} ${style.badgeText}`}>
                      {style.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
