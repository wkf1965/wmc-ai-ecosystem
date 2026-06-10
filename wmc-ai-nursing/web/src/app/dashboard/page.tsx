"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import {
  ArrowRight,
  AlertTriangle,
  BedDouble,
  Bell,
  Building2,
  Calendar,
  CalendarClock,
  Clock3,
  Boxes,
  Activity,
  LineChart,
  Pill,
  Search,
  Smartphone,
  ShieldCheck,
  ShieldX,
  Users,
} from "lucide-react"
import { analyzePatientRisk, riskSeverity, type PatientRiskProfile } from "../../lib/aiRiskDetection"
import { CLINICAL_DATA_UPDATE_EVENT, listPatients, syncPatientsFromTelegramAdmissions } from "../../lib/patientManagement"
import { listNotes } from "../../lib/nursingNotes"
import {
  escalationSeverityTone,
  escalationStatusLabel,
  escalationStatusTone,
  listEscalations,
  type EscalationRecord,
} from "../../lib/aiEscalations"
import RiskBrainTester from "../../components/RiskBrainTester"

// Initial placeholders only. Every value + trend is recomputed from live
// records by buildKpiRows() on mount and on each data update — no mock numbers.
const kpiCardBlueprints = [
  {
    title: "Residents in care",
    value: "—",
    trend: "from patient records",
    tone: "emerald",
    icon: Users,
  },
  {
    title: "Nursing notes (24h)",
    value: "—",
    trend: "last 24 hours",
    tone: "sky",
    icon: ShieldCheck,
  },
  {
    title: "AI watchlist",
    value: "—",
    trend: "high severity",
    tone: "amber",
    icon: AlertTriangle,
  },
  {
    title: "Immediate escalations",
    value: "—",
    trend: "requires nurse review",
    tone: "rose",
    icon: ShieldX,
  },
  {
    title: "Critical AI escalations",
    value: "—",
    trend: "live monitoring",
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
  { name: "Inventory", href: "/inventory" },
  { name: "Vital Signs", href: "/vital-signs" },
  { name: "Turning / Position Care", href: "/turning" },
  { name: "Turning Supervisor Review", href: "/turning-supervisor-review" },
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

type VitalsRow = {
  id: string
  room: string
  patientName: string
  temperature: string
  bloodPressure: string
  pulse: string
  spo2: string
  glucose: string
  nurseName: string
  recordedAt: string
}

type ClinicalAlertRow = {
  id: string
  patientName: string
  room: string
  alertType: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM"
  detail: string
  detectedAt: string
  resolved: boolean
}

type InventoryItemRow = {
  id: string
  itemName: string
  quantity: number
  unit: string
  rate: number
}

type InventoryRecordRow = {
  id: string
  itemId: string
  itemName: string
  quantityChange: number
  unitRate: number
  patientName: string
  room: string
  personInCharge: string
  actionType: string
  recordedAt: string
}

type NursingServiceRow = {
  id: string
  serviceId: string
  serviceName: string
  patientName: string
  room: string
  nurseName: string
  recordedAt: string
  quantity: number
  unitRate: number
  totalAmount: number
  remarks: string
  status: "pending" | "completed" | "billed"
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
  // ── Residents in care: live patient count ─────────────────────────────────
  const residentCount = patients.length

  // ── Nursing notes (24h): count notes recorded in the last 24 hours ────────
  const allNotes = listNotes()
  const since = Date.now() - 24 * 60 * 60 * 1000
  const notes24h = allNotes.filter((note) => {
    const ts = new Date(note.recordedAt || note.date).getTime()
    return Number.isFinite(ts) && ts >= since
  }).length

  // ── AI risk metrics derived from live patient risk scoring ────────────────
  const highRiskCount = patients.filter((person) => person.severity === "orange" || person.severity === "red").length
  const redRiskCount = patients.filter((person) => person.severity === "red").length
  const criticalEscalationCount = escalations.length

  return kpiCardBlueprints.map((card) => {
    switch (card.title) {
      case "Residents in care":
        return {
          ...card,
          value: String(residentCount),
          trend: residentCount === 1 ? "1 active resident" : `${residentCount} active residents`,
        }
      case "Nursing notes (24h)":
        return {
          ...card,
          value: String(notes24h),
          trend: `${allNotes.length} total on record`,
        }
      case "AI watchlist":
        return {
          ...card,
          value: String(highRiskCount),
          trend: `${redRiskCount} high severity`,
        }
      case "Immediate escalations":
        return { ...card, value: String(redRiskCount), trend: "requires nurse review" }
      case "Critical AI escalations":
        return {
          ...card,
          value: String(criticalEscalationCount),
          trend: criticalEscalationCount > 0 ? "action required" : "none active",
        }
      default:
        return card
    }
  })
}

export default function DashboardPage() {
  const pathname = usePathname()
  const [rows, setRows] = useState<DashboardPatientRow[]>([])
  const [kpiCards, setKpiCards] = useState(() => kpiCardBlueprints)
  const [alerts, setAlerts] = useState<DashboardAlert[]>([])
  const [criticalEscalations, setCriticalEscalations] = useState<DashboardEscalation[]>([])
  const [lastSyncAt, setLastSyncAt] = useState("")
  const [nextRetryMs, setNextRetryMs] = useState<number | null>(null)
  const [vitalsRows, setVitalsRows] = useState<VitalsRow[]>([])
  const [clinicalAlerts, setClinicalAlerts] = useState<ClinicalAlertRow[]>([])
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null)
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRow[]>([])
  const [inventoryRecords, setInventoryRecords] = useState<InventoryRecordRow[]>([])
  const [nursingServices, setNursingServices] = useState<NursingServiceRow[]>([])

  useEffect(() => {
    let mounted = true
    const loadInventory = async () => {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" })
        const json = await res.json().catch(() => null)
        if (mounted && json?.ok && json?.data) {
          setInventoryItems(Array.isArray(json.data.inventory) ? json.data.inventory : [])
          setInventoryRecords(Array.isArray(json.data.records) ? json.data.records : [])
        }
      } catch {
        // ignore
      }
    }
    void loadInventory()
    const timer = window.setInterval(loadInventory, 20000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const loadNursingServices = async () => {
      try {
        const res = await fetch("/api/nursing-services", { cache: "no-store" })
        const json = await res.json().catch(() => null)
        if (mounted && json?.ok && json?.data) {
          setNursingServices(Array.isArray(json.data.records) ? json.data.records : [])
        }
      } catch {
        // ignore
      }
    }
    void loadNursingServices()
    const timer = window.setInterval(loadNursingServices, 20000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const loadVitals = async () => {
      try {
        const res = await fetch("/api/vitals", { cache: "no-store" })
        const json = await res.json().catch(() => null)
        if (mounted && json?.ok && Array.isArray(json.data)) {
          setVitalsRows(json.data.slice(0, 12))
        }
      } catch {
        // ignore — section just stays empty
      }
    }
    void loadVitals()
    const timer = window.setInterval(loadVitals, 20000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  const loadClinicalAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/clinical-alerts", { cache: "no-store" })
      const json = await res.json().catch(() => null)
      if (json?.ok && Array.isArray(json.data)) {
        setClinicalAlerts(json.data.slice(0, 30))
      }
    } catch {
      // ignore — section just stays empty
    }
  }, [])

  useEffect(() => {
    void loadClinicalAlerts()
    const timer = window.setInterval(() => void loadClinicalAlerts(), 20000)
    return () => window.clearInterval(timer)
  }, [loadClinicalAlerts])

  const resolveAlert = useCallback(
    async (id: string) => {
      setResolvingAlertId(id)
      try {
        await fetch("/api/clinical-alerts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "resolve", id }),
        })
        await loadClinicalAlerts()
      } catch {
        // ignore
      } finally {
        setResolvingAlertId(null)
      }
    },
    [loadClinicalAlerts],
  )

  const activeClinicalAlerts = clinicalAlerts.filter((a) => !a.resolved)
  const criticalClinicalAlerts = activeClinicalAlerts.filter((a) => a.severity === "CRITICAL")

  const inventoryToday = inventoryRecords.filter((r) => {
    if (r.actionType === "added" || Number(r.quantityChange) >= 0) return false
    const d = new Date(r.recordedAt)
    if (Number.isNaN(d.getTime())) return false
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  })
  const inventoryUsedTodayUnits = inventoryToday.reduce((s, r) => s + Math.abs(r.quantityChange), 0)
  const inventoryLowStock = inventoryItems.filter((i) => i.quantity <= 5)

  const isSameDay = (value: string) => {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return false
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  }
  const isSameMonth = (value: string) => {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return false
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }
  const rm = (value: number) => `RM${(Number(value) || 0).toFixed(2)}`

  const servicesToday = nursingServices.filter((r) => isSameDay(r.recordedAt))
  const servicesTodayCharges = servicesToday.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0)
  const servicesMonthCharges = nursingServices
    .filter((r) => isSameMonth(r.recordedAt))
    .reduce((s, r) => s + (Number(r.totalAmount) || 0), 0)

  // Patient billing — monthly bill = inventory charges (units × snapshot rate) + nursing service charges.
  const patientBilling = (() => {
    const map = new Map<
      string,
      { patient: string; room: string; serviceCharges: number; serviceCount: number; inventoryCharges: number }
    >()
    const keyOf = (patient: string) => (patient || "").trim().toLowerCase() || "(unspecified)"
    for (const r of nursingServices) {
      if (!isSameMonth(r.recordedAt)) continue
      const patient = (r.patientName || "").trim() || "(unspecified)"
      const k = keyOf(patient)
      const cur = map.get(k) || { patient, room: r.room || "-", serviceCharges: 0, serviceCount: 0, inventoryCharges: 0 }
      cur.serviceCharges += Number(r.totalAmount) || 0
      cur.serviceCount += 1
      if (!cur.room || cur.room === "-") cur.room = r.room || "-"
      map.set(k, cur)
    }
    for (const r of inventoryRecords) {
      if (r.actionType === "added" || Number(r.quantityChange) >= 0) continue
      if (!isSameMonth(r.recordedAt)) continue
      const patient = (r.patientName || "").trim()
      if (!patient) continue
      const k = keyOf(patient)
      const cur = map.get(k) || { patient, room: r.room || "-", serviceCharges: 0, serviceCount: 0, inventoryCharges: 0 }
      cur.inventoryCharges += Math.abs(Number(r.quantityChange) || 0) * (Number(r.unitRate) || 0)
      if (!cur.room || cur.room === "-") cur.room = r.room || "-"
      map.set(k, cur)
    }
    return Array.from(map.values())
      .map((row) => ({ ...row, total: Math.round((row.serviceCharges + row.inventoryCharges) * 100) / 100 }))
      .sort((a, b) => b.total - a.total)
  })()

  useEffect(() => {
    let mounted = true
    let inFlight = false
    let retryCount = 0
    let retryTimer: number | null = null

    const scheduleNextPoll = (delayMs = 20000) => {
      if (!mounted) return
      if (retryTimer) window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(() => {
        void refreshFromSources()
      }, delayMs)
    }

    const refreshRows = () => {
      if (!mounted) return
      const latestRows = buildRows(false)
      const escalations = buildCriticalEscalations()
      setRows(latestRows.slice(0, 6))
      setCriticalEscalations(escalations)
      setKpiCards(buildKpiRows(latestRows, escalations))
      setAlerts(buildAlerts(latestRows))
    }

    const refreshFromSources = async () => {
      if (!mounted || inFlight) return
      inFlight = true
      try {
        await syncPatientsFromTelegramAdmissions()
        refreshRows()
        setLastSyncAt(new Date().toLocaleTimeString())
        setNextRetryMs(null)
        retryCount = 0
        scheduleNextPoll(20000)
      } catch (error) {
        const nextRetry = Math.min(retryCount + 1, 3)
        retryCount = nextRetry
        const backoffDelay = 20000 * Math.pow(2, nextRetry)
        setNextRetryMs(backoffDelay)
        console.error("[dashboard-loop] sync failed, scheduling retry", { backoffDelay, error })
        scheduleNextPoll(backoffDelay)
      } finally {
        inFlight = false
      }
    }

    void refreshFromSources()
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("wmc_nursing_")) refreshRows()
    }
    window.addEventListener("storage", onStorage)
    const onUpdate = () => refreshRows()
    window.addEventListener(CLINICAL_DATA_UPDATE_EVENT, onUpdate)
    return () => {
      mounted = false
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(CLINICAL_DATA_UPDATE_EVENT, onUpdate)
      if (retryTimer) window.clearTimeout(retryTimer)
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
              <p className='mt-1 text-xs text-slate-500'>
                Loop sync: {lastSyncAt ? `ok at ${lastSyncAt}` : "starting..."}
                {nextRetryMs ? ` | retry in ${Math.ceil(nextRetryMs / 1000)}s` : ""}
              </p>
            </div>
            <div className='flex items-center gap-2 sm:gap-3'>
              <Link
                href='/mobile'
                className='inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700'
              >
                <Smartphone className='h-4 w-4' />
                <span className='hidden sm:inline'>Open Nurse Mobile Input</span>
                <span className='sm:hidden'>Mobile</span>
              </Link>
              <label className='relative hidden lg:block'>
                <Search className='pointer-events-none absolute left-2 top-2 h-4 w-4 text-slate-400' />
                <input
                  placeholder='Search patient or room'
                  className='w-full max-w-sm rounded-lg border border-slate-200 bg-white px-8 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none'
                />
              </label>
              <button className='hidden items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white sm:inline-flex'>
                <Bell className='h-4 w-4' />
                Create alert
              </button>
            </div>
          </div>
        </header>

        <main className='mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6'>
          <section className='grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4'>
            {kpiCards.map((card) => {
              const Icon = card.icon
              return (
                <article
                  key={card.title}
                  className={`panel-card border border-slate-200 bg-gradient-to-br ${kpiTone[card.tone]}`}
                >
                  <div className='mb-3 flex items-start justify-between'>
                    <div>
                      <p className='panel-title text-xs sm:text-sm'>{card.title}</p>
                      <p className='mt-2 text-2xl font-bold text-slate-900 sm:text-3xl'>{card.value}</p>
                    </div>
                    <span className='rounded-xl border border-white/60 bg-white/70 p-2 text-slate-600'>
                      <Icon className='h-5 w-5' />
                    </span>
                  </div>
                  <p className='text-xs text-slate-600 sm:text-sm'>{card.trend}</p>
                </article>
              )
            })}
          </section>

          <section className='mt-6'>
            <article className='panel-card'>
              <header className='mb-4 flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>Latest Vital Signs</h2>
                  <p className='text-sm text-slate-500'>Live from Telegram and nurse mobile input</p>
                </div>
                <span className='metric-chip'>{vitalsRows.length} recent</span>
              </header>
              {vitalsRows.length === 0 ? (
                <p className='rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500'>
                  No vital signs recorded yet. Nurses can type e.g. “Room 201 BP 130/80 Pulse 76 SpO2 98” in Telegram.
                </p>
              ) : (
                <div className='-mx-2 overflow-x-auto'>
                  <table className='w-full min-w-[760px] border-collapse text-sm'>
                    <thead>
                      <tr className='border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500'>
                        <th className='px-3 py-2 font-semibold'>Patient</th>
                        <th className='px-3 py-2 font-semibold'>Room</th>
                        <th className='px-3 py-2 font-semibold'>BP</th>
                        <th className='px-3 py-2 font-semibold'>Pulse</th>
                        <th className='px-3 py-2 font-semibold'>SpO2</th>
                        <th className='px-3 py-2 font-semibold'>Temp</th>
                        <th className='px-3 py-2 font-semibold'>Glucose</th>
                        <th className='px-3 py-2 font-semibold'>Recorded By</th>
                        <th className='px-3 py-2 font-semibold'>Recorded At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vitalsRows.map((row) => (
                        <tr key={row.id} className='border-b border-slate-100 text-slate-700'>
                          <td className='px-3 py-2 font-medium text-slate-900'>{row.patientName || "-"}</td>
                          <td className='px-3 py-2'>{row.room || "-"}</td>
                          <td className='px-3 py-2'>{row.bloodPressure || "-"}</td>
                          <td className='px-3 py-2'>{row.pulse || "-"}</td>
                          <td className='px-3 py-2'>{row.spo2 || "-"}</td>
                          <td className='px-3 py-2'>{row.temperature || "-"}</td>
                          <td className='px-3 py-2'>{row.glucose || "-"}</td>
                          <td className='px-3 py-2'>{row.nurseName || "-"}</td>
                          <td className='px-3 py-2 whitespace-nowrap text-xs text-slate-500'>
                            {row.recordedAt ? new Date(row.recordedAt).toLocaleString() : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>

          <section className='mt-6'>
            <article className='panel-card'>
              <header className='mb-4 flex flex-wrap items-center justify-between gap-2'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>Clinical Alerts</h2>
                  <p className='text-sm text-slate-500'>
                    Auto-detected from vital signs NLP (SpO2, BP, pulse, nutrition)
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  {criticalClinicalAlerts.length > 0 ? (
                    <span className='rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700'>
                      {criticalClinicalAlerts.length} critical
                    </span>
                  ) : null}
                  <span className='metric-chip'>{activeClinicalAlerts.length} active</span>
                </div>
              </header>

              {criticalClinicalAlerts.length > 0 ? (
                <div className='mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                  {criticalClinicalAlerts.map((a) => (
                    <article
                      key={`crit-${a.id}`}
                      className='rounded-xl border-2 border-red-300 bg-red-50 p-4 shadow-sm'
                    >
                      <p className='text-xs font-bold uppercase tracking-wide text-red-700'>
                        ⚠️ {a.alertType} · CRITICAL
                      </p>
                      <p className='mt-1 text-base font-bold text-red-900'>{a.patientName}</p>
                      <p className='text-sm text-red-800'>Room {a.room} · {a.detail}</p>
                      <p className='mt-2 text-xs text-red-600'>
                        {a.detectedAt ? new Date(a.detectedAt).toLocaleString() : "-"}
                      </p>
                      <button
                        type='button'
                        onClick={() => void resolveAlert(a.id)}
                        disabled={resolvingAlertId === a.id}
                        className='mt-3 inline-flex min-h-[36px] items-center rounded-lg bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-60'
                      >
                        {resolvingAlertId === a.id ? "Resolving…" : "Mark resolved"}
                      </button>
                    </article>
                  ))}
                </div>
              ) : null}

              {clinicalAlerts.length === 0 ? (
                <p className='rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500'>
                  No clinical alerts. Alerts are raised automatically when nurses report abnormal
                  vitals (e.g. “Room 201 140/89 SpO2 56 poor appetite”).
                </p>
              ) : (
                <div className='-mx-2 overflow-x-auto'>
                  <table className='w-full min-w-[760px] border-collapse text-sm'>
                    <thead>
                      <tr className='border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500'>
                        <th className='px-3 py-2 font-semibold'>Patient</th>
                        <th className='px-3 py-2 font-semibold'>Room</th>
                        <th className='px-3 py-2 font-semibold'>Alert Type</th>
                        <th className='px-3 py-2 font-semibold'>Severity</th>
                        <th className='px-3 py-2 font-semibold'>Detected Time</th>
                        <th className='px-3 py-2 font-semibold'>Resolved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clinicalAlerts.map((a) => {
                        const sevClass =
                          a.severity === "CRITICAL"
                            ? "bg-red-100 text-red-700"
                            : a.severity === "HIGH"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-yellow-100 text-yellow-700"
                        return (
                          <tr
                            key={a.id}
                            className={`border-b border-slate-100 text-slate-700 ${
                              !a.resolved && a.severity === "CRITICAL" ? "bg-red-50" : ""
                            }`}
                          >
                            <td className='px-3 py-2 font-medium text-slate-900'>{a.patientName || "-"}</td>
                            <td className='px-3 py-2'>{a.room || "-"}</td>
                            <td className='px-3 py-2'>
                              <span className='font-medium'>{a.alertType}</span>
                              <span className='block text-xs text-slate-500'>{a.detail}</span>
                            </td>
                            <td className='px-3 py-2'>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sevClass}`}>
                                {a.severity}
                              </span>
                            </td>
                            <td className='px-3 py-2 whitespace-nowrap text-xs text-slate-500'>
                              {a.detectedAt ? new Date(a.detectedAt).toLocaleString() : "-"}
                            </td>
                            <td className='px-3 py-2'>
                              {a.resolved ? (
                                <span className='text-xs font-semibold text-emerald-600'>Resolved</span>
                              ) : (
                                <button
                                  type='button'
                                  onClick={() => void resolveAlert(a.id)}
                                  disabled={resolvingAlertId === a.id}
                                  className='rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60'
                                >
                                  {resolvingAlertId === a.id ? "…" : "Resolve"}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>

          <section className='mt-6'>
            <article className='panel-card'>
              <header className='mb-4 flex flex-wrap items-center justify-between gap-2'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>Inventory usage</h2>
                  <p className='text-sm text-slate-500'>Live consumption from Nurse Mode and Telegram</p>
                </div>
                <div className='flex items-center gap-2'>
                  {inventoryLowStock.length > 0 ? (
                    <span className='rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700'>
                      {inventoryLowStock.length} low stock
                    </span>
                  ) : null}
                  <Link href='/rate-settings' className='metric-chip'>
                    Rate setup
                  </Link>
                  <Link href='/inventory' className='metric-chip'>
                    Manage
                  </Link>
                </div>
              </header>

              <div className='mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4'>
                <div className='rounded-xl bg-amber-50 p-3'>
                  <p className='text-2xl font-bold text-amber-700'>{inventoryUsedTodayUnits}</p>
                  <p className='text-xs font-semibold text-amber-700'>Units used today</p>
                </div>
                <div className='rounded-xl bg-slate-50 p-3'>
                  <p className='text-2xl font-bold text-slate-900'>{inventoryToday.length}</p>
                  <p className='text-xs font-semibold text-slate-500'>Usage events today</p>
                </div>
                <div className='rounded-xl bg-slate-50 p-3'>
                  <p className='text-2xl font-bold text-slate-900'>{inventoryItems.length}</p>
                  <p className='text-xs font-semibold text-slate-500'>Tracked items</p>
                </div>
                <div className='rounded-xl bg-rose-50 p-3'>
                  <p className='text-2xl font-bold text-rose-700'>{inventoryLowStock.length}</p>
                  <p className='text-xs font-semibold text-rose-700'>Low stock (≤5)</p>
                </div>
              </div>

              <div className='grid gap-2 sm:grid-cols-3 lg:grid-cols-4'>
                {inventoryItems.map((it) => {
                  const low = it.quantity <= 5
                  return (
                    <div
                      key={it.id}
                      className={`rounded-xl border p-3 ${low ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}
                    >
                      <p className='text-xs font-semibold text-slate-500'>{it.itemName}</p>
                      <p className={`mt-0.5 text-xl font-bold ${low ? "text-rose-700" : "text-slate-900"}`}>
                        {it.quantity}{" "}
                        <span className='text-xs font-medium text-slate-400'>{it.unit}</span>
                      </p>
                    </div>
                  )
                })}
                {inventoryItems.length === 0 ? (
                  <p className='text-sm text-slate-500'>No inventory items yet.</p>
                ) : null}
              </div>
            </article>
          </section>

          <section className='mt-6'>
            <article className='panel-card'>
              <header className='mb-4 flex flex-wrap items-center justify-between gap-2'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>Nursing services &amp; billing</h2>
                  <p className='text-sm text-slate-500'>Chargeable procedures from Nurse Mode and Telegram</p>
                </div>
                <div className='flex items-center gap-2'>
                  <Link href='/rate-settings' className='metric-chip'>
                    Rate setup
                  </Link>
                </div>
              </header>

              <div className='mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4'>
                <div className='rounded-xl bg-cyan-50 p-3'>
                  <p className='text-2xl font-bold text-cyan-700'>{servicesToday.length}</p>
                  <p className='text-xs font-semibold text-cyan-700'>Services today</p>
                </div>
                <div className='rounded-xl bg-cyan-50 p-3'>
                  <p className='text-2xl font-bold text-cyan-700'>{rm(servicesTodayCharges)}</p>
                  <p className='text-xs font-semibold text-cyan-700'>Charges today</p>
                </div>
                <div className='rounded-xl bg-sky-50 p-3'>
                  <p className='text-2xl font-bold text-sky-700'>{rm(servicesMonthCharges)}</p>
                  <p className='text-xs font-semibold text-sky-700'>Monthly charges</p>
                </div>
                <div className='rounded-xl bg-slate-50 p-3'>
                  <p className='text-2xl font-bold text-slate-900'>{patientBilling.length}</p>
                  <p className='text-xs font-semibold text-slate-500'>Patients billed (month)</p>
                </div>
              </div>

              <div className='grid gap-6 lg:grid-cols-2'>
                <div>
                  <h3 className='mb-2 text-sm font-semibold text-slate-700'>Recent services</h3>
                  <div className='overflow-x-auto'>
                    <table className='w-full min-w-[420px] text-sm'>
                      <thead>
                        <tr className='border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500'>
                          <th className='px-2 py-2 font-semibold'>Service</th>
                          <th className='px-2 py-2 font-semibold'>Patient</th>
                          <th className='px-2 py-2 font-semibold'>Room</th>
                          <th className='px-2 py-2 font-semibold'>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nursingServices.slice(0, 8).map((r) => (
                          <tr key={r.id} className='border-b border-slate-100 text-slate-700'>
                            <td className='px-2 py-2 font-medium text-slate-900'>{r.serviceName}</td>
                            <td className='px-2 py-2'>{r.patientName || "-"}</td>
                            <td className='px-2 py-2'>{r.room || "-"}</td>
                            <td className='px-2 py-2 font-semibold'>{rm(r.totalAmount)}</td>
                          </tr>
                        ))}
                        {nursingServices.length === 0 ? (
                          <tr>
                            <td colSpan={4} className='px-2 py-6 text-center text-sm text-slate-500'>
                              No nursing service charges yet.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className='mb-2 text-sm font-semibold text-slate-700'>Monthly patient bill (this month)</h3>
                  <div className='overflow-x-auto'>
                    <table className='w-full min-w-[460px] text-sm'>
                      <thead>
                        <tr className='border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500'>
                          <th className='px-2 py-2 font-semibold'>Patient</th>
                          <th className='px-2 py-2 font-semibold'>Room</th>
                          <th className='px-2 py-2 font-semibold'>Inventory</th>
                          <th className='px-2 py-2 font-semibold'>Services</th>
                          <th className='px-2 py-2 font-semibold'>Total bill</th>
                        </tr>
                      </thead>
                      <tbody>
                        {patientBilling.slice(0, 8).map((r) => (
                          <tr key={r.patient} className='border-b border-slate-100 text-slate-700'>
                            <td className='px-2 py-2 font-medium text-slate-900'>{r.patient}</td>
                            <td className='px-2 py-2'>{r.room}</td>
                            <td className='px-2 py-2'>{rm(r.inventoryCharges)}</td>
                            <td className='px-2 py-2'>{rm(r.serviceCharges)}</td>
                            <td className='px-2 py-2 font-semibold text-slate-900'>{rm(r.total)}</td>
                          </tr>
                        ))}
                        {patientBilling.length === 0 ? (
                          <tr>
                            <td colSpan={5} className='px-2 py-6 text-center text-sm text-slate-500'>
                              No patient charges this month.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section className='mt-6'>
            <RiskBrainTester />
          </section>

          <section className='mt-6 grid gap-6 lg:grid-cols-5'>
            <article className='panel-card lg:col-span-3'>
              <header className='mb-4 flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>AI risk alerts</h2>
                  <p className='text-sm text-slate-500'>Color-coded cards from nursing-note risk scoring</p>
                </div>
                <span className='metric-chip'>{lastSyncAt ? `Last sync ${lastSyncAt}` : "Syncing..."}</span>
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
                  <p className='text-sm text-slate-500'>Auto-created from nursing-note risk scoring (score ≥ 80 or critical keywords)</p>
                </div>
                <span className='metric-chip'>{criticalEscalations.length} active</span>
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
            <article className='panel-card lg:col-span-2'>
              <header className='mb-4 flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>Inventory module</h2>
                  <p className='text-sm text-slate-500'>Editable stock and product in-charge tracking for nursing supplies</p>
                </div>
                <span className='metric-chip'>New module</span>
              </header>
              <div className='rounded-xl border border-slate-200 p-4'>
                <p className='text-sm text-slate-600'>Manage pampers, wet tissu, ryles tube, CBD tube, and prime edema stock records.</p>
                <Link href="/inventory" className='mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white'>
                  <Boxes className='h-4 w-4' />
                  Open Inventory Module
                </Link>
              </div>
            </article>
            <article className='panel-card lg:col-span-2'>
              <header className='mb-4 flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>Turning / Position Care</h2>
                  <p className='text-sm text-slate-500'>2-hourly position updates from Telegram turning workflow</p>
                </div>
                <span className='metric-chip'>Telegram wired</span>
              </header>
              <div className='rounded-xl border border-slate-200 p-4'>
                <p className='text-sm text-slate-600'>Monitor left/right/supine/prone turns, next due time, and due-soon or overdue status.</p>
                <Link href="/turning" className='mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white'>
                  <BedDouble className='h-4 w-4' />
                  Open Turning / Position Care
                </Link>
                <Link href="/turning-supervisor-review" className='mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700'>
                  <ShieldCheck className='h-4 w-4' />
                  Open Turning Supervisor Review
                </Link>
              </div>
            </article>
            <article className='panel-card lg:col-span-2'>
              <header className='mb-4 flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>Vital signs module</h2>
                  <p className='text-sm text-slate-500'>Blood pressure, pulse, temperature, SpO2, blood sugar and remarks</p>
                </div>
                <span className='metric-chip'>Telegram wired</span>
              </header>
              <div className='rounded-xl border border-slate-200 p-4'>
                <p className='text-sm text-slate-600'>View Telegram-submitted vitals and link each record to patient and room workflows.</p>
                <Link href="/vital-signs" className='mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white'>
                  <Activity className='h-4 w-4' />
                  Open Vital Signs Module
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