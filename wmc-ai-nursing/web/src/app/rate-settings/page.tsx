"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, Boxes, Save, Stethoscope } from "lucide-react"
import AdminGate from "../../components/AdminGate"

type InventoryItem = {
  id: string
  itemName: string
  unit: string
  rate: number
  rateUpdatedAt: string
}

type ServiceRate = { id: string; serviceName: string; rate: number; updatedAt: string }

function rm(value: number) {
  return `RM${(Number(value) || 0).toFixed(2)}`
}

function fmt(value: string) {
  if (!value) return "Never"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString()
}

export default function RateSettingsPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({})
  const [services, setServices] = useState<ServiceRate[]>([])
  const [serviceDrafts, setServiceDrafts] = useState<Record<string, string>>({})
  const [savingItems, setSavingItems] = useState(false)
  const [savingServices, setSavingServices] = useState(false)
  const [toast, setToast] = useState("")

  const load = useCallback(async () => {
    try {
      const [invRes, svcRes] = await Promise.all([
        fetch("/api/inventory/rates", { cache: "no-store" }),
        fetch("/api/nursing-services/rates", { cache: "no-store" }),
      ])
      const invJson = await invRes.json().catch(() => null)
      const svcJson = await svcRes.json().catch(() => null)
      if (invJson?.ok && Array.isArray(invJson.items)) {
        setItems(invJson.items)
        setItemDrafts(
          invJson.items.reduce((acc: Record<string, string>, it: InventoryItem) => {
            acc[it.id] = String(it.rate)
            return acc
          }, {}),
        )
      }
      if (svcJson?.ok && Array.isArray(svcJson.rates)) {
        setServices(svcJson.rates)
        setServiceDrafts(
          svcJson.rates.reduce((acc: Record<string, string>, s: ServiceRate) => {
            acc[s.id] = String(s.rate)
            return acc
          }, {}),
        )
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(""), 3000)
    return () => window.clearTimeout(t)
  }, [toast])

  async function saveItems() {
    setSavingItems(true)
    try {
      const res = await fetch("/api/inventory/rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rates: items.map((it) => ({ itemId: it.id, rate: Number(itemDrafts[it.id] ?? it.rate) || 0 })),
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setToast(json?.error || "Could not save item rates.")
        return
      }
      setItems(json.items)
      setToast("Inventory rates saved.")
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Network error.")
    } finally {
      setSavingItems(false)
    }
  }

  async function saveServices() {
    setSavingServices(true)
    try {
      const res = await fetch("/api/nursing-services/rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rates: services.map((s) => ({ serviceId: s.id, rate: Number(serviceDrafts[s.id] ?? s.rate) || 0 })),
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setToast(json?.error || "Could not save service rates.")
        return
      }
      setServices(json.rates)
      setToast("Nursing service rates saved.")
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Network error.")
    } finally {
      setSavingServices(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AdminGate pageName="Rate Settings" />

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">WMC AI Nursing · Admin</p>
            <h1 className="text-lg font-bold text-slate-900">Rate Settings</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-5">
        {/* ── Inventory item rates ─────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <Boxes className="h-5 w-5 text-amber-600" />
            <h2 className="text-base font-bold text-slate-900">Inventory item rate</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            Unit rate (RM) charged per item used. Patient charge = quantity used × rate.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold">Item</th>
                  <th className="px-2 py-2 font-semibold">Unit</th>
                  <th className="px-2 py-2 font-semibold">Rate (RM)</th>
                  <th className="px-2 py-2 font-semibold">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100 text-slate-700">
                    <td className="px-2 py-2 font-medium text-slate-900">{it.itemName}</td>
                    <td className="px-2 py-2 text-slate-500">{it.unit}</td>
                    <td className="px-2 py-2">
                      <input
                        value={itemDrafts[it.id] ?? ""}
                        onChange={(e) =>
                          setItemDrafts((d) => ({ ...d, [it.id]: e.target.value.replace(/[^0-9.]/g, "") }))
                        }
                        inputMode="decimal"
                        className="h-10 w-24 rounded-xl border border-slate-300 px-3 text-right text-base font-bold text-slate-900"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-slate-400">{fmt(it.rateUpdatedAt)}</td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-6 text-center text-sm text-slate-500">
                      Loading items…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => void saveItems()}
            disabled={savingItems}
            className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 text-base font-semibold text-white active:scale-[0.98] disabled:opacity-60"
          >
            <Save className="h-5 w-5" />
            {savingItems ? "Saving…" : "Save inventory rates"}
          </button>
        </section>

        {/* ── Nursing service rates ────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-cyan-600" />
            <h2 className="text-base font-bold text-slate-900">Nursing service rate</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            Default charge (RM) per chargeable procedure. Auto-fills when a nurse records a service.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold">Service</th>
                  <th className="px-2 py-2 font-semibold">Rate (RM)</th>
                  <th className="px-2 py-2 font-semibold">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 text-slate-700">
                    <td className="px-2 py-2 font-medium text-slate-900">{s.serviceName}</td>
                    <td className="px-2 py-2">
                      <input
                        value={serviceDrafts[s.id] ?? ""}
                        onChange={(e) =>
                          setServiceDrafts((d) => ({ ...d, [s.id]: e.target.value.replace(/[^0-9.]/g, "") }))
                        }
                        inputMode="decimal"
                        className="h-10 w-24 rounded-xl border border-slate-300 px-3 text-right text-base font-bold text-slate-900"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-slate-400">{fmt(s.updatedAt)}</td>
                  </tr>
                ))}
                {services.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-6 text-center text-sm text-slate-500">
                      Loading services…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => void saveServices()}
            disabled={savingServices}
            className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 text-base font-semibold text-white active:scale-[0.98] disabled:opacity-60"
          >
            <Save className="h-5 w-5" />
            {savingServices ? "Saving…" : "Save service rates"}
          </button>
        </section>

        <p className="text-center text-xs text-slate-400">
          Rates apply to new records. Billing = quantity × rate, shown in Patient Usage Summary, Nursing Services &amp;
          Billing, and the monthly patient bill.
        </p>
      </main>

      {toast ? (
        <div className="fixed inset-x-0 bottom-24 z-40 mx-auto w-fit max-w-[90%] rounded-full bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
