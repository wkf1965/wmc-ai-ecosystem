import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Package, AlertTriangle, TrendingDown, Users, Search,
  Plus, RefreshCw, CheckCircle, Clock, BarChart3, Wifi, WifiOff,
  FileDown, Calendar, LayoutList, Shield, Eye, Settings, Smartphone,
  ArrowUpCircle, SlidersHorizontal, Bell, Tag,
} from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import {
  fetchDashboardData,
  postInventoryAdd,
  fetchDailyReport,
  fetchMonthlyPatientReport,
  fetchMonthlyNurseReport,
  fetchLowStockReport,
  fetchAbnormalReport,
  fetchBilling,
  generateBilling,
  updateBillingPrice,
  markBillingPaid,
  fetchBillingPrices,
  fetchAuditTrail,
  fetchAuditByNurse,
  fetchAuditByPatient,
  fetchAuditByItem,
  addStockApi,
  adjustStockApi,
  setMinimumApi,
  setPriceApi,
} from '../api/inventoryApi'
import { seedDemoDataIfEmpty } from '../db/inventoryStorage'
import { ITEMS, DEFAULT_STOCK, MIN_LEVELS, todayIso } from '../lib/inventoryCalculation'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-MY', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch { return iso }
}

function stockPct(key, balance) {
  const def = DEFAULT_STOCK[key] ?? 100
  return Math.min(100, Math.round(((balance[key] ?? def) / def) * 100))
}

function stockColor(pct, key, balance) {
  const qty = balance[key] ?? DEFAULT_STOCK[key]
  const min = MIN_LEVELS[key] ?? 0
  if (qty < min) return 'bg-rose-500'
  if (pct < 40)  return 'bg-amber-400'
  return 'bg-emerald-500'
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color = 'teal' }) {
  const colors = {
    teal:   'from-teal-500 to-cyan-600',
    rose:   'from-rose-500 to-red-600',
    amber:  'from-amber-500 to-orange-500',
    violet: 'from-violet-500 to-purple-600',
  }
  return (
    <Card padding="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${colors[color]} shadow-sm`}>
          <Icon className="h-5 w-5 text-white" aria-hidden />
        </div>
      </div>
    </Card>
  )
}

// ── Add Inventory Form ────────────────────────────────────────────────────────

const ITEM_OPTIONS = Object.entries(ITEMS).map(([key, meta]) => ({
  key, label: `${meta.emoji} ${meta.name}`,
}))

