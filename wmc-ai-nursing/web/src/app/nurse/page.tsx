"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import {
  Activity,
  AlertTriangle,
  BedDouble,
  Boxes,
  Camera,
  ClipboardList,
  Clock3,
  LogIn,
  LogOut,
  Mic,
  MicOff,
  Pencil,
  Pill,
  Stethoscope,
  X,
} from "lucide-react"
import { getNurseName, setNurseName } from "../../lib/roleMode"

type ActionTile = {
  label: string
  icon: typeof Activity
  tone: string
  href?: string
  onClick?: () => void
}

// Minimal Web Speech API typing (avoids depending on lib.dom SpeechRecognition).
type SpeechResultList = { length: number;[index: number]: { 0: { transcript: string } } }
type SpeechEvent = { results: SpeechResultList }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

export default function NurseModePage() {
  const [name, setName] = useState("")
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [toast, setToast] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  // Voice input
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [voiceError, setVoiceError] = useState("")
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    const stored = getNurseName()
    setName(stored)
    if (!stored) {
      setEditingName(true)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(""), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  function saveName() {
    const next = nameDraft.trim()
    if (!next) {
      setToast("Please enter your name.")
      return
    }
    setNurseName(next)
    setName(next)
    setEditingName(false)
    setToast(`Welcome, ${next}.`)
  }

  async function punch(action: "punch_in" | "punch_out") {
    if (!name) {
      setEditingName(true)
      setToast("Set your name first.")
      return
    }
    setBusy(action)
    try {
      const response = await fetch("/api/ot-records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, nurseName: name, source: "manual" }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) {
        setToast(`Failed: ${payload?.error ?? "unable to record"}`)
        return
      }
      setToast(action === "punch_in" ? "✅ Punched in. Have a good shift!" : "✅ Punched out. Thank you!")
    } catch (error) {
      setToast(`Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(null)
    }
  }

  function openVoice() {
    setTranscript("")
    setVoiceError("")
    setVoiceOpen(true)
  }

  function startListening() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceError("Voice input is not supported on this browser. Try Chrome on Android.")
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = "en-US"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let text = ""
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i][0].transcript
      }
      setTranscript(text)
    }
    recognition.onerror = (event) => {
      setVoiceError(`Voice error: ${event.error || "unknown"}`)
      setListening(false)
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  async function copyTranscript() {
    if (!transcript.trim()) return
    try {
      await navigator.clipboard.writeText(transcript.trim())
      setToast("Voice note copied to clipboard.")
      setVoiceOpen(false)
    } catch {
      setToast("Could not copy. Select the text manually.")
    }
  }

  const tiles: ActionTile[] = [
    { label: "Punch In", icon: LogIn, tone: "bg-emerald-600", onClick: () => void punch("punch_in") },
    { label: "Punch Out", icon: LogOut, tone: "bg-slate-700", onClick: () => void punch("punch_out") },
    { label: "OT", icon: Clock3, tone: "bg-amber-500", href: "/overtime-ot" },
    { label: "Side Turning", icon: BedDouble, tone: "bg-sky-600", href: "/turning" },
    { label: "Upload Photo", icon: Camera, tone: "bg-indigo-600", href: "/turning" },
    { label: "Vital Signs", icon: Activity, tone: "bg-rose-500", href: "/vital-signs" },
    { label: "Medication", icon: Pill, tone: "bg-fuchsia-600", href: "/medications" },
    { label: "Inventory", icon: Boxes, tone: "bg-amber-600", href: "/inventory-nurse" },
    { label: "Nursing Services", icon: Stethoscope, tone: "bg-cyan-600", href: "/nursing-services-nurse" },
    { label: "Handover", icon: ClipboardList, tone: "bg-teal-600", href: "/shift-handover" },
    { label: "Incident", icon: AlertTriangle, tone: "bg-red-600", href: "/ai-risk" },
    { label: "Voice Input", icon: Mic, tone: "bg-purple-600", onClick: openVoice },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">WMC AI Nursing</p>
            <h1 className="text-lg font-bold text-slate-900">Nurse Mode</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">On duty</p>
            <button
              type="button"
              onClick={() => {
                setNameDraft(name)
                setEditingName(true)
              }}
              className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900"
            >
              {name || "Set name"}
              <Pencil className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        {/* Name setup card */}
        {editingName ? (
          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-sm font-semibold text-slate-700">Your name</label>
            <p className="mb-2 text-xs text-slate-500">Set once — used for punch in/out and records.</p>
            <div className="flex gap-2">
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="e.g. Wong"
                autoFocus
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-base"
              />
              <button
                type="button"
                onClick={saveName}
                className="rounded-xl bg-slate-900 px-5 py-3 text-base font-semibold text-white active:scale-[0.98]"
              >
                Save
              </button>
            </div>
          </section>
        ) : null}

        {/* Action grid — large thumb-friendly buttons */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((tile) => {
            const Icon = tile.icon
            const content = (
              <span className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
                <Icon className="h-9 w-9" />
                <span className="text-base font-bold leading-tight">{tile.label}</span>
              </span>
            )
            const className = `flex min-h-[7rem] items-center justify-center rounded-2xl ${tile.tone} p-4 text-white shadow-md transition active:scale-[0.97] disabled:opacity-60`
            if (tile.href) {
              return (
                <Link key={tile.label} href={tile.href} className={className}>
                  {content}
                </Link>
              )
            }
            return (
              <button
                key={tile.label}
                type="button"
                onClick={tile.onClick}
                disabled={busy !== null}
                className={className}
              >
                {content}
              </button>
            )
          })}
        </section>

        <p className="mt-5 text-center text-xs text-slate-400">
          Tap a button to start. No typing needed for most tasks.
        </p>
      </main>

      {/* Toast */}
      {toast ? (
        <div className="fixed inset-x-0 bottom-24 z-40 mx-auto w-fit max-w-[90%] rounded-full bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      {/* Voice input modal */}
      {voiceOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              stopListening()
              setVoiceOpen(false)
            }}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Voice Input</h2>
              <button
                type="button"
                onClick={() => {
                  stopListening()
                  setVoiceOpen(false)
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              className={`mb-3 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl text-base font-bold text-white active:scale-[0.98] ${
                listening ? "bg-rose-600" : "bg-purple-600"
              }`}
            >
              {listening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              {listening ? "Stop listening" : "Start speaking"}
            </button>

            <textarea
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              rows={5}
              placeholder="Your dictated note will appear here..."
              className="w-full rounded-xl border border-slate-300 p-3 text-base"
            />
            {voiceError ? <p className="mt-2 text-sm text-rose-600">{voiceError}</p> : null}

            <button
              type="button"
              onClick={() => void copyTranscript()}
              disabled={!transcript.trim()}
              className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-slate-900 text-base font-semibold text-white disabled:opacity-50"
            >
              Copy note
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
