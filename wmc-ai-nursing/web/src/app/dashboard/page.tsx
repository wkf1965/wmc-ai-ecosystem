"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import {
  ArrowRight,
  AlertTriangle,
  Bell,
  Building2,
  Calendar,
  CalendarClock,
  Clock3,
  LineChart,
  Pill,
  Search,
  ShieldCheck,
  ShieldX,
  Users,
} from "lucide-react"
import { analyzePatientRisk, riskSeverity, type PatientRiskProfile } from "../../lib/aiRiskDetection"
import { CLINICAL_DATA_UPDATE_EVENT, listPatients } from "../../lib/patientManagement"
import {
  escalationSeverityTone,
  escalationStatusLabel,
  escalationStatusTone,
  listEscalations,
  type EscalationRecord,
} from "../../lib/aiEscalations"

const kpiCardBlueprints = [
  {
    title: "Residents in care",
    value: "128",
    trend: "+2.1% this week",
    tone: "emerald",
    icon: Users,
  },
  {
    title: "Nursing notes (24h)",
    value: "47",
    trend: "98% completed",
    tone: "sky",
    icon: ShieldCheck,
  },
  {
    title: "AI watchlist",
    value: "9",
    trend: "4 high severity",
    tone: "amber",
    icon: AlertTriangle,
  },
  {
    title: "Immediate escalations",
    value: "3",
    trend: "requires nurse review",
    tone: "rose",
    icon: ShieldX,
  },
  {
    title: "Critical AI escalations",
    value: "0",
    trend: "simulation mode active",
    tone: "rose",
    icon: AlertTriangle,
  },
]

const shiftStaff = [
  { area: "A-Floor", lead: "Nurse Lee", onDuty: 14, handoff: "06:00 - 14:00", status: "active" },
  { area: "B-Floor", lead: "Nurse Chan", onDuty: 12, handoff: "14:00 - 22:00", status: "active" },
  { area: "Rehab Unit", lead: "Nurse Patel", onDuty: 9, handoff: "22:00 - 06:00", status: "standby" },
]

const trendBars = [
  { label: "Mon", incidents: 14, admissions: 6 },
  { label: "Tue", incidents: 11, admissions: 9 },
  { label: "Wed", incidents: 16, admissions: 4 },
  { label: "Thu", incidents: 9, admissions: 8 },
  { label: "Fri", incidents: 18, admissions: 10 },
  { label: "Sat", incidents: 12, admissions: 7 },
  { label: "Sun", incidents: 10, admissions: 5 },
]

const kpiTone: Record<string, string> = {
  emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-200 text-emerald-900",
  sky: "from-sky-500/10 to-sky-500/5 border-sky-200 text-sky-900",
  amber: "from-amber-500/10 to-amber-500/5 border-amber-200 text-amber-900",
  rose: "from-rose-500/10 to-rose-500/5 border-rose-200 text-rose-900",
}

const navItems = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Rooms", href: "/rooms" },
  { name: "Nurse Duty Roster", href: "/nurse-duty-roster" },
  { name: "Overtime OT", href: "/overtime-ot" },
  { name: "Patients", href: "/patients" },
  { name: "Nursing Notes", href: "/ai-note-analyzer" },
  { name: "AI Alerts", href: "/ai-risk" },
  { name: "Medications", href: "/medications" },
  { name: "Shift Handover", href: "/shift-handover" },
  { name: "AI Daily Summary", href: "/ai-summary" },
  { name: "WhatsApp Alerts", href: "/whatsapp-alerts" },
  { name: "Reports", href: "/reports" },
]

function riskColor(level: string) {
  if (level === "red") return "bg-rose-100 text-rose-700"
  if (level === "orange") return "bg-orange-100 text-orange-700"
  if (level === "yellow") return "bg-amber-100 text-amber-700"
  return "bg-emerald-100 text-emerald-700"
}

function statusColor(status: string) {
  return status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
}

function riskStyle(level: string) {
  if (level === "red") return "bg-rose-100 text-rose-700"
  if (level === "orange") return "bg-orange-100 text-orange-700"
  if (level === "yellow") return "bg-amber-100 text-amber-700"
  return "bg-emerald-100 text-emerald-700"
}

