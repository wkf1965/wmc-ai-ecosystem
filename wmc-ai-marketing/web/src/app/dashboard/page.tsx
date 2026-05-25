import Link from "next/link"
import { Card, KpiCard, PageHeader, StatusBadge } from "@wmc/ui"

const quickActions = [
  { label: "Add Nursing Note", href: "/nursing-notes/new", color: "bg-sky-600 hover:bg-sky-700" },
  { label: "Add Side Turning", href: "/side-turning",      color: "bg-violet-600 hover:bg-violet-700" },
  { label: "Add OT",           href: "/overtime",           color: "bg-amber-600 hover:bg-amber-700" },
  { label: "Add Inventory",    href: "/inventory",          color: "bg-slate-600 hover:bg-slate-700" },
  { label: "Add Pampers Usage",href: "/pampers",            color: "bg-pink-600 hover:bg-pink-700" },
]

const kpiCards = [
  { label: "Patients",             value: "128", tone: "good"    as const, href: "/nursing-notes/new" },
  { label: "Nursing Records",      value: "47",  tone: "good"    as const, href: "/nursing-notes/new" },
  { label: "Side Turning (active)",value: "12",  tone: "warn"    as const, href: "/side-turning" },
  { label: "OT Payroll (pending)", value: "3",   tone: "warn"    as const, href: "/overtime" },
]

const operationalCards = [
  {
    title: "Handover", subtitle: "Shift handover status", href: "/handover",
    children: <StatusBadge value="Operational" tone="good" />,
  },
  {
    title: "Inventory", subtitle: "Supplies stock level", href: "/inventory",
    children: <StatusBadge value="Check needed" tone="warn" />,
  },
  {
    title: "Pampers Usage", subtitle: "Today's consumption", href: "/pampers",
    children: <p className="mt-2 text-2xl font-bold text-slate-900">45 <span className="text-sm font-normal text-slate-500">units</span></p>,
  },
  {
    title: "Wet Tissue Usage", subtitle: "Today's consumption", href: "/pampers",
    children: <p className="mt-2 text-2xl font-bold text-slate-900">62 <span className="text-sm font-normal text-slate-500">packs</span></p>,
  },
]

const integrationCards = [
  {
    title: "Telegram Bot Status", subtitle: "Nursing bot connectivity", href: "/settings/telegram",
    children: <StatusBadge value="Active" tone="good" />,
  },
  {
    title: "Google Sheets Status", subtitle: "Data sync connection", href: "/settings/google-sheet",
    children: <StatusBadge value="Connected" tone="good" />,
  },
  {
    title: "Backend API Status", subtitle: "Central backend health", href: "/api/health",
    children: (
      <>
        <StatusBadge value="Healthy" tone="good" />
        <p className="mt-2 font-mono text-xs text-slate-500">/api/health</p>
      </>
    ),
  },
]

export default function DashboardPage() {
  return (
    <div className="min-h-screen p-6">
      <PageHeader
        title="WMC AI Nursing Coordinator"
        description="Central backend health, nursing operations, patients, side turning, OT payroll, handover, and inventory management."
      />

      {/* Quick Actions */}
      <div className="mb-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {quickActions.map(({ label, href, color }) => (
            <Link
              key={href + label}
              href={href}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${color}`}
            >
              <span aria-hidden className="text-base leading-none">＋</span>
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* KPI overview */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map(({ label, value, tone, href }) => (
          <Link
            key={label}
            href={href}
            className="block rounded-2xl transition hover:ring-2 hover:ring-teal-400 hover:ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            <KpiCard label={label} value={value} tone={tone} />
          </Link>
        ))}
      </div>

      {/* Operational modules */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {operationalCards.map(({ title, subtitle, href, children }) => (
          <Link
            key={title}
            href={href}
            className="block rounded-2xl transition hover:ring-2 hover:ring-teal-400 hover:ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            <Card title={title} subtitle={subtitle}>
              {children}
            </Card>
          </Link>
        ))}
      </div>

      {/* Integration & system status */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {integrationCards.map(({ title, subtitle, href, children }) => (
          <Link
            key={title}
            href={href}
            className="block rounded-2xl transition hover:ring-2 hover:ring-teal-400 hover:ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            <Card title={title} subtitle={subtitle}>
              {children}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
