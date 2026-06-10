"use client"

import { useState } from "react"
import { BrainCircuit } from "lucide-react"

type RiskResult = {
  room: string
  name: string
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY"
  riskScore: number
  reasons: string[]
  recommendedActions: string[]
  notifyDoctor: boolean
  notifyFamily: boolean
  followUpTime: string
  followUpAt: string
}

const LEVEL_TONE: Record<RiskResult["riskLevel"], string> = {
  LOW: "bg-emerald-100 text-emerald-700 border-emerald-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  HIGH: "bg-orange-100 text-orange-700 border-orange-200",
  EMERGENCY: "bg-rose-100 text-rose-700 border-rose-200",
}

const EXAMPLE_NOTE = "poor appetite BP 90/60 weak mobility"

export default function RiskBrainTester() {
  const [room, setRoom] = useState("201")
  const [name, setName] = useState("")
  const [note, setNote] = useState(EXAMPLE_NOTE)
  const [bp, setBp] = useState("")
  const [pulse, setPulse] = useState("")
  const [spo2, setSpo2] = useState("")
  const [temperature, setTemperature] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<RiskResult | null>(null)

  async function analyze() {
    setError("")
    if (!note.trim() && !bp.trim() && !spo2.trim() && !temperature.trim()) {
      setError("Enter a note or at least one vital sign.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/ai/risk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          room: room.trim(),
          name: name.trim(),
          note: note.trim(),
          vitals: {
            bp: bp.trim() || undefined,
            pulse: pulse.trim() || undefined,
            spo2: spo2.trim() || undefined,
            temperature: temperature.trim() || undefined,
          },
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Analysis failed. Try again.")
        return
      }
      setResult(json.data as RiskResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="panel-card">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BrainCircuit className="h-5 w-5 text-violet-600" />
            AI Risk Brain (test)
          </h2>
          <p className="text-sm text-slate-500">
            Type a nursing observation and/or vitals — the rule engine returns risk level, reasons, and actions.
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Input form ─────────────────────────────────────────────── */}
        <div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Room</p>
              <input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="201"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Patient</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ali"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Nursing note</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={EXAMPLE_NOTE}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />

          <div className="mt-3 grid grid-cols-4 gap-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">BP</p>
              <input
                value={bp}
                onChange={(e) => setBp(e.target.value)}
                placeholder="90/60"
                className="w-full rounded-xl border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Pulse</p>
              <input
                value={pulse}
                onChange={(e) => setPulse(e.target.value.replace(/\D/g, ""))}
                placeholder="90"
                inputMode="numeric"
                className="w-full rounded-xl border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">SpO2</p>
              <input
                value={spo2}
                onChange={(e) => setSpo2(e.target.value.replace(/\D/g, ""))}
                placeholder="96"
                inputMode="numeric"
                className="w-full rounded-xl border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Temp</p>
              <input
                value={temperature}
                onChange={(e) => setTemperature(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="37.2"
                inputMode="decimal"
                className="w-full rounded-xl border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
          </div>

          {error ? (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          ) : null}

          <button
            type="button"
            onClick={() => void analyze()}
            disabled={busy}
            className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-2xl bg-violet-600 text-sm font-bold text-white shadow active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Analyzing…" : "Analyze risk"}
          </button>
        </div>

        {/* ── Result ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          {!result ? (
            <p className="text-sm text-slate-500">
              Result will appear here. Try the example note, or an emergency input like
              {" "}
              <button
                type="button"
                onClick={() => {
                  setNote("chest pain difficulty breathing")
                  setBp("")
                  setSpo2("")
                  setTemperature("")
                }}
                className="font-semibold text-violet-600 underline"
              >
                chest pain difficulty breathing
              </button>
              .
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${LEVEL_TONE[result.riskLevel]}`}>
                  {result.riskLevel}
                </span>
                <span className="text-sm font-bold text-slate-900">Score {result.riskScore}/100</span>
                {result.name || result.room ? (
                  <span className="text-xs text-slate-500">
                    {result.name || "Unknown"}{result.room ? ` · Room ${result.room}` : ""}
                  </span>
                ) : null}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reasons</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-slate-700">
                  {result.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended actions</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-slate-700">
                  {result.recommendedActions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className={`rounded-full px-3 py-1 ${result.notifyDoctor ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-600"}`}>
                  Doctor: {result.notifyDoctor ? "Notify" : "Not required"}
                </span>
                <span className={`rounded-full px-3 py-1 ${result.notifyFamily ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-600"}`}>
                  Family: {result.notifyFamily ? "Notify" : "Not required"}
                </span>
              </div>

              <p className="text-sm text-slate-700">
                <span className="font-semibold">Follow-up:</span> {result.followUpTime}
                <span className="text-xs text-slate-400"> (due {new Date(result.followUpAt).toLocaleTimeString()})</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