type DashboardAlert = {
  patient: string
  level: ReturnType<typeof riskSeverity>
  metric: string
  action: string
  time: string
}

type DashboardPatientRow = {
  patient: string
  room: string
  diagnosis: string
  mobility: string
  risk: PatientRiskProfile["riskBadge"]
  severity: ReturnType<typeof riskSeverity>
  riskScore: number
  topMetric: string
  ai: string
  shift: string
  id: string
}

type DashboardEscalation = Pick<
  EscalationRecord,
  "id" | "patientId" | "patientName" | "room" | "riskScore" | "severity" | "status" | "reason" | "updatedAt"
>

function buildRows(keepTopOnly = true) {
  const patients = listPatients()
  const rows = patients
    .map((patient) => {
      const risk = analyzePatientRisk(patient)
      return {
        patient: patient.fullName,
        room: patient.roomNumber || "—",
        diagnosis: patient.diagnosis,
        mobility: patient.mobilityStatus,
        risk: risk.riskBadge,
        severity: riskSeverity(risk.totalScore),
        riskScore: risk.totalScore,
        topMetric: risk.categories[0]?.label ?? "Monitoring",
        ai: `${risk.categories?.[0]?.label ?? "Monitoring"}`,
        shift: "Day",
        id: patient.id,
      }
    })
    .sort((left, right) => {
      const rank: Record<ReturnType<typeof riskSeverity>, number> = {
        green: 1,
        yellow: 2,
        orange: 3,
        red: 4,
      }
      return rank[right.severity] - rank[left.severity]
    })

  return keepTopOnly ? rows.slice(0, 6) : rows
}

function buildAlerts(rows: DashboardPatientRow[]) {
  return rows
    .filter((row) => row.riskScore > 20)
    .map((row) => ({
      patient: row.patient,
      level: row.severity,
      metric: row.topMetric || "AI watch alert",
      action: `Review profile and handoff for ${row.patient}. Trending severity ${row.severity}.`,
      time: "Updated now",
    }))
}

function buildCriticalEscalations() {
  return listEscalations().filter((item) => item.status !== "resolved").filter((item) => item.severity === "red" || item.severity === "orange")
}

function buildKpiRows(patients: DashboardPatientRow[], escalations: DashboardEscalation[]) {
  const highRiskCount = patients.filter((person) => person.severity === "orange" || person.severity === "red").length
  const redRiskCount = patients.filter((person) => person.severity === "red").length
  const criticalEscalationCount = escalations.length
  return kpiCardBlueprints.map((card) => {
    if (card.title === "AI watchlist") return { ...card, value: String(highRiskCount) }
    if (card.title === "Immediate escalations") return { ...card, value: String(redRiskCount) }
    if (card.title === "Critical AI escalations") return { ...card, value: String(criticalEscalationCount) }
    return card
  })
}

