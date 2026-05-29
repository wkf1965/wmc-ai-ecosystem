"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Boxes, Search } from "lucide-react"
import AdminGate from "../../components/AdminGate"

type InventoryItem = {
  id: string
  itemName: string
  quantity: number
  unit: string
  personInCharge: string
  lastUpdatedAt: string
}

type InventoryRecord = {
  id: string
  itemId: string
  itemName: string
  quantityChange: number
  unit: string
  room: string
  patientName: string
  personInCharge: string
  actionType: "taken" | "given" | "used" | "added"
  recordedAt: string
  source: "telegram" | "frontend" | "api"
  sourceStatus: "live" | "simulation"
}

type InventoryDraft = {
  quantity: string
  personInCharge: string
  saving: boolean
}

const LOCAL_INVENTORY_FALLBACK_KEY = "wmc_inventory_local_fallback_v1"
const LOCAL_INVENTORY_RECORDS_FALLBACK_KEY = "wmc_inventory_records_local_fallback_v1"

type UsageDateFilter = "today" | "7d" | "all"

type PatientUsageSummaryRow = {
  patientName: string
  room: string
  pampersTotal: number
  wetTissueTotal: number
  rylesTubeTotal: number
  cbdTubeTotal: number
  milkPowderTotal: number
  glovesTotal: number
  estimatedCost: number
  hasWarning: boolean
  warningNotes: string[]
  lastUpdated: string
  history: InventoryRecord[]
}

const ITEM_COST_RM: Record<string, number> = {
  pampers: 2,
  "wet-tissue": 0.3,
  "ryles-tube": 0,
  "cbd-tube": 0,
  "milk-powder": 0,
  gloves: 0,
}

