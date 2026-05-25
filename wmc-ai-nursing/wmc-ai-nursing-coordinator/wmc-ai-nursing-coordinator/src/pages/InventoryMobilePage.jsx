/**
 * Inventory Mobile Page  (Stage 8)
 *
 * Mobile-first nurse quick-add interface.
 * Route: /inventory-mobile
 *
 * Features:
 *  - Item type selector (Pampers / Wet / Milk / Gloves)
 *  - Quick-add form with large touch targets
 *  - Qty stepper (+/-)
 *  - Size selector (pampers / gloves only)
 *  - Low stock alert banner
 *  - Recent entries (last 5)
 *  - Sticky full-width Submit button
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, AlertTriangle, CheckCircle, RefreshCw,
  Plus, Minus, Baby, Droplets, Milk, HandMetal,
} from 'lucide-react'
import { postInventoryAdd, fetchStockBalance, fetchStockAlerts, fetchInventoryLogs } from '../api/inventoryApi'
import { ITEMS, MIN_LEVELS, DEFAULT_STOCK, todayIso } from '../lib/inventoryCalculation'

// ── Item type config ──────────────────────────────────────────────────────────

const ITEM_TYPES = [
  {
    key:      'pampers',
    label:    'Pampers',
    icon:     Baby,
    color:    'bg-blue-500',
    light:    'bg-blue-50 border-blue-300 text-blue-700',
    ring:     'ring-blue-400',
    sizes:    ['M', 'L', 'XL'],
    items:    { M: 'PAMPERS_M', L: 'PAMPERS_L', XL: 'PAMPERS_XL' },
    hasSize:  true,
    hasPat:   true,
  },
  {
    key:      'wet',
    label:    'Wet Tissue',
    icon:     Droplets,
    color:    'bg-cyan-500',
    light:    'bg-cyan-50 border-cyan-300 text-cyan-700',
    ring:     'ring-cyan-400',
    sizes:    [],
    items:    { default: 'WET_TISSUE' },
    hasSize:  false,
    hasPat:   true,
  },
  {
    key:      'milk',
    label:    'Milk',
    icon:     Milk,
    color:    'bg-amber-500',
    light:    'bg-amber-50 border-amber-300 text-amber-700',
    ring:     'ring-amber-400',
    sizes:    ['Full Cream', 'Low Fat'],
    items:    { 'Full Cream': 'MILK_FULL', 'Low Fat': 'MILK_LOW' },
    hasSize:  true,
    hasPat:   true,
  },
  {
    key:      'gloves',
    label:    'Gloves',
    icon:     HandMetal,
    color:    'bg-violet-500',
    light:    'bg-violet-50 border-violet-300 text-violet-700',
    ring:     'ring-violet-400',
    sizes:    ['S', 'M', 'L'],
    items:    { S: 'GLOVES_S', M: 'GLOVES_M', L: 'GLOVES_L' },
    hasSize:  true,
    hasPat:   false,
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true })
  } catch { return '' }
}

function getItemKey(type, size) {
  if (!type) return null
  const cfg = ITEM_TYPES.find((t) => t.key === type)
  if (!cfg) return null
  if (cfg.hasSize && size && cfg.items[size]) return cfg.items[size]
  if (!cfg.hasSize) return cfg.items.default ?? null
  return null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InventoryMobilePage() {
  const navigate = useNavigate()

  // ── Form state ─────────────────────────────────────────────────────────────
  const [selectedType, setSelectedType] = useState(null)
  const [size,         setSize]         = useState('')
  const [patient,      setPatient]      = useState('')
  const [room,         setRoom]         = useState('')
  const [qty,          setQty]          = useState(1)
  const [nurseName,    setNurseName]    = useState(() => localStorage.getItem('wmc_nurse_name') ?? '')
  const [remarks,      setRemarks]      = useState('')

  // ── Data state ─────────────────────────────────────────────────────────────
  const [alerts,       setAlerts]       = useState([])
  const [balance,      setBalance]      = useState({})
  const [recentLogs,   setRecentLogs]   = useState([])
  const [loading,      setLoading]      = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [toast,        setToast]        = useState(null)   // { type: 'success'|'error', msg }
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set())

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [alertRes, balRes, logsRes] = await Promise.all([
        fetchStockAlerts(),
        fetchStockBalance(),
        fetchInventoryLogs(),
      ])
      setAlerts(alertRes.alerts ?? [])
      // balance is returned as { PAMPERS_M: 88, ... } from /api/inventory/stock
      setBalance(balRes.balance ?? {})
      // Last 5 entries today
      const today = todayIso()
      const todayLogs = (logsRes.logs ?? [])
        .filter((r) => r.timestamp?.startsWith(today))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 5)
      setRecentLogs(todayLogs)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Auto-set size default when type changes ────────────────────────────────
  useEffect(() => {
    if (!selectedType) return
    const cfg = ITEM_TYPES.find((t) => t.key === selectedType)
    setSize(cfg?.sizes?.[0] ?? '')
    setQty(1)
  }, [selectedType])

  // ── Toast helper ───────────────────────────────────────────────────────────
  function showToast(type, msg) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    const itemKey = getItemKey(selectedType, size)
    if (!itemKey) { showToast('error', 'Please select an item and size.'); return }
    if (qty < 1)  { showToast('error', 'Quantity must be at least 1.'); return }
    if (!nurseName.trim()) { showToast('error', 'Please enter your nurse name.'); return }

    setSubmitting(true)
    // Save nurse name for next visit
    localStorage.setItem('wmc_nurse_name', nurseName.trim())

    try {
      const record = {
        timestamp:         new Date().toISOString(),
        nurse_name:        nurseName.trim(),
        telegram_username: '',
        patient_name:      patient.trim(),
        room:              room.trim(),
        item_key:          itemKey,
        size:              size || '',
        qty,
        remarks:           remarks.trim() || '',
        source:            'web-mobile',
      }
      const res = await postInventoryAdd(record)
      if (!res.ok && res.source === 'error') throw new Error(res.warning ?? 'Server error')

      showToast('success', `✅ ${ITEMS[itemKey]?.name ?? itemKey} ×${qty} recorded!`)
      // Reset form (keep nurse name and type)
      setPatient(''); setRoom(''); setQty(1); setRemarks('')
      await loadData()
    } catch (err) {
      showToast('error', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const typeCfg       = ITEM_TYPES.find((t) => t.key === selectedType)
  const activeItemKey = getItemKey(selectedType, size)
  const currentStock  = activeItemKey ? (balance[activeItemKey] ?? DEFAULT_STOCK[activeItemKey] ?? 0) : null
  const minLevel      = activeItemKey ? (MIN_LEVELS[activeItemKey] ?? 0) : 0
  const isLowStock    = currentStock !== null && currentStock <= minLevel

  const visibleAlerts = alerts.filter(
    (a) => a.status !== 'Resolved' &&
           !dismissedAlerts.has(a.item_key ?? a.itemKey)
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-teal-600 px-4 py-3 text-white shadow-md">
        <button
          onClick={() => navigate('/inventory')}
          className="rounded-full p-1.5 hover:bg-teal-700 transition-colors"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <p className="text-xs font-medium opacity-80">WMC AI Nursing</p>
          <h1 className="text-base font-bold leading-tight">Quick Inventory Entry</h1>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="rounded-full p-1.5 hover:bg-teal-700 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed inset-x-4 top-16 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
          toast.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-rose-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex-1 space-y-4 p-4 pb-32">

        {/* ── Low stock alerts ────────────────────────────────────────────── */}
        {visibleAlerts.length > 0 && (
          <div className="space-y-2">
            {visibleAlerts.map((a) => (
              <div
                key={a.item_key}
                className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  <p className="text-sm text-amber-800">
                    <strong>Low Stock:</strong> {a.name ?? a.item_name ?? a.itemKey ?? a.item_key} — only {a.balance} left
                  </p>
                </div>
                <button
                  onClick={() => setDismissedAlerts((s) => new Set([...s, a.item_key ?? a.itemKey]))}
                  className="text-xs text-amber-500 hover:text-amber-700"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Item type selector ──────────────────────────────────────────── */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Select Item</p>
          <div className="grid grid-cols-2 gap-3">
            {ITEM_TYPES.map(({ key, label, icon: Icon, color, light, ring }) => (
              <button
                key={key}
                onClick={() => setSelectedType(key === selectedType ? null : key)}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-5 text-sm font-semibold transition-all ${
                  selectedType === key
                    ? `${light} border-current ring-2 ${ring} shadow-md`
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-full ${color} text-white`}>
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Quick-add form (shown when type selected) ───────────────────── */}
        {typeCfg && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

            {/* Current stock indicator */}
            {currentStock !== null && (
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                isLowStock ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
              }`}>
                {isLowStock
                  ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  : <CheckCircle   className="h-4 w-4 shrink-0" aria-hidden />}
                <span>
                  Current stock: <strong>{currentStock}</strong>
                  {isLowStock && ` ⚠️ Below minimum (${minLevel})`}
                </span>
              </div>
            )}

            {/* Size selector (pampers / milk / gloves) */}
            {typeCfg.hasSize && typeCfg.sizes.length > 0 && (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Size / Type</label>
                <div className="flex flex-wrap gap-2">
                  {typeCfg.sizes.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSize(s)}
                      className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-colors ${
                        size === s
                          ? `${typeCfg.light} border-current`
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Patient & Room (shown for patient-related items) */}
            {typeCfg.hasPat && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Patient Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Ahmad"
                    value={patient}
                    onChange={(e) => setPatient(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Room</label>
                  <input
                    type="text"
                    placeholder="e.g. 2"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              </div>
            )}

            {/* Qty stepper */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Quantity</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition-transform text-xl font-bold"
                  aria-label="Decrease"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 rounded-xl border border-slate-300 py-3 text-center text-2xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <button
                  onClick={() => setQty((q) => q + 1)}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-500 text-white hover:bg-teal-600 active:scale-95 transition-transform text-xl font-bold"
                  aria-label="Increase"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Nurse name */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nurse Name</label>
              <input
                type="text"
                placeholder="Your name"
                value={nurseName}
                onChange={(e) => setNurseName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>

            {/* Remarks */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Remarks <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. After bath"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
          </div>
        )}

        {/* ── Recent entries ──────────────────────────────────────────────── */}
        {recentLogs.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Today's Recent Entries</p>
            <div className="space-y-2">
              {recentLogs.map((r, i) => {
                const cfg = ITEM_TYPES.find((t) => ITEMS[r.item_key]?.category === t.key)
                return (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                    {cfg && (
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cfg.color} text-white`}>
                        <cfg.icon className="h-4 w-4" aria-hidden />
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">
                        {r.item_name || r.item_key}
                        {r.patient_name && <span className="text-slate-400"> · {r.patient_name}</span>}
                      </p>
                      <p className="text-xs text-slate-400">
                        ×{r.qty} by {r.nurse_name || '—'} · {fmtTime(r.timestamp)}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-teal-600">×{r.qty}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!selectedType && (
          <div className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-slate-400">
            <p className="text-sm">Select an item above to begin a quick entry.</p>
          </div>
        )}
      </div>

      {/* ── Sticky Submit button ────────────────────────────────────────────── */}
      {selectedType && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-white/90 px-4 py-4 shadow-2xl backdrop-blur-sm border-t border-slate-200">
          <button
            onClick={handleSubmit}
            disabled={submitting || !getItemKey(selectedType, size)}
            className={`w-full rounded-2xl py-4 text-lg font-bold text-white shadow-md transition-all active:scale-[0.98] ${
              typeCfg?.color ?? 'bg-teal-500'
            } disabled:opacity-50`}
          >
            {submitting
              ? 'Saving…'
              : `Submit — ${typeCfg?.label ?? ''} ×${qty}`}
          </button>
        </div>
      )}
    </div>
  )
}