export default function DashboardPage() {
  const pathname = usePathname()
  const [rows, setRows] = useState<DashboardPatientRow[]>([])
  const [kpiCards, setKpiCards] = useState(() => kpiCardBlueprints)
  const [alerts, setAlerts] = useState<DashboardAlert[]>([])
  const [criticalEscalations, setCriticalEscalations] = useState<DashboardEscalation[]>([])

  useEffect(() => {
    const refreshRows = () => {
      const latestRows = buildRows(false)
      const escalations = buildCriticalEscalations()
      setRows(latestRows.slice(0, 6))
      setCriticalEscalations(escalations)
      setKpiCards(buildKpiRows(latestRows, escalations))
      setAlerts(buildAlerts(latestRows))
    }
    refreshRows()
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("wmc_nursing_")) refreshRows()
    }
    window.addEventListener("storage", onStorage)
    const onUpdate = () => refreshRows()
    window.addEventListener(CLINICAL_DATA_UPDATE_EVENT, onUpdate)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(CLINICAL_DATA_UPDATE_EVENT, onUpdate)
    }
  }, [])

  return (
    <div className='dashboard-shell'>
      <aside className='fixed inset-y-0 hidden w-72 border-r border-slate-200 bg-white/95 p-6 text-slate-800 shadow-panel backdrop-blur lg:block'>
        <div className='mb-8 flex items-center gap-3'>
          <span className='inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-lg font-semibold text-white'>WN</span>
          <div>
            <p className='text-lg font-semibold text-slate-900'>WMC Nursing</p>
            <p className='text-xs text-slate-500'>Clinical Operations</p>
          </div>
        </div>
        <nav className='space-y-1'>
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                pathname === item.href ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span>{item.name}</span>
              <ArrowRight className='h-3.5 w-3.5 opacity-70' />
            </Link>
          ))}
        </nav>
      </aside>

      <div className='lg:pl-72'>
        <header className='sticky top-0 z-20 border-b border-white/60 bg-white/90 backdrop-blur'>
          <div className='mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-wider text-slate-500'>WMC Health Campus</p>
              <h1 className='dashboard-title'>Professional Nursing Operations Dashboard</h1>
            </div>
            <div className='hidden min-w-0 flex-1 items-center justify-end gap-3 sm:flex'>
              <label className='relative block'>
                <Search className='pointer-events-none absolute left-2 top-2 h-4 w-4 text-slate-400' />
                <input
                  placeholder='Search patient or room'
                  className='w-full max-w-sm rounded-lg border border-slate-200 bg-white px-8 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none'
                />
              </label>
              <button className='inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white'>
                <Bell className='h-4 w-4' />
                Create alert
              </button>
            </div>
          </div>
        </header>

        <main className='mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6'>
          <section className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            {kpiCards.map((card) => {
              const Icon = card.icon
              return (
                <article
                  key={card.title}
                  className={`panel-card border border-slate-200 bg-gradient-to-br ${kpiTone[card.tone]}`}
                >
                  <div className='mb-3 flex items-start justify-between'>
                    <div>
                      <p className='panel-title'>{card.title}</p>
                      <p className='mt-2 text-3xl font-bold text-slate-900'>{card.value}</p>
                    </div>
                    <span className='rounded-xl border border-white/60 bg-white/70 p-2 text-slate-600'>
                      <Icon className='h-5 w-5' />
                    </span>
                  </div>
                  <p className='text-sm text-slate-600'>{card.trend}</p>
                </article>
              )
            })}
          </section>

          <section className='mt-6 grid gap-6 lg:grid-cols-5'>
            <article className='panel-card lg:col-span-3'>
              <header className='mb-4 flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>AI risk alerts</h2>
                  <p className='text-sm text-slate-500'>Color-coded cards from nursing-note risk scoring</p>
                </div>
                <span className='metric-chip'>Last sync 08:42</span>
              </header>
              <div className='grid gap-3 sm:grid-cols-3'>
                {alerts.map((alert) => (
                  <article key={alert.patient} className={`rounded-xl border p-4 ${riskColor(alert.level)}`}>
                    <p className='text-xs font-semibold uppercase tracking-wide'>{alert.level}</p>
                    <p className='mt-1 text-sm font-semibold text-slate-900'>{alert.patient}</p>
                    <p className='text-sm text-slate-700'>{alert.metric}</p>
                    <p className='mt-2 text-xs text-slate-600'>{alert.time}</p>
                    <p className='mt-2 text-sm'>{alert.action}</p>
                  </article>
                ))}
              </div>
            </article>

            <article className='panel-card lg:col-span-2'>
              <header className='mb-4 flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>Critical AI escalations</h2>
                  <p className='text-sm text-slate-500'>Simulation-only escalation queue and workflow statuses</p>
                </div>
                <span className='metric-chip'>Simulation mode</span>
              </header>
              <div className='space-y-3'>
                {criticalEscalations.length === 0 ? (
                  <p className='rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600'>No critical AI escalations.</p>
                ) : (
                  criticalEscalations.slice(0, 5).map((entry) => (
                    <div key={entry.id} className='rounded-xl border border-slate-200 p-3'>
                      <div className='mb-1 flex items-center justify-between text-sm'>
                        <p className='font-semibold text-slate-900'>
                          {entry.patientName} • {entry.room}
                        </p>
                          <span className='flex items-center gap-2'>
                            <span className={`rounded-full border px-2 py-1 text-xs ${escalationSeverityTone(entry.severity)}`}>severity {entry.severity}</span>
                            <span className={`rounded-full border px-2 py-1 text-xs ${escalationStatusTone(entry.status)}`}>{escalationStatusLabel(entry.status)}</span>
                          </span>
                      </div>
                      <p className='text-xs text-slate-600'>Score {entry.riskScore} • {entry.severity}</p>
                      <p className='text-xs text-slate-600'>Reason: {entry.reason}</p>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className='panel-card lg:col-span-2'>
              <header className='mb-4'>
                <h2 className='text-lg font-semibold text-slate-900'>Nurse shift panel</h2>
                <p className='text-sm text-slate-500'>Coverage, handover window, and staffing pressure</p>
              </header>
              <div className='space-y-3'>
                {shiftStaff.map((shift) => (
                  <div key={shift.area} className='rounded-xl border border-slate-200 p-3'>
                    <div className='flex items-center justify-between'>
                      <p className='font-medium text-slate-900'>{shift.area}</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor(shift.status)}`}>{shift.status}</span>
                    </div>
                    <p className='mt-1 text-sm text-slate-600'>Lead: {shift.lead}</p>
                    <p className='text-xs text-slate-500'>On duty: {shift.onDuty} nurses - Handoff: {shift.handoff}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className='panel-card lg:col-span-2'>
              <header className='mb-4 flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>Nurse duty roster module</h2>
                  <p className='text-sm text-slate-500'>Roster planning linked with OT, handover, and medication desk</p>
                </div>
                <span className='metric-chip'>New module</span>
              </header>
              <div className='rounded-xl border border-slate-200 p-4'>
                <p className='text-sm text-slate-600'>Open nurse duty roster to manage shift allocation and jump to connected nurse workflows.</p>
                <Link href="/nurse-duty-roster" className='mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white'>
                  <CalendarClock className='h-4 w-4' />
                  Open Nurse Duty Roster
                </Link>
              </div>
            </article>
            <article className='panel-card lg:col-span-2'>
              <header className='mb-4 flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>Rooms module</h2>
                  <p className='text-sm text-slate-500'>Patient rooms, occupancy, and bedside risk view</p>
                </div>
                <span className='metric-chip'>New module</span>
              </header>
              <div className='rounded-xl border border-slate-200 p-4'>
                <p className='text-sm text-slate-600'>Open the dedicated rooms page to view room allocation and risk status per resident.</p>
                <Link href="/rooms" className='mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white'>
                  <Building2 className='h-4 w-4' />
                  Open Rooms Module
                </Link>
              </div>
            </article>
            <article className='panel-card lg:col-span-2'>
              <header className='mb-4 flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>Overtime OT module</h2>
                  <p className='text-sm text-slate-500'>OT calculation, punch in/out, and Telegram handoff</p>
                </div>
                <span className='metric-chip'>New module</span>
              </header>
              <div className='rounded-xl border border-slate-200 p-4'>
                <p className='text-sm text-slate-600'>Open OT workflow for staff punch logs, overtime totals, and Telegram bot integration.</p>
                <Link href="/overtime-ot" className='mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white'>
                  <Clock3 className='h-4 w-4' />
                  Open Overtime OT Module
                </Link>
              </div>
            </article>
          </section>

          <section className='mt-6 grid gap-6 xl:grid-cols-5'>
            <article className='panel-card xl:col-span-3'>
              <div className='mb-4 flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>Patient table</h2>
                  <p className='text-sm text-slate-500'>Clinical snapshot and AI-level overview</p>
                </div>
                <Link href="/patients" className='metric-chip'>Open all</Link>
              </div>
              <div className='overflow-x-auto'>
                <table className='min-w-full text-left text-sm'>
                  <thead>
                    <tr className='border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500'>
                      <th className='px-2 py-2'>Patient</th>
                      <th className='px-2 py-2'>Room</th>
                      <th className='px-2 py-2'>Condition</th>
                      <th className='px-2 py-2'>Mobility</th>
                      <th className='px-2 py-2'>Risk</th>
                      <th className='px-2 py-2'>AI Flag</th>
                      <th className='px-2 py-2'>Shift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className='border-b border-slate-100'>
                        <td className='px-2 py-3 font-medium text-slate-900'>
                          <Link href={`/patients/${row.id}`} className='font-medium text-sky-700 hover:text-sky-800 hover:underline'>
                            {row.patient}
                          </Link>
                        </td>
                        <td className='px-2 py-3 text-slate-700'>{row.room}</td>
                        <td className='px-2 py-3 text-slate-700'>{row.diagnosis}</td>
                        <td className='px-2 py-3 text-slate-700'>{row.mobility}</td>
                        <td className='px-2 py-3'>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${riskStyle(row.severity)}`}>
                            {row.severity}
                          </span>
                        </td>
                        <td className='px-2 py-3 text-slate-700'>Score {row.riskScore} • {row.ai}</td>
                        <td className='px-2 py-3 text-slate-700'>{row.shift}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className='panel-card xl:col-span-2'>
              <h2 className='mb-4 text-lg font-semibold text-slate-900'>Medication reminders</h2>
              <div className='space-y-3'>
                <div className='rounded-xl border border-slate-200 p-3'>
                  <div className='flex items-center justify-between'>
                    <p className='text-sm font-semibold text-slate-900'>Go to Medication Desk</p>
                    <Pill className='h-3.5 w-3.5 text-slate-500' />
                  </div>
                  <p className='mt-1 text-xs text-slate-600'>Track active medication orders and reminders.</p>
                  <Link href="/medications" className='mt-2 inline-block text-sm font-semibold text-sky-700'>Open medications</Link>
                </div>
              </div>
            </article>
          </section>

          <section className='mt-6 grid gap-6 xl:grid-cols-5'>
            <article className='panel-card xl:col-span-3'>
              <div className='mb-4 flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>Charts & statistics</h2>
                  <p className='text-sm text-slate-500'>Weekly incident trend and admissions (chart-style bars)</p>
                </div>
                <span className='metric-chip'>Static sample data</span>
              </div>
              <div className='grid gap-4'>
                <div>
                  <div className='mb-2 flex items-center justify-between text-xs text-slate-600'>
                    <span>AI risk incidents</span>
                    <span className='inline-flex items-center gap-1'>
                      <LineChart className='h-3.5 w-3.5' />
                      Avg 12 / day
                    </span>
                  </div>
                  <div className='flex items-end gap-2'>
                    {trendBars.map((point) => (
                      <div key={point.label} className='flex-1'>
                        <div className='mb-1 h-28 rounded-md bg-slate-100 px-2 py-1'>
                          <div className='mx-auto rounded bg-gradient-to-t from-rose-500 to-rose-300' style={{ height: `${point.incidents * 3}px` }} />
                        </div>
                        <p className='text-center text-xs text-slate-600'>{point.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className='mb-2 text-sm font-medium text-slate-700'>Admissions trend</p>
                  <div className='space-y-2'>
                    {trendBars.map((point) => (
                      <div key={`${point.label}-a`} className='flex items-center gap-2 text-xs'>
                        <span className='w-8 text-slate-500'>{point.label}</span>
                        <div className='h-2.5 flex-1 rounded-full bg-slate-100'>
                          <div
                            className='h-2.5 rounded-full bg-gradient-to-r from-sky-500 to-sky-300'
                            style={{ width: `${Math.max(15, point.admissions * 6)}%` }}
                          />
                        </div>
                        <span className='w-8 text-slate-500'>{point.admissions}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>

            <article className='panel-card xl:col-span-2'>
              <h2 className='mb-4 text-lg font-semibold text-slate-900'>Care quality actions</h2>
              <ul className='space-y-3'>
                <li className='rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900'>
                  Escalation lag currently 11.2 min (goal: under 8 min)
                </li>
                <li className='rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900'>
                  95% of nursing notes completed before shift handover
                </li>
                <li className='rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'>
                  7 residents require pressure-reduction rounds this shift
                </li>
                <li className='rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700'>
                  Top action: assign one additional RN during evening handover for rehab wing
                </li>
              </ul>
              <button className='mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-sm font-semibold text-white'>
                <Calendar className='h-4 w-4' />
                Open shift operations log
              </button>
            </article>
          </section>
        </main>
      </div>
    </div>
  )
}