function formatDateTime(value: string) {
  if (!value) return "-"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function nowIso() {
  return new Date().toISOString()
}

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryItem[]>([])
  const [records, setRecords] = useState<InventoryRecord[]>([])
  const [status, setStatus] = useState("")
  const [dataMode, setDataMode] = useState<"simulation" | "live">("live")
  const [query, setQuery] = useState("")
  const [drafts, setDrafts] = useState<Record<string, InventoryDraft>>({})
  const [patientSearch, setPatientSearch] = useState("")
  const [roomFilter, setRoomFilter] = useState("all")
  const [usageDateFilter, setUsageDateFilter] = useState<UsageDateFilter>("all")
  const [expandedPatient, setExpandedPatient] = useState<string | null>(null)

  const totalUnits = useMemo(() => rows.reduce((sum, row) => sum + row.quantity, 0), [rows])
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (row) =>
        row.itemName.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        row.personInCharge.toLowerCase().includes(q),
    )
  }, [rows, query])
  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return records
    return records.filter(
      (row) =>
        row.itemName.toLowerCase().includes(q) ||
        row.room.toLowerCase().includes(q) ||
        row.patientName.toLowerCase().includes(q) ||
        row.personInCharge.toLowerCase().includes(q) ||
        row.actionType.toLowerCase().includes(q),
    )
  }, [records, query])

  function buildDraftMap(sourceRows: InventoryItem[]) {
    const next: Record<string, InventoryDraft> = {}
    for (const row of sourceRows) {
      next[row.id] = {
        quantity: String(row.quantity),
        personInCharge: row.personInCharge || "",
        saving: false,
      }
    }
    return next
  }

  function persistLocalFallback(nextRows: InventoryItem[]) {
    if (typeof window === "undefined") return
    window.localStorage.setItem(LOCAL_INVENTORY_FALLBACK_KEY, JSON.stringify(nextRows))
  }

  function persistLocalRecordFallback(nextRecords: InventoryRecord[]) {
    if (typeof window === "undefined") return
    window.localStorage.setItem(LOCAL_INVENTORY_RECORDS_FALLBACK_KEY, JSON.stringify(nextRecords))
  }

  function readLocalFallback() {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(LOCAL_INVENTORY_FALLBACK_KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as InventoryItem[]) : null
    } catch {
      return null
    }
  }

  function readLocalRecordFallback() {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(LOCAL_INVENTORY_RECORDS_FALLBACK_KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as InventoryRecord[]) : null
    } catch {
      return null
    }
  }

  function normalizeItemKey(record: InventoryRecord) {
    const fromId = String(record.itemId || "")
      .trim()
      .toLowerCase()
    const fromName = String(record.itemName || "")
      .trim()
      .toLowerCase()
    const candidate = fromId || fromName
    if (candidate.includes("pamp")) return "pampers"
    if (candidate.includes("wet")) return "wet-tissue"
    if (candidate.includes("ryles")) return "ryles-tube"
    if (candidate.includes("cbd")) return "cbd-tube"
    if (candidate.includes("milk")) return "milk-powder"
    if (candidate.includes("glove")) return "gloves"
    return candidate.replace(/\s+/g, "-")
  }

  function isWithinDateFilter(value: string, filter: UsageDateFilter) {
    if (filter === "all") return true
    const ts = new Date(value).getTime()
    if (Number.isNaN(ts)) return false
    const now = new Date()
    if (filter === "today") {
      const input = new Date(ts)
      return (
        input.getFullYear() === now.getFullYear() &&
        input.getMonth() === now.getMonth() &&
        input.getDate() === now.getDate()
      )
    }
    return ts >= now.getTime() - 7 * 24 * 60 * 60 * 1000
  }

  function updateDraftField(itemId: string, field: "quantity" | "personInCharge", value: string) {
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        quantity: current[itemId]?.quantity ?? "0",
        personInCharge: current[itemId]?.personInCharge ?? "",
        saving: current[itemId]?.saving ?? false,
        [field]: value,
      },
    }))
  }

  async function saveInventoryRow(itemId: string) {
    const baseRow = rows.find((row) => row.id === itemId)
    if (!baseRow) return
    const draft = drafts[itemId] || {
      quantity: String(baseRow.quantity),
      personInCharge: baseRow.personInCharge || "",
      saving: false,
    }
    const nextQuantity = Math.max(0, Number.parseInt(draft.quantity || "0", 10) || 0)
    const nextPerson = draft.personInCharge.trim()
    const updatedAt = nowIso()

    setDrafts((current) => ({
      ...current,
      [itemId]: {
        quantity: String(nextQuantity),
        personInCharge: nextPerson,
        saving: true,
      },
    }))

    const optimisticRows = rows.map((row) =>
      row.id === itemId
        ? {
            ...row,
            quantity: nextQuantity,
            personInCharge: nextPerson,
            lastUpdatedAt: updatedAt,
          }
        : row,
    )
    setRows(optimisticRows)

    try {
      const response = await fetch("/api/modules/inventory", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId,
          quantity: nextQuantity,
          personInCharge: nextPerson,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        persistLocalFallback(optimisticRows)
        setStatus("Saved locally. Backend update unavailable.")
        setDrafts((current) => ({
          ...current,
          [itemId]: {
            quantity: String(nextQuantity),
            personInCharge: nextPerson,
            saving: false,
          },
        }))
        return
      }

      const savedRows = payload.data as InventoryItem[]
      setRows(savedRows)
      setDrafts(buildDraftMap(savedRows))
      setStatus("Inventory updated successfully.")
    } catch {
      persistLocalFallback(optimisticRows)
      setStatus("Saved locally. Backend update unavailable.")
      setDrafts((current) => ({
        ...current,
        [itemId]: {
          quantity: String(nextQuantity),
          personInCharge: nextPerson,
          saving: false,
        },
      }))
    }
  }

  useEffect(() => {
    let mounted = true
    let inFlight = false

    const refreshInventory = async () => {
      if (!mounted || inFlight) return
      inFlight = true
      try {
        if (dataMode === "simulation") {
          const localRows = readLocalFallback() || []
          const localRecords = readLocalRecordFallback() || []
          setRows(localRows)
          setRecords(localRecords)
          setDrafts(buildDraftMap(localRows))
          setStatus("Simulation mode active (localStorage).")
          return
        }
        const response = await fetch("/api/inventory", { cache: "no-store" })
        const payload = await response.json().catch(() => null)
        if (!mounted) return
        if (payload?.ok && payload?.data) {
          const inventoryRows = Array.isArray(payload.data.inventory) ? (payload.data.inventory as InventoryItem[]) : []
          const inventoryRecords = Array.isArray(payload.data.records) ? (payload.data.records as InventoryRecord[]) : []
          setRows(inventoryRows)
          setRecords(inventoryRecords)
          persistLocalFallback(inventoryRows)
          persistLocalRecordFallback(inventoryRecords)
          setDrafts(buildDraftMap(inventoryRows))
          setStatus(inventoryRecords.length ? "Live inventory records loaded from Telegram/backend." : "No live inventory records yet.")
        }
      } catch {
        if (!mounted) return
        const localRows = readLocalFallback()
        const localRecords = readLocalRecordFallback() || []
        if (localRows && localRows.length) {
          setRows(localRows)
          setRecords(localRecords)
          setDrafts(buildDraftMap(localRows))
          setStatus("Saved locally. Backend sync unavailable.")
          return
        }
        setStatus("Unable to load inventory from server.")
      } finally {
        inFlight = false
      }
    }

    void refreshInventory()
    const poll = window.setInterval(() => {
      void refreshInventory()
    }, 20000)
    return () => {
      mounted = false
      window.clearInterval(poll)
    }
  }, [dataMode])

  const roomOptions = useMemo(() => {
    const rooms = Array.from(
      new Set(
        records
          .map((row) => row.room.trim())
          .filter(Boolean),
      ),
    )
    return rooms.sort((a, b) => a.localeCompare(b))
  }, [records])

  const patientUsageSummaryRows = useMemo(() => {
    const patientMap = new Map<string, PatientUsageSummaryRow>()
    const loweredSearch = patientSearch.trim().toLowerCase()

    for (const row of records) {
      const patient = row.patientName.trim()
      if (!patient) continue
      if (!isWithinDateFilter(row.recordedAt, usageDateFilter)) continue
      if (roomFilter !== "all" && row.room.trim() !== roomFilter) continue
      if (loweredSearch && !patient.toLowerCase().includes(loweredSearch)) continue
      if (row.quantityChange >= 0) continue
      if (row.actionType === "added") continue

      const key = patient.toLowerCase()
      const qtyUsed = Math.abs(Number(row.quantityChange || 0))
      const itemKey = normalizeItemKey(row)
      const existing = patientMap.get(key) || {
        patientName: patient,
        room: row.room || "-",
        pampersTotal: 0,
        wetTissueTotal: 0,
        rylesTubeTotal: 0,
        cbdTubeTotal: 0,
        milkPowderTotal: 0,
        glovesTotal: 0,
        estimatedCost: 0,
        hasWarning: false,
        warningNotes: [],
        lastUpdated: row.recordedAt,
        history: [],
      }

      if (itemKey === "pampers") existing.pampersTotal += qtyUsed
      if (itemKey === "wet-tissue") existing.wetTissueTotal += qtyUsed
      if (itemKey === "ryles-tube") existing.rylesTubeTotal += qtyUsed
      if (itemKey === "cbd-tube") existing.cbdTubeTotal += qtyUsed
      if (itemKey === "milk-powder") existing.milkPowderTotal += qtyUsed
      if (itemKey === "gloves") existing.glovesTotal += qtyUsed
      existing.estimatedCost += qtyUsed * (ITEM_COST_RM[itemKey] || 0)
      if (!existing.room || existing.room === "-") existing.room = row.room || "-"
      if (new Date(row.recordedAt).getTime() > new Date(existing.lastUpdated).getTime()) {
        existing.lastUpdated = row.recordedAt
      }
      existing.history.push(row)
      patientMap.set(key, existing)
    }

    const rows = Array.from(patientMap.values()).map((row) => {
      const warningNotes: string[] = []
      if (row.pampersTotal > 8) warningNotes.push("Pampers > 8/day")
      if (row.wetTissueTotal > 20) warningNotes.push("Wet tissue > 20/day")
      return {
        ...row,
        estimatedCost: Number(row.estimatedCost.toFixed(2)),
        hasWarning: warningNotes.length > 0,
        warningNotes,
        history: [...row.history].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
      }
    })
    return rows.sort((a, b) => a.patientName.localeCompare(b.patientName))
  }, [records, patientSearch, roomFilter, usageDateFilter])

  function exportPatientSummaryCsv() {
    const header = [
      "Patient Name",
      "Room",
      "Pampers total",
      "Wet tissue total",
      "Ryles tube total",
      "CBD tube total",
      "Milk powder total",
      "Gloves total",
      "Estimated cost (RM)",
      "Last updated",
      "Warning",
    ]
    const body = patientUsageSummaryRows.map((row) => [
      row.patientName,
      row.room,
      row.pampersTotal,
      row.wetTissueTotal,
      row.rylesTubeTotal,
      row.cbdTubeTotal,
      row.milkPowderTotal,
      row.glovesTotal,
      row.estimatedCost.toFixed(2),
      formatDateTime(row.lastUpdated),
      row.warningNotes.join(" | "),
    ])
    const lines = [header, ...body].map((cols) =>
      cols.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
    )
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `patient-usage-summary-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function printPatientSummaryReport() {
    const summaryRowsHtml = patientUsageSummaryRows
      .map(
        (row) => `
          <tr>
            <td>${row.patientName}</td>
            <td>${row.room}</td>
            <td>${row.pampersTotal}</td>
            <td>${row.wetTissueTotal}</td>
            <td>${row.rylesTubeTotal}</td>
            <td>${row.cbdTubeTotal}</td>
            <td>${row.milkPowderTotal}</td>
            <td>${row.glovesTotal}</td>
            <td>${row.estimatedCost.toFixed(2)}</td>
            <td>${formatDateTime(row.lastUpdated)}</td>
            <td>${row.warningNotes.join(", ") || "-"}</td>
          </tr>
        `,
      )
      .join("")
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1200,height=800")
    if (!printWindow) return
    printWindow.document.write(`
      <html>
        <head>
          <title>Patient Usage Summary Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { margin: 0 0 12px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; text-align: left; }
            th { background: #f4f4f4; }
          </style>
        </head>
        <body>
          <h1>Patient Usage Summary</h1>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr>
                <th>Patient Name</th>
                <th>Room</th>
                <th>Pampers total</th>
                <th>Wet tissue total</th>
                <th>Ryles tube total</th>
                <th>CBD tube total</th>
                <th>Milk powder total</th>
                <th>Gloves total</th>
                <th>Estimated cost (RM)</th>
                <th>Last updated</th>
                <th>Warning</th>
              </tr>
            </thead>
            <tbody>${summaryRowsHtml || "<tr><td colspan='11'>No patient usage records found.</td></tr>"}</tbody>
          </table>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <div className="dashboard-shell">
      <AdminGate pageName="Inventory Management" />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">Nursing operations</p>
            <h1 className="dashboard-title">Inventory Module</h1>
            <p className="text-sm text-slate-500">Live stock and Telegram-backed inventory event tracking</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className="metric-chip">
              Back to dashboard
            </Link>
            <Link href="/vital-signs" className="metric-chip">
              Vital signs
            </Link>
          </div>
        </div>

        <section className="mb-4 grid gap-3 sm:grid-cols-3">
          <article className="panel-card">
            <p className="panel-title">Tracked items</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{rows.length}</p>
            <p className="mt-1 text-sm text-slate-500">Core nursing inventory list</p>
          </article>
          <article className="panel-card">
            <p className="panel-title">Total quantity</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{totalUnits}</p>
            <p className="mt-1 text-sm text-slate-500">Combined stock count</p>
          </article>
          <article className="panel-card">
            <p className="panel-title">Last sync</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{rows.find((row) => row.lastUpdatedAt)?.lastUpdatedAt ? "Updated" : "Waiting"}</p>
            <p className="mt-1 text-sm text-slate-500">Connected to Telegram/backend records</p>
          </article>
        </section>

        <section className="panel-card mb-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-700">
            <span className="font-medium">Data mode:</span>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="inventoryDataMode"
                value="simulation"
                checked={dataMode === "simulation"}
                onChange={() => setDataMode("simulation")}
              />
              Simulation
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="inventoryDataMode"
                value="live"
                checked={dataMode === "live"}
                onChange={() => setDataMode("live")}
              />
              Live
            </label>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by item, room, patient, nurse, or action"
              className="w-full rounded-lg border border-slate-300 bg-white px-8 py-2 text-sm"
            />
          </label>
          <p className="mt-3 text-sm text-slate-600">{status || "Live mode reads Telegram/backend inventory records."}</p>
        </section>

        <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Person in charge</th>
                <th className="px-4 py-3">Last updated</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-none">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <span className="inline-flex items-center gap-2">
                      <Boxes className="h-4 w-4 text-slate-500" />
                      {row.itemName}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      value={drafts[row.id]?.quantity ?? String(row.quantity)}
                      onChange={(event) => updateDraftField(row.id, "quantity", event.target.value)}
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.unit}</td>
                  <td className="px-4 py-3">
                    <input
                      value={drafts[row.id]?.personInCharge ?? row.personInCharge ?? ""}
                      onChange={(event) => updateDraftField(row.id, "personInCharge", event.target.value)}
                      placeholder="Nurse in charge"
                      className="w-full min-w-40 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatDateTime(row.lastUpdatedAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void saveInventoryRow(row.id)}
                      disabled={Boolean(drafts[row.id]?.saving)}
                      className="inline-flex rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {drafts[row.id]?.saving ? "Saving..." : "Update"}
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>
                    No inventory items match your current search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Item name</th>
                <th className="px-4 py-3">Quantity change</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Patient name</th>
                <th className="px-4 py-3">Person in charge</th>
                <th className="px-4 py-3">Action type</th>
                <th className="px-4 py-3">Recorded time</th>
                <th className="px-4 py-3">Telegram source status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-none">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.itemName}</td>
                  <td className="px-4 py-3 text-slate-700">{row.quantityChange > 0 ? `+${row.quantityChange}` : row.quantityChange}</td>
                  <td className="px-4 py-3 text-slate-700">{row.unit || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.room || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.patientName || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.personInCharge || "-"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {row.actionType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatDateTime(row.recordedAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${
                      row.source === "telegram" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-700"
                    }`}>
                      {row.source} / {row.sourceStatus}
                    </span>
                  </td>
                </tr>
              ))}
              {!filteredRecords.length ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={9}>
                    No inventory records match your search. Send Telegram inventory input to populate live records.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Patient Usage Summary</h2>
              <p className="text-sm text-slate-500">Auto-calculated from inventory transaction history</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportPatientSummaryCsv}
                className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={printPatientSummaryReport}
                className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Export printable report
              </button>
            </div>
          </div>
          <div className="grid gap-3 border-b border-slate-200 px-4 py-3 sm:grid-cols-3">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search patient</span>
              <input
                value={patientSearch}
                onChange={(event) => setPatientSearch(event.target.value)}
                placeholder="Type patient name"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Filter by room</span>
              <select
                value={roomFilter}
                onChange={(event) => setRoomFilter(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="all">All rooms</option>
                {roomOptions.map((room) => (
                  <option key={room} value={room}>
                    {room}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date filter</span>
              <select
                value={usageDateFilter}
                onChange={(event) => setUsageDateFilter(event.target.value as UsageDateFilter)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="today">Today</option>
                <option value="7d">7 days</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Patient Name</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Pampers total</th>
                <th className="px-4 py-3">Wet tissue total</th>
                <th className="px-4 py-3">Ryles tube total</th>
                <th className="px-4 py-3">CBD tube total</th>
                <th className="px-4 py-3">Milk powder total</th>
                <th className="px-4 py-3">Gloves total</th>
                <th className="px-4 py-3">Estimated cost (RM)</th>
                <th className="px-4 py-3">Warning</th>
                <th className="px-4 py-3">Last updated</th>
              </tr>
            </thead>
            <tbody>
              {patientUsageSummaryRows.map((row) => {
                const isExpanded = expandedPatient === row.patientName
                return (
                  <>
                    <tr
                      key={row.patientName}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                      onClick={() => setExpandedPatient(isExpanded ? null : row.patientName)}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">{row.patientName}</td>
                      <td className="px-4 py-3 text-slate-700">{row.room || "-"}</td>
                      <td className="px-4 py-3 text-slate-700">{row.pampersTotal}</td>
                      <td className="px-4 py-3 text-slate-700">{row.wetTissueTotal}</td>
                      <td className="px-4 py-3 text-slate-700">{row.rylesTubeTotal}</td>
                      <td className="px-4 py-3 text-slate-700">{row.cbdTubeTotal}</td>
                      <td className="px-4 py-3 text-slate-700">{row.milkPowderTotal}</td>
                      <td className="px-4 py-3 text-slate-700">{row.glovesTotal}</td>
                      <td className="px-4 py-3 text-slate-700">{row.estimatedCost.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {row.hasWarning ? (
                          <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                            {row.warningNotes.join(", ")}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                            Normal
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatDateTime(row.lastUpdated)}</td>
                    </tr>
                    {isExpanded ? (
                      <tr key={`${row.patientName}-history`}>
                        <td colSpan={11} className="bg-slate-50 px-4 py-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Usage history</p>
                          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                            <table className="min-w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                                  <th className="px-3 py-2">Item</th>
                                  <th className="px-3 py-2">Qty used</th>
                                  <th className="px-3 py-2">Room</th>
                                  <th className="px-3 py-2">Nurse</th>
                                  <th className="px-3 py-2">Action</th>
                                  <th className="px-3 py-2">Time</th>
                                  <th className="px-3 py-2">Source</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.history.map((entry) => (
                                  <tr key={entry.id} className="border-b border-slate-100 last:border-none">
                                    <td className="px-3 py-2 text-slate-700">{entry.itemName}</td>
                                    <td className="px-3 py-2 text-slate-700">{Math.abs(entry.quantityChange)}</td>
                                    <td className="px-3 py-2 text-slate-700">{entry.room || "-"}</td>
                                    <td className="px-3 py-2 text-slate-700">{entry.personInCharge || "-"}</td>
                                    <td className="px-3 py-2 text-slate-700">{entry.actionType}</td>
                                    <td className="px-3 py-2 text-slate-700">{formatDateTime(entry.recordedAt)}</td>
                                    <td className="px-3 py-2 text-slate-700">
                                      {entry.source} / {entry.sourceStatus}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                )
              })}
              {!patientUsageSummaryRows.length ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={11}>
                    No patient usage records for the selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  )
}