function AddInventoryForm({ onSaved }) {
  const [form, setForm] = useState({
    item_key: 'PAMPERS_M', patient_name: '', room: '', qty: '', nurse_name: '', remarks: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.item_key || !form.qty || Number(form.qty) <= 0) return
    setSaving(true)
    await postInventoryAdd({
      ...form,
      qty: Number(form.qty),
      source: 'web',
      telegram_username: '',
    })
    setSaving(false)
    setSaved(true)
    setForm({ item_key: 'PAMPERS_M', patient_name: '', room: '', qty: '', nurse_name: '', remarks: '' })
    setTimeout(() => setSaved(false), 2500)
    onSaved?.()
  }

  return (
    <Card padding="p-6">
      <h3 className="mb-4 font-semibold text-slate-900 flex items-center gap-2">
        <Plus className="h-4 w-4 text-teal-600" aria-hidden />
        Log Inventory Usage
      </h3>
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Item *</label>
          <select
            value={form.item_key}
            onChange={(e) => set('item_key', e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {ITEM_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Qty *</label>
          <input
            type="number" min="1" value={form.qty}
            onChange={(e) => set('qty', e.target.value)}
            placeholder="e.g. 3"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Patient Name</label>
          <input
            type="text" value={form.patient_name}
            onChange={(e) => set('patient_name', e.target.value)}
            placeholder="e.g. Ahmad Bin Ali"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Room</label>
          <input
            type="text" value={form.room}
            onChange={(e) => set('room', e.target.value)}
            placeholder="e.g. 2"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Nurse Name</label>
          <input
            type="text" value={form.nurse_name}
            onChange={(e) => set('nurse_name', e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Remarks</label>
          <input
            type="text" value={form.remarks}
            onChange={(e) => set('remarks', e.target.value)}
            placeholder="Optional note"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Record'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
              <CheckCircle className="h-4 w-4" aria-hidden /> Saved
            </span>
          )}
        </div>
      </form>
    </Card>
  )
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(rows, filename = 'report.csv') {
  if (!rows || rows.length === 0) return
  const keys = Object.keys(rows[0])
  const csv  = [
    keys.join(','),
    ...rows.map((r) =>
      keys.map((k) => {
        const v = r[k] ?? ''
        return typeof v === 'string' && (v.includes(',') || v.includes('"'))
          ? `"${v.replace(/"/g, '""')}"`
          : v
      }).join(',')
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Reports Tab ───────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  { value: 'daily',           label: '📊 Daily Usage' },
  { value: 'monthly-patient', label: '👤 Monthly Patient' },
  { value: 'monthly-nurse',   label: '👩‍⚕️ Monthly Nurse' },
  { value: 'low-stock',       label: '📦 Low Stock' },
  { value: 'abnormal',        label: '🚨 Abnormal Usage' },
]

const inputCls = 'rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500'
const thCls    = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'
const tdCls    = 'px-4 py-2.5 text-sm text-slate-700'

function ReportsTab() {
  const today     = todayIso()
  const thisMonth = new Date().toISOString().slice(0, 7)

  const [reportType,    setReportType]    = useState('daily')
  const [date,          setDate]          = useState(today)
  const [month,         setMonth]         = useState(thisMonth)
  const [patientFilter, setPatientFilter] = useState('')
  const [nurseFilter,   setNurseFilter]   = useState('')
  const [data,          setData]          = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [source,        setSource]        = useState('')

  const runReport = useCallback(async () => {
    setLoading(true)
    setData(null)
    try {
      let result
      if      (reportType === 'daily')           result = await fetchDailyReport(date)
      else if (reportType === 'monthly-patient') result = await fetchMonthlyPatientReport(month)
      else if (reportType === 'monthly-nurse')   result = await fetchMonthlyNurseReport(month)
      else if (reportType === 'low-stock')       result = await fetchLowStockReport()
      else if (reportType === 'abnormal')        result = await fetchAbnormalReport(date)
      setData(result ?? null)
      setSource(result?.source ?? '')
    } catch { setData(null) }
    finally   { setLoading(false) }
  }, [reportType, date, month])

  useEffect(() => { runReport() }, [runReport])

  // ── Build table rows + columns ────────────────────────────────────────────

  function getTable() {
    if (!data) return { columns: [], rows: [] }

    if (reportType === 'daily') {
      const rows = Object.entries(data.byItem ?? {}).map(([key, qty]) => ({
        item_key: key,
        item:     ITEMS[key]?.name ?? key,
        qty,
        unit:     ITEMS[key]?.unit ?? '',
      })).sort((a, b) => b.qty - a.qty)
      return {
        columns: ['Item', 'Qty', 'Unit'],
        rows,
        render: (row) => [row.item, row.qty, row.unit],
        csvRows: rows,
        summary: `Total: ${data.totalQty} items · ${data.recordCount} records`,
      }
    }

    if (reportType === 'monthly-patient') {
      let rows = data.patients ?? []
      if (patientFilter) rows = rows.filter((r) => r.patient_name?.toLowerCase().includes(patientFilter.toLowerCase()))
      return {
        columns: ['Patient', 'Month', 'Pampers', 'Wet Tissue', 'Milk', 'Gloves', 'Total'],
        rows,
        render: (r) => [r.patient_name, data.month, r.pampers_total ?? 0, r.wet_tissue_total ?? 0, r.milk_total ?? 0, r.gloves_total ?? 0, r.total_qty],
        csvRows: rows.map((r) => ({ patient_name: r.patient_name, month: data.month, pampers: r.pampers_total ?? 0, wet_tissue: r.wet_tissue_total ?? 0, milk: r.milk_total ?? 0, gloves: r.gloves_total ?? 0, total: r.total_qty })),
        summary: `${rows.length} patients · ${rows.reduce((s, r) => s + (r.total_qty ?? 0), 0)} items total`,
      }
    }

    if (reportType === 'monthly-nurse') {
      let rows = data.nurses ?? []
      if (nurseFilter) rows = rows.filter((r) => r.nurse_name?.toLowerCase().includes(nurseFilter.toLowerCase()))
      return {
        columns: ['Nurse', 'Month', 'Pampers', 'Wet Tissue', 'Milk', 'Gloves', 'Total'],
        rows,
        render: (r) => [r.nurse_name, data.month, r.pampers ?? 0, r.wet_tissue ?? 0, r.milk ?? 0, r.gloves ?? 0, r.total_items_taken],
        csvRows: rows.map((r) => ({ nurse_name: r.nurse_name, month: data.month, pampers: r.pampers ?? 0, wet_tissue: r.wet_tissue ?? 0, milk: r.milk ?? 0, gloves: r.gloves ?? 0, total: r.total_items_taken })),
        summary: `${rows.length} nurses · ${rows.reduce((s, r) => s + (r.total_items_taken ?? 0), 0)} items total`,
      }
    }

    if (reportType === 'low-stock') {
      const rows = data.alerts ?? []
      return {
        columns: ['Item', 'Balance', 'Minimum', 'Deficit', 'Status'],
        rows,
        render: (r) => [r.item_name, r.balance, r.minimum_level, r.deficit, r.status],
        csvRows: rows,
        summary: `${rows.length} item${rows.length !== 1 ? 's' : ''} need restocking`,
      }
    }

    if (reportType === 'abnormal') {
      let rows = data.abnormal ?? []
      if (patientFilter) rows = rows.filter((r) => r.patient_name?.toLowerCase().includes(patientFilter.toLowerCase()))
      return {
        columns: ['Patient', 'Item', 'Average/day', 'Today Usage', 'Multiple', '% Above'],
        rows,
        render: (r) => [r.patient_name, r.item_name, r.average_daily, r.today_usage, `${r.multiple}×`, `+${r.pct_above}%`],
        csvRows: rows,
        summary: rows.length === 0 ? '✅ No abnormal usage detected' : `${rows.length} abnormal record${rows.length !== 1 ? 's' : ''}`,
      }
    }
    return { columns: [], rows: [] }
  }

  const table = getTable()
  const needsDate  = reportType === 'daily' || reportType === 'abnormal'
  const needsMonth = reportType === 'monthly-patient' || reportType === 'monthly-nurse'
  const needsPatient = reportType === 'monthly-patient' || reportType === 'abnormal'
  const needsNurse   = reportType === 'monthly-nurse'

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <Card padding="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Report type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className={inputCls}
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Date filter */}
          {needsDate && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${inputCls} pl-9`}
                />
              </div>
            </div>
          )}

          {/* Month filter */}
          {needsMonth && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Month</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className={`${inputCls} pl-9`}
                />
              </div>
            </div>
          )}

          {/* Patient filter */}
          {needsPatient && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Patient</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
                <input
                  type="text"
                  value={patientFilter}
                  onChange={(e) => setPatientFilter(e.target.value)}
                  placeholder="Filter patient…"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </div>
          )}

          {/* Nurse filter */}
          {needsNurse && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Nurse</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
                <input
                  type="text"
                  value={nurseFilter}
                  onChange={(e) => setNurseFilter(e.target.value)}
                  placeholder="Filter nurse…"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </div>
          )}

          {/* Spacer + action buttons */}
          <div className="ml-auto flex items-end gap-2">
            <button
              onClick={runReport}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
              {loading ? 'Loading…' : 'Run Report'}
            </button>
            {table.csvRows?.length > 0 && (
              <button
                onClick={() => exportCSV(table.csvRows, `${reportType}-${date || month}.csv`)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <FileDown className="h-4 w-4 text-slate-500" aria-hidden />
                Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Source badge */}
        {source && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
            {source === 'demo' || source === 'error'
              ? <WifiOff className="h-3.5 w-3.5 text-amber-400" aria-hidden />
              : <Wifi    className="h-3.5 w-3.5 text-emerald-500" aria-hidden />}
            Data source: <strong>{source}</strong>
          </div>
        )}
      </Card>

      {/* Summary banner */}
      {table.summary && !loading && (
        <div className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
          reportType === 'abnormal' && (data?.count ?? 0) > 0
            ? 'bg-rose-50 text-rose-700 border border-rose-200'
            : reportType === 'low-stock' && (data?.count ?? 0) > 0
            ? 'bg-amber-50 text-amber-700 border border-amber-200'
            : 'bg-teal-50 text-teal-700 border border-teal-200'
        }`}>
          {reportType === 'abnormal' && (data?.count ?? 0) > 0 && '🚨 '}
          {reportType === 'low-stock' && (data?.count ?? 0) > 0 && '⚠️ '}
          {table.summary}
        </div>
      )}

      {/* Table */}
      <Card padding="p-0">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Loading report…
            </div>
          ) : table.rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              No data for this selection.
            </div>
          ) : (
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  {table.columns.map((col) => (
                    <th key={col} className={thCls}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {table.rows.map((row, i) => {
                  const cells = table.render(row)
                  return (
                    <tr key={i} className={`hover:bg-slate-50 ${
                      reportType === 'abnormal' ? 'bg-rose-50/30' :
                      reportType === 'low-stock' && row.status === 'OUT_OF_STOCK' ? 'bg-rose-100/40' :
                      reportType === 'low-stock' ? 'bg-amber-50/40' : ''
                    }`}>
                      {cells.map((cell, ci) => (
                        <td key={ci} className={`${tdCls} ${ci === 0 ? 'font-medium text-slate-900' : ''}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}

// ── Billing Tab ───────────────────────────────────────────────────────────────

const DEFAULT_PRICES_UI = { pampers: 2.0, wet: 5.0, milk: 80.0, gloves: 0.5 }
const STATUS_COLOR = {
  Paid:    'bg-emerald-100 text-emerald-700',
  Unpaid:  'bg-rose-100 text-rose-700',
  Waived:  'bg-slate-100 text-slate-500',
}
const CAT_EMOJI = { pampers: '👶', wet: '🧻', milk: '🥛', gloves: '🧤' }

function BillingTab() {
  const thisMonth = new Date().toISOString().slice(0, 7)

  const [month,         setMonth]         = useState(thisMonth)
  const [patientFilter, setPatientFilter] = useState('')
  const [roomFilter,    setRoomFilter]    = useState('')
  const [statusFilter,  setStatusFilter]  = useState('')
  const [billing,       setBilling]       = useState([])
  const [prices,        setPrices]        = useState(DEFAULT_PRICES_UI)
  const [loading,       setLoading]       = useState(false)
  const [generating,    setGenerating]    = useState(false)
  const [source,        setSource]        = useState('')
  const [showPrices,    setShowPrices]    = useState(false)
  const [priceEdit,     setPriceEdit]     = useState({})
  const [savingPrice,   setSavingPrice]   = useState(false)
  const [actionMsg,     setActionMsg]     = useState('')

  const flash = (msg, ms = 2500) => {
    setActionMsg(msg)
    setTimeout(() => setActionMsg(''), ms)
  }

  const loadBilling = useCallback(async () => {
    setLoading(true)
    const res = await fetchBilling({ month, patient_name: patientFilter || undefined, room: roomFilter || undefined, billing_status: statusFilter || undefined })
    setBilling(res.billing ?? [])
    if (res.prices) setPrices(res.prices)
    setSource(res.source ?? '')
    setLoading(false)
  }, [month, patientFilter, roomFilter, statusFilter])

  useEffect(() => { loadBilling() }, [loadBilling])

  // Load prices on mount
  useEffect(() => {
    fetchBillingPrices().then((r) => { if (r.ok) setPrices(r.prices) })
  }, [])

  async function handleGenerate() {
    setGenerating(true)
    const res = await generateBilling({ month, patient_name: patientFilter || undefined })
    setGenerating(false)
    if (res.ok) {
      flash(`✅ Generated ${res.generated} billing rows`)
      loadBilling()
    } else {
      flash('⚠️ Could not generate billing')
    }
  }

  async function handleMarkPaid(patientName, status) {
    const res = await markBillingPaid({ month, patient_name: patientName, billing_status: status })
    if (res.ok) {
      flash(`✅ Marked ${patientName} as ${status}`)
      loadBilling()
    }
  }

  async function handleSavePrices() {
    setSavingPrice(true)
    for (const [cat, val] of Object.entries(priceEdit)) {
      if (val !== '' && !isNaN(Number(val))) {
        await updateBillingPrice(cat, Number(val))
      }
    }
    const r = await fetchBillingPrices()
    if (r.ok) setPrices(r.prices)
    setPriceEdit({})
    setSavingPrice(false)
    flash('✅ Prices updated')
  }

  // Group billing by patient for summary rows
  const grouped = {}
  for (const row of billing) {
    if (!grouped[row.patient_name]) grouped[row.patient_name] = []
    grouped[row.patient_name].push(row)
  }

  // Grand totals per patient
  const patientTotals = Object.entries(grouped).map(([name, rows]) => ({
    patient_name:   name,
    room:           rows[0]?.room ?? '',
    billing_status: rows.some((r) => r.billing_status !== 'Paid' && r.billing_status !== 'Waived') ? 'Unpaid' : 'Paid',
    grand_total:    rows.reduce((s, r) => s + r.total_amount, 0),
    rows,
  }))

  const grandTotal = patientTotals.reduce((s, p) => s + p.grand_total, 0)

  const monthLabel = (() => {
    try { return new Date(month + '-01').toLocaleDateString('en-MY', { month: 'long', year: 'numeric' }) }
    catch { return month }
  })()

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card padding="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Month</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                className={`${inputCls} pl-9`} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Patient</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
              <input type="text" value={patientFilter} onChange={(e) => setPatientFilter(e.target.value)}
                placeholder="Filter patient…" className={`${inputCls} pl-9`} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Room</label>
            <input type="text" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}
              placeholder="e.g. 2" className={`${inputCls} w-24`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
              <option value="">All</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Paid">Paid</option>
              <option value="Waived">Waived</option>
            </select>
          </div>
          <div className="ml-auto flex items-end gap-2 flex-wrap">
            <button onClick={handleGenerate} disabled={generating || loading}
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} aria-hidden />
              {generating ? 'Generating…' : 'Generate Billing'}
            </button>
            {billing.length > 0 && (
              <button
                onClick={() => exportCSV(billing, `billing-${month}.csv`)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <FileDown className="h-4 w-4 text-slate-500" aria-hidden />
                Export CSV
              </button>
            )}
            <button onClick={() => setShowPrices((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              ⚙️ Prices
            </button>
          </div>
        </div>

        {/* Source + action message */}
        <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
          {source && <>
            {source === 'demo' ? <WifiOff className="h-3.5 w-3.5 text-amber-400" /> : <Wifi className="h-3.5 w-3.5 text-emerald-500" />}
            <span>Source: <strong>{source}</strong></span>
          </>}
          {actionMsg && <span className="ml-2 font-medium text-teal-600">{actionMsg}</span>}
        </div>
      </Card>

      {/* Price settings (collapsible) */}
      {showPrices && (
        <Card padding="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">⚙️ Unit Price Settings (RM)</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(prices).map(([cat, price]) => (
              <div key={cat}>
                <label className="mb-1 block text-xs font-medium text-slate-500 capitalize">
                  {CAT_EMOJI[cat]} {cat}
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-500">RM</span>
                  <input
                    type="number" step="0.01" min="0"
                    defaultValue={price}
                    onChange={(e) => setPriceEdit((p) => ({ ...p, [cat]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            ))}
          </div>
          <button onClick={handleSavePrices} disabled={savingPrice}
            className="mt-4 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {savingPrice ? 'Saving…' : 'Save Prices'}
          </button>
        </Card>
      )}

      {/* Summary KPI */}
      {patientTotals.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard icon={Users}        label="Patients Billed"  value={patientTotals.length} sub={monthLabel}                               color="teal"   />
          <KpiCard icon={TrendingDown} label="Total Billed"     value={`RM${grandTotal.toFixed(2)}`} sub="all patients"                    color="violet" />
          <KpiCard icon={AlertTriangle} label="Unpaid"          value={patientTotals.filter((p) => p.billing_status === 'Unpaid').length}   sub="patients pending payment"  color="rose" />
        </div>
      )}

      {/* Billing table */}
      {loading ? (
        <Card padding="p-8">
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading billing…
          </div>
        </Card>
      ) : patientTotals.length === 0 ? (
        <Card padding="p-8">
          <div className="text-center text-sm text-slate-400">
            No billing records for {monthLabel}.<br />
            Click <strong>Generate Billing</strong> to compute from inventory logs.
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {patientTotals.map((pt) => (
            <Card key={pt.patient_name} padding="p-0">
              {/* Patient header */}
              <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50 rounded-t-xl">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-900">{pt.patient_name}</span>
                  {pt.room && <span className="text-xs text-slate-400">Rm {pt.room}</span>}
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[pt.billing_status] ?? ''}`}>
                    {pt.billing_status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">RM{pt.grand_total.toFixed(2)}</span>
                  {pt.billing_status !== 'Paid' && (
                    <button onClick={() => handleMarkPaid(pt.patient_name, 'Paid')}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                      Mark Paid
                    </button>
                  )}
                  {pt.billing_status !== 'Unpaid' && (
                    <button onClick={() => handleMarkPaid(pt.patient_name, 'Unpaid')}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                      Mark Unpaid
                    </button>
                  )}
                  <button onClick={() => handleMarkPaid(pt.patient_name, 'Waived')}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50">
                    Waive
                  </button>
                </div>
              </div>
              {/* Item rows */}
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <th className={thCls}>Item</th>
                    <th className={thCls}>Qty</th>
                    <th className={thCls}>Unit Price</th>
                    <th className={thCls}>Total</th>
                    <th className={thCls}>Status</th>
                    <th className={thCls}>Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pt.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        {CAT_EMOJI[r.item_category] ?? '📦'} {r.item_name}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.total_qty}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">RM{Number(r.unit_price).toFixed(2)}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-slate-900">RM{Number(r.total_amount).toFixed(2)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.billing_status] ?? ''}`}>
                          {r.billing_status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{r.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Audit Tab ─────────────────────────────────────────────────────────────────

const ACTION_COLORS = {
  GIVE_TO_PATIENT:   'bg-teal-100 text-teal-700',
  TAKE_ITEM:         'bg-blue-100 text-blue-700',
  STOCK_ADJUSTMENT:  'bg-amber-100 text-amber-700',
  PRICE_UPDATE:      'bg-orange-100 text-orange-700',
  BILLING_GENERATED: 'bg-violet-100 text-violet-700',
  MARK_PAID:         'bg-emerald-100 text-emerald-700',
  MARK_UNPAID:       'bg-slate-100 text-slate-600',
  MARK_WAIVED:       'bg-sky-100 text-sky-700',
}

function AuditTab() {
  const [records,    setRecords]    = useState([])
  const [suspicious, setSuspicious] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [source,     setSource]     = useState('')
  const [filterNurse,   setFilterNurse]   = useState('')
  const [filterPatient, setFilterPatient] = useState('')
  const [filterItem,    setFilterItem]    = useState('')
  const [filterDate,    setFilterDate]    = useState('')

  const runSearch = useCallback(async () => {
    setLoading(true)
    setSuspicious([])
    try {
      let res
      if (filterNurse.trim()) {
        res = await fetchAuditByNurse(filterNurse.trim(), filterDate || undefined)
        setSuspicious(res.suspicious ?? [])
      } else if (filterPatient.trim()) {
        res = await fetchAuditByPatient(filterPatient.trim())
      } else if (filterItem.trim()) {
        res = await fetchAuditByItem(filterItem.trim(), filterDate || undefined)
      } else {
        res = await fetchAuditTrail({
          date:  filterDate  || undefined,
          limit: 100,
        })
      }
      setRecords(res.records ?? [])
      setSource(res.source ?? '')
    } finally {
      setLoading(false)
    }
  }, [filterNurse, filterPatient, filterItem, filterDate])

  useEffect(() => { runSearch() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function exportCSV() {
    if (!records.length) return
    const headers = ['Timestamp','Action','Nurse','Username','Patient','Room','Item','Qty','Before Stock','After Stock','Source','Remarks']
    const rows = records.map((r) => [
      r.timestamp, r.action_type, r.nurse_name, r.telegram_username,
      r.patient_name, r.room, r.item_name || r.item_key,
      r.qty, r.before_stock, r.after_stock, r.source, r.remarks,
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'audit_trail.csv' })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* Suspicious usage warnings */}
      {suspicious.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-2">
          <p className="font-semibold text-rose-700 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" aria-hidden /> Suspicious Usage Detected
          </p>
          {suspicious.map((s, i) => (
            <div key={i} className="text-sm text-rose-700">
              ⚠️ Nurse: <strong>{filterNurse}</strong> — {s.item_name}: <strong>{s.total_qty}</strong> pcs this shift
              (threshold: {s.threshold})
            </div>
          ))}
        </div>
      )}

      {/* Search filters */}
      <Card padding="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Search by Nurse</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="e.g. Aina"
              value={filterNurse}
              onChange={(e) => { setFilterNurse(e.target.value); setFilterPatient(''); setFilterItem('') }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Search by Patient</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="e.g. Ahmad"
              value={filterPatient}
              onChange={(e) => { setFilterPatient(e.target.value); setFilterNurse(''); setFilterItem('') }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Search by Item</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="e.g. pampers"
              value={filterItem}
              onChange={(e) => { setFilterItem(e.target.value); setFilterNurse(''); setFilterPatient('') }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Date Filter</label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={runSearch}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <Search className="h-4 w-4" aria-hidden />
            {loading ? 'Searching…' : 'Search'}
          </button>
          <button
            onClick={exportCSV}
            disabled={!records.length}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <FileDown className="h-4 w-4" aria-hidden /> Export CSV
          </button>
          {source && (
            <span className="ml-auto text-xs text-slate-400">
              Source: {source} · {records.length} records
            </span>
          )}
        </div>
      </Card>

      {/* Audit table */}
      {records.length === 0 && !loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-400">
          <Shield className="mx-auto mb-2 h-8 w-8 opacity-40" aria-hidden />
          <p className="text-sm">No audit records found. Try adjusting filters or run a search.</p>
        </div>
      ) : (
        <Card padding="p-0" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  {['Time','Action','Nurse','Patient','Room','Item','Qty','Before','After','Source'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {records.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtTime(r.timestamp)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[r.action_type] ?? 'bg-slate-100 text-slate-600'}`}>
                        {r.action_type?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">{r.nurse_name || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.patient_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{r.room || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{r.item_name || r.item_key || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-teal-700">{r.qty || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{r.before_stock ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{r.after_stock  ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">{r.source || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Admin Tab ─────────────────────────────────────────────────────────────────

const ALL_ITEM_KEYS = Object.keys(ITEMS)
const CATEGORIES    = ['pampers', 'wet', 'milk', 'gloves']

function AdminTab({ onSwitchToAudit }) {
  // ── Add Stock ──────────────────────────────────────────────────────────────
  const [addItem,       setAddItem]       = useState(ALL_ITEM_KEYS[0])
  const [addQty,        setAddQty]        = useState('')
  const [addRemarks,    setAddRemarks]    = useState('')
  const [addStatus,     setAddStatus]     = useState(null)

  // ── Adjust Stock ───────────────────────────────────────────────────────────
  const [adjItem,       setAdjItem]       = useState(ALL_ITEM_KEYS[0])
  const [adjBalance,    setAdjBalance]    = useState('')
  const [adjReason,     setAdjReason]     = useState('')
  const [adjStatus,     setAdjStatus]     = useState(null)

  // ── Set Minimum ────────────────────────────────────────────────────────────
  const [minItem,       setMinItem]       = useState(ALL_ITEM_KEYS[0])
  const [minLevel,      setMinLevel]      = useState('')
  const [minStatus,     setMinStatus]     = useState(null)

  // ── Set Price ──────────────────────────────────────────────────────────────
  const [priceCategory, setPriceCategory] = useState('pampers')
  const [unitPrice,     setUnitPrice]     = useState('')
  const [priceStatus,   setPriceStatus]   = useState(null)

  // ── Helpers ────────────────────────────────────────────────────────────────
  function StatusMsg({ status }) {
    if (!status) return null
    return (
      <p className={`mt-2 rounded-lg px-3 py-2 text-sm font-medium ${
        status.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
      }`}>
        {status.ok ? '✅' : '⚠️'} {status.msg}
      </p>
    )
  }

  function SectionCard({ icon: Icon, title, color, children }) {
    const colorMap = {
      teal:   'text-teal-600 bg-teal-50',
      amber:  'text-amber-600 bg-amber-50',
      violet: 'text-violet-600 bg-violet-50',
      sky:    'text-sky-600 bg-sky-50',
    }
    return (
      <Card padding="p-5" className="space-y-4">
        <div className="flex items-center gap-2">
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${colorMap[color] ?? colorMap.teal}`}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        </div>
        {children}
      </Card>
    )
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleAddStock(e) {
    e.preventDefault()
    setAddStatus(null)
    try {
      const res = await addStockApi(addItem, Number(addQty), addRemarks)
      setAddStatus({ ok: true, msg: `Added ${addQty} units. New balance: ${res.balance ?? '?'}` })
      setAddQty(''); setAddRemarks('')
    } catch (err) { setAddStatus({ ok: false, msg: err.message }) }
  }

  async function handleAdjustStock(e) {
    e.preventDefault()
    setAdjStatus(null)
    try {
      const res = await adjustStockApi(adjItem, Number(adjBalance), adjReason)
      setAdjStatus({ ok: true, msg: `Balance set to ${res.balance ?? adjBalance}.` })
      setAdjBalance(''); setAdjReason('')
    } catch (err) { setAdjStatus({ ok: false, msg: err.message }) }
  }

  async function handleSetMinimum(e) {
    e.preventDefault()
    setMinStatus(null)
    try {
      await setMinimumApi(minItem, Number(minLevel))
      setMinStatus({ ok: true, msg: `Minimum level set to ${minLevel} for ${ITEMS[minItem]?.name ?? minItem}.` })
      setMinLevel('')
    } catch (err) { setMinStatus({ ok: false, msg: err.message }) }
  }

  async function handleSetPrice(e) {
    e.preventDefault()
    setPriceStatus(null)
    try {
      await setPriceApi(priceCategory, Number(unitPrice))
      setPriceStatus({ ok: true, msg: `Price updated: ${priceCategory} = RM${Number(unitPrice).toFixed(2)}` })
      setUnitPrice('')
    } catch (err) { setPriceStatus({ ok: false, msg: err.message }) }
  }

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
  const selectCls = inputCls
  const btnCls   = (color = 'teal') => `w-full rounded-lg py-2 text-sm font-semibold text-white transition-colors ${
    color === 'teal'   ? 'bg-teal-600 hover:bg-teal-700' :
    color === 'amber'  ? 'bg-amber-500 hover:bg-amber-600' :
    color === 'violet' ? 'bg-violet-600 hover:bg-violet-700' :
    'bg-sky-600 hover:bg-sky-700'
  }`

  return (
    <div className="space-y-6">

      {/* Mobile quick-entry shortcut */}
      <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
        <div className="flex items-center gap-2 text-teal-800">
          <Smartphone className="h-5 w-5" aria-hidden />
          <div>
            <p className="text-sm font-semibold">Nurse Mobile Quick Entry</p>
            <p className="text-xs opacity-70">Optimised for phones — quick add with large buttons</p>
          </div>
        </div>
        <Link
          to="/inventory-mobile"
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
        >
          Open →
        </Link>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">

        {/* Add Stock */}
        <SectionCard icon={ArrowUpCircle} title="Add Stock (Restock / Delivery)" color="teal">
          <form onSubmit={handleAddStock} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Item</label>
              <select value={addItem} onChange={(e) => setAddItem(e.target.value)} className={selectCls}>
                {ALL_ITEM_KEYS.map((k) => <option key={k} value={k}>{ITEMS[k]?.name ?? k}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Quantity to Add</label>
              <input type="number" min={1} required placeholder="e.g. 50" value={addQty}
                onChange={(e) => setAddQty(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Remarks (optional)</label>
              <input type="text" placeholder="e.g. Delivery from supplier" value={addRemarks}
                onChange={(e) => setAddRemarks(e.target.value)} className={inputCls} />
            </div>
            <button type="submit" className={btnCls('teal')}>Add Stock</button>
            <StatusMsg status={addStatus} />
          </form>
        </SectionCard>

        {/* Adjust Stock */}
        <SectionCard icon={SlidersHorizontal} title="Adjust Stock (Manual Correction)" color="amber">
          <form onSubmit={handleAdjustStock} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Item</label>
              <select value={adjItem} onChange={(e) => setAdjItem(e.target.value)} className={selectCls}>
                {ALL_ITEM_KEYS.map((k) => <option key={k} value={k}>{ITEMS[k]?.name ?? k}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Set New Balance</label>
              <input type="number" min={0} required placeholder="e.g. 80" value={adjBalance}
                onChange={(e) => setAdjBalance(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Reason</label>
              <input type="text" placeholder="e.g. Stock count correction" value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)} className={inputCls} />
            </div>
            <button type="submit" className={btnCls('amber')}>Adjust Balance</button>
            <StatusMsg status={adjStatus} />
          </form>
        </SectionCard>

        {/* Set Minimum Level */}
        <SectionCard icon={Bell} title="Set Minimum Alert Level" color="violet">
          <form onSubmit={handleSetMinimum} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Item</label>
              <select value={minItem} onChange={(e) => setMinItem(e.target.value)} className={selectCls}>
                {ALL_ITEM_KEYS.map((k) => <option key={k} value={k}>{ITEMS[k]?.name ?? k}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Minimum Level</label>
              <input type="number" min={0} required placeholder="e.g. 20" value={minLevel}
                onChange={(e) => setMinLevel(e.target.value)} className={inputCls} />
            </div>
            <p className="text-xs text-slate-400">Alert fires when balance drops to or below this value.</p>
            <button type="submit" className={btnCls('violet')}>Set Minimum</button>
            <StatusMsg status={minStatus} />
          </form>
        </SectionCard>

        {/* Set Item Price */}
        <SectionCard icon={Tag} title="Set Item Unit Price" color="sky">
          <form onSubmit={handleSetPrice} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Category</label>
              <select value={priceCategory} onChange={(e) => setPriceCategory(e.target.value)} className={selectCls}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Unit Price (RM)</label>
              <input type="number" step="0.01" min={0} required placeholder="e.g. 2.50" value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)} className={inputCls} />
            </div>
            <p className="text-xs text-slate-400">Price used in monthly family billing calculations.</p>
            <button type="submit" className={btnCls('sky')}>Update Price</button>
            <StatusMsg status={priceStatus} />
          </form>
        </SectionCard>
      </div>

      {/* Link to audit trail */}
      <button
        onClick={onSwitchToAudit}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        <Shield className="h-4 w-4" aria-hidden />
        View Full Audit Trail
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [activeTab, setActiveTab]     = useState('overview')
  const [logs, setLogs]               = useState([])
  const [balance, setBalance]         = useState({})
  const [alerts, setAlerts]           = useState([])
  const [patientUsage, setPatientUsage] = useState([])
  const [nurseUsage, setNurseUsage]   = useState([])
  const [search, setSearch]           = useState('')
  const [loading, setLoading]         = useState(true)
  const [dataSource, setDataSource]   = useState('')
  const [warnings, setWarnings]       = useState([])

  const refresh = useCallback(async () => {
    setLoading(true)
    seedDemoDataIfEmpty()
    try {
      const d = await fetchDashboardData()
      setLogs(d.logs)
      setBalance(d.balance)
      setAlerts(d.alerts)
      setPatientUsage(d.patientUsage)
      setNurseUsage(d.nurseUsage)
      setDataSource(d.source)
      setWarnings(d.warnings ?? [])
    } catch {
      setWarnings(['Could not load data.'])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Compute today stats from loaded logs
  const todayLogs = logs.filter((r) => r.timestamp?.startsWith(todayIso()))

  const totalToday = todayLogs.reduce((s, r) => s + (r.qty ?? 0), 0)
  const mostUsed   = (() => {
    const t = {}
    for (const r of todayLogs) t[r.item_key] = (t[r.item_key] ?? 0) + r.qty
    const top = Object.entries(t).sort((a, b) => b[1] - a[1])[0]
    return top ? { name: ITEMS[top[0]]?.name ?? top[0], qty: top[1] } : null
  })()

  const filteredLogs = search.trim()
    ? logs.filter((r) =>
        (r.patient_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (r.nurse_name   ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (r.item_name    ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (r.room         ?? '').includes(search)
      )
    : logs.slice(0, 50)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Inventory Management"
          description="Track nursing consumables: pampers, wet tissue, milk powder, gloves, and more."
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

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 w-fit">
        {[
          { key: 'overview', label: 'Overview',  icon: Package },
          { key: 'reports',  label: 'Reports',   icon: LayoutList },
          { key: 'billing',  label: 'Billing',   icon: TrendingDown },
          { key: 'audit',    label: 'Audit Trail', icon: Shield },
          { key: 'admin',    label: 'Admin',     icon: Settings },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* Reports Tab */}
      {activeTab === 'reports' && <ReportsTab />}

      {/* Billing Tab */}
      {activeTab === 'billing' && <BillingTab />}

      {/* Audit Trail Tab */}
      {activeTab === 'audit' && <AuditTab />}

      {/* Admin Tab */}
      {activeTab === 'admin' && <AdminTab onSwitchToAudit={() => setActiveTab('audit')} />}

      {/* Overview content — shown only when Overview tab is active */}
      {activeTab === 'overview' && <>

      {/* Data source badge */}
      {dataSource && (
        <div className="flex items-center gap-2">
          {dataSource === 'localStorage' || dataSource === 'demo'
            ? <WifiOff className="h-4 w-4 text-amber-500" aria-hidden />
            : <Wifi    className="h-4 w-4 text-emerald-500" aria-hidden />}
          <span className="text-xs text-slate-500">
            Data source: <strong>{dataSource}</strong>
            {warnings.length > 0 && ` — ${warnings[0]}`}
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Package}       label="Items Used Today"  value={totalToday}       sub={`${todayLogs.length} transactions`}            color="teal"   />
        <KpiCard icon={AlertTriangle} label="Low Stock Alerts"  value={alerts.length}    sub="items below minimum"                            color="rose"   />
        <KpiCard icon={TrendingDown}  label="Most Used Today"   value={mostUsed?.qty ?? '—'} sub={mostUsed?.name ?? 'No data today'}          color="amber"  />
        <KpiCard icon={BarChart3}     label="Items Tracked"     value={Object.keys(ITEMS).length} sub="distinct SKUs"                         color="violet" />
      </div>

      {/* Low Stock Alerts */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" aria-hidden />
            <h3 className="font-semibold text-rose-800">Low Stock Alerts ({alerts.length})</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {alerts.map((a) => (
              <span key={a.itemKey} className="rounded-full border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700">
                ⚠️ {a.name} — {a.balance} left (min {a.minLevel})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stock Balance */}
      <Card padding="p-6">
        <h3 className="mb-4 font-semibold text-slate-900 flex items-center gap-2">
          <Package className="h-4 w-4 text-teal-600" aria-hidden />
          Current Stock Balance
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(ITEMS).map(([key, meta]) => {
            const qty  = balance[key] ?? DEFAULT_STOCK[key]
            const pct  = stockPct(key, balance)
            const clr  = stockColor(pct, key, balance)
            const low  = qty < (MIN_LEVELS[key] ?? 0)
            return (
              <div key={key} className={`rounded-lg border p-3 ${low ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-white'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700">{meta.emoji} {meta.name}</span>
                  <span className={`text-sm font-bold tabular-nums ${low ? 'text-rose-600' : 'text-slate-900'}`}>{qty}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${clr} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-0.5 flex justify-between text-xs text-slate-400">
                  <span>{meta.unit}</span>
                  <span>min {MIN_LEVELS[key]}</span>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Add Usage Form */}
      <AddInventoryForm onSaved={refresh} />

      {/* Patient & Nurse Usage */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Patient Ranking */}
        <Card padding="p-6">
          <h3 className="mb-4 font-semibold text-slate-900 flex items-center gap-2">
            <Users className="h-4 w-4 text-teal-600" aria-hidden />
            Patient Usage This Month
          </h3>
          {patientUsage.length === 0 ? (
            <p className="text-sm text-slate-400">No data this month.</p>
          ) : (
            <ol className="space-y-2">
              {patientUsage.slice(0, 8).map((p, i) => (
                <li key={p.patient_name} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-800 truncate">{p.patient_name}</span>
                    {p.room && <span className="ml-1 text-xs text-slate-400">Rm {p.room}</span>}
                  </div>
                  <span className="text-sm font-bold tabular-nums text-slate-700">{p.total_qty}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Nurse Ranking */}
        <Card padding="p-6">
          <h3 className="mb-4 font-semibold text-slate-900 flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-600" aria-hidden />
            Nurse Usage This Month
          </h3>
          {nurseUsage.length === 0 ? (
            <p className="text-sm text-slate-400">No data this month.</p>
          ) : (
            <ol className="space-y-2">
              {nurseUsage.slice(0, 8).map((n, i) => (
                <li key={n.nurse_name} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{i + 1}</span>
                  <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">{n.nurse_name}</span>
                  <span className="text-xs text-slate-400">{n.item_count} txns</span>
                  <span className="text-sm font-bold tabular-nums text-slate-700">{n.total_qty}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* Activity Log */}
      <Card padding="p-0">
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" aria-hidden />
            Recent Activity
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient, nurse, item…"
              className="rounded-lg border border-slate-200 pl-9 pr-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3">Qty</th>
                <th className="px-5 py-3">Patient</th>
                <th className="px-5 py-3">Room</th>
                <th className="px-5 py-3">Nurse</th>
                <th className="px-5 py-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">
                    No records found.
                  </td>
                </tr>
              ) : filteredLogs.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtTime(r.timestamp)}</td>
                  <td className="px-5 py-2.5 font-medium text-slate-800">{ITEMS[r.item_key]?.emoji} {r.item_name || r.item_key}</td>
                  <td className="px-5 py-2.5 tabular-nums font-semibold text-slate-700">{r.qty}</td>
                  <td className="px-5 py-2.5 text-slate-600">{r.patient_name || '—'}</td>
                  <td className="px-5 py-2.5 text-slate-500">{r.room ? `Rm ${r.room}` : '—'}</td>
                  <td className="px-5 py-2.5 text-slate-600">{r.nurse_name || '—'}</td>
                  <td className="px-5 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.source === 'telegram' || r.source === 'telegram-nlp'
                        ? 'bg-sky-100 text-sky-700'
                        : r.source === 'demo'
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-teal-100 text-teal-700'
                    }`}>
                      {r.source === 'telegram-nlp' ? '🤖 NLP' : r.source}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredLogs.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
            Showing {filteredLogs.length} record{filteredLogs.length !== 1 ? 's' : ''}
          </div>
        )}
      </Card>

      </> /* end activeTab === 'overview' */}
    </div>
  )
}
