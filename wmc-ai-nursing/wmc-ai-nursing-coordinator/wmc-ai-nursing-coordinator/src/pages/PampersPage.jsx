import { useEffect, useState, useCallback } from 'react'
import { Baby, Droplets, Milk, AlertTriangle, RefreshCw, Package, Users, Wifi, WifiOff } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { fetchDashboardData }  from '../api/inventoryApi'
import { seedDemoDataIfEmpty } from '../db/inventoryStorage'
import { ITEMS, MIN_LEVELS, DEFAULT_STOCK, todayIso, detectAnomalousUsage } from '../lib/inventoryCalculation'

// ── Constants ─────────────────────────────────────────────────────────────────

// Pampers / Wet Tissue / Milk category keys
const PAMPERS_KEYS    = ['PAMPERS_M', 'PAMPERS_L', 'PAMPERS_XL']
const WET_KEY         = 'WET_TISSUE'
const MILK_KEYS       = ['MILK_FULL', 'MILK_LOW']
const CONSUMABLE_KEYS = [...PAMPERS_KEYS, WET_KEY, ...MILK_KEYS]

function fmtTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true })
  } catch { return iso }
}

// ── Stock Card ────────────────────────────────────────────────────────────────

function StockCard({ itemKey, balance }) {
  const meta   = ITEMS[itemKey]
  const qty    = balance[itemKey] ?? DEFAULT_STOCK[itemKey]
  const min    = MIN_LEVELS[itemKey] ?? 0
  const low    = qty < min
  const pct    = Math.min(100, Math.round((qty / (DEFAULT_STOCK[itemKey] ?? 100)) * 100))
  const barClr = low ? 'bg-rose-500' : pct < 40 ? 'bg-amber-400' : 'bg-emerald-500'

  const icons = {
    pampers: Baby,
    wet:     Droplets,
    milk:    Milk,
  }
  const Icon = icons[meta?.category] ?? Package

  return (
    <Card padding="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${low ? 'text-rose-500' : 'text-teal-600'}`} aria-hidden />
          <span className="text-sm font-semibold text-slate-800">{meta?.name ?? itemKey}</span>
        </div>
        <Badge variant={low ? 'danger' : 'success'}>{low ? 'Reorder' : 'OK'}</Badge>
      </div>
      <p className={`text-3xl font-bold tabular-nums ${low ? 'text-rose-600' : 'text-slate-900'}`}>
        {qty}
        <span className="ml-1 text-sm font-normal text-slate-500">{meta?.unit}</span>
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${barClr} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-400">Min level: {min} {meta?.unit}</p>
    </Card>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PampersPage() {
  const [todayLogs, setTodayLogs]     = useState([])
  const [balance, setBalance]         = useState({})
  const [alerts, setAlerts]           = useState([])
  const [patientUsage, setPatientUsage] = useState([])
  const [anomalies, setAnomalies]     = useState([])
  const [loading, setLoading]         = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    seedDemoDataIfEmpty()
    try {
      const d = await fetchDashboardData()

      const today = d.logs.filter((r) => CONSUMABLE_KEYS.includes(r.item_key) && r.timestamp?.startsWith(todayIso()))
      const alts  = d.alerts.filter((a) => CONSUMABLE_KEYS.includes(a.itemKey))

      const usage = d.patientUsage.map((p) => {
        const fb = {}; let total = 0
        for (const [k, q] of Object.entries(p.breakdown ?? {})) {
          if (CONSUMABLE_KEYS.includes(k)) { fb[k] = q; total += q }
        }
        return { ...p, total_qty: total, breakdown: fb }
      }).filter((p) => p.total_qty > 0).sort((a, b) => b.total_qty - a.total_qty)

      const anomalyList = []
      for (const pu of usage) {
        const pampers = (pu.breakdown['PAMPERS_M'] ?? 0) + (pu.breakdown['PAMPERS_L'] ?? 0) + (pu.breakdown['PAMPERS_XL'] ?? 0)
        const wet     = pu.breakdown['WET_TISSUE'] ?? 0
        const milk    = (pu.breakdown['MILK_FULL'] ?? 0) + (pu.breakdown['MILK_LOW'] ?? 0)
        for (const [cat, qty] of [['pampers', pampers], ['wet', wet], ['milk', milk]]) {
          const { flagged, message } = detectAnomalousUsage(pu.patient_name, cat, qty)
          if (flagged) anomalyList.push({ patient_name: pu.patient_name, category: cat, qty, message })
        }
      }

      setTodayLogs(today)
      setBalance(d.balance)
      setAlerts(alts)
      setPatientUsage(usage)
      setAnomalies(anomalyList)
    } catch {
      // silent fail — keep empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const totalToday = todayLogs.reduce((s, r) => s + r.qty, 0)
  const pampersToday = todayLogs.filter((r) => PAMPERS_KEYS.includes(r.item_key)).reduce((s, r) => s + r.qty, 0)
  const wetToday = todayLogs.filter((r) => r.item_key === WET_KEY).reduce((s, r) => s + r.qty, 0)
  const milkToday = todayLogs.filter((r) => MILK_KEYS.includes(r.item_key)).reduce((s, r) => s + r.qty, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Pampers / Wet Tissue / Milk"
          description="Daily consumable usage log, patient tracking, and stock levels for continence care."
        />
        <button
          onClick={refresh}
          disabled={loading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Refresh
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Package,  label: 'Total Items Today',   value: totalToday,   color: 'text-teal-700',   bg: 'bg-teal-50'  },
          { icon: Baby,     label: 'Pampers Today',       value: pampersToday, color: 'text-pink-700',   bg: 'bg-pink-50'  },
          { icon: Droplets, label: 'Wet Tissue Today',    value: wetToday,     color: 'text-sky-700',    bg: 'bg-sky-50'   },
          { icon: Milk,     label: 'Milk Powder Today',   value: milkToday,    color: 'text-amber-700',  bg: 'bg-amber-50' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <Card key={label} padding="p-5">
            <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
              <Icon className={`h-5 w-5 ${color}`} aria-hidden />
            </div>
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          </Card>
        ))}
      </div>

      {/* Anomaly Alerts */}
      {anomalies.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />
            <h3 className="font-semibold text-amber-800">AI Abnormal Usage Detected</h3>
          </div>
          {anomalies.map((a, i) => (
            <p key={i} className="text-sm text-amber-700">{a.message}</p>
          ))}
        </div>
      )}

      {/* Low Stock Alerts */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" aria-hidden />
            <h3 className="font-semibold text-rose-800">Low Stock — Reorder Required</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {alerts.map((a) => (
              <span key={a.itemKey} className="rounded-full border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700">
                ⚠️ {a.name} — only {a.balance} left
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stock Cards */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Stock Levels</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONSUMABLE_KEYS.map((key) => (
            <StockCard key={key} itemKey={key} balance={balance} />
          ))}
        </div>
      </div>

      {/* Patient Usage This Month */}
      <Card padding="p-6">
        <h3 className="mb-4 font-semibold text-slate-900 flex items-center gap-2">
          <Users className="h-4 w-4 text-teal-600" aria-hidden />
          Patient Usage This Month
        </h3>
        {patientUsage.length === 0 ? (
          <p className="text-sm text-slate-400">No data recorded this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 text-left">#</th>
                  <th className="py-2 pr-4 text-left">Patient</th>
                  <th className="py-2 pr-4 text-left">Room</th>
                  <th className="py-2 pr-4 text-right">👶 Pampers</th>
                  <th className="py-2 pr-4 text-right">🧻 Wet Tissue</th>
                  <th className="py-2 pr-4 text-right">🥛 Milk</th>
                  <th className="py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {patientUsage.map((p, i) => {
                  const pampers = (p.breakdown['PAMPERS_M'] ?? 0) + (p.breakdown['PAMPERS_L'] ?? 0) + (p.breakdown['PAMPERS_XL'] ?? 0)
                  const wet     = p.breakdown['WET_TISSUE'] ?? 0
                  const milk    = (p.breakdown['MILK_FULL'] ?? 0) + (p.breakdown['MILK_LOW'] ?? 0)
                  return (
                    <tr key={p.patient_name} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-4 text-slate-400 text-xs">{i + 1}</td>
                      <td className="py-2.5 pr-4 font-medium text-slate-800">{p.patient_name}</td>
                      <td className="py-2.5 pr-4 text-slate-500">{p.room ? `Rm ${p.room}` : '—'}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">{pampers || '—'}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">{wet || '—'}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">{milk || '—'}</td>
                      <td className="py-2.5 text-right font-bold tabular-nums text-slate-900">{p.total_qty}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Today's Activity */}
      <Card padding="p-0">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Today's Activity Log</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 text-left">Time</th>
                <th className="px-5 py-3 text-left">Item</th>
                <th className="px-5 py-3 text-left">Qty</th>
                <th className="px-5 py-3 text-left">Patient</th>
                <th className="px-5 py-3 text-left">Room</th>
                <th className="px-5 py-3 text-left">Nurse</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {todayLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">
                    No consumable usage recorded today.
                  </td>
                </tr>
              ) : todayLogs.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 text-slate-500 text-xs">{fmtTime(r.timestamp)}</td>
                  <td className="px-5 py-2.5 font-medium text-slate-800">{ITEMS[r.item_key]?.emoji} {r.item_name || r.item_key}</td>
                  <td className="px-5 py-2.5 tabular-nums font-semibold text-slate-700">{r.qty}</td>
                  <td className="px-5 py-2.5 text-slate-600">{r.patient_name || '—'}</td>
                  <td className="px-5 py-2.5 text-slate-500">{r.room ? `Rm ${r.room}` : '—'}</td>
                  <td className="px-5 py-2.5 text-slate-600">{r.nurse_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
