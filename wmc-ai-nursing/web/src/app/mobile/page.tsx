"use client"

import Link from "next/link"
import { Activity, Boxes, ClipboardList, FileText, BedDouble, Pill } from "lucide-react"

const items = [
  { label: "Vital Signs", href: "/mobile/vitals", icon: Activity, tone: "bg-rose-500" },
  { label: "Medication Given", href: "/mobile/medication", icon: Pill, tone: "bg-fuchsia-600" },
  { label: "Inventory Usage", href: "/mobile/inventory", icon: Boxes, tone: "bg-amber-500" },
  { label: "Side Turning", href: "/mobile/turning", icon: BedDouble, tone: "bg-sky-600" },
  { label: "Patient Note", href: "/mobile/note", icon: FileText, tone: "bg-indigo-600" },
  { label: "Shift Handover", href: "/mobile/handover", icon: ClipboardList, tone: "bg-teal-600" },
]

export default function MobileMenuPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-sky-700 px-4 py-5 text-white shadow">
        <div className="mx-auto max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/80">WMC AI Nursing</p>
          <h1 className="text-xl font-bold">Nurse Mobile Input</h1>
          <p className="mt-0.5 text-sm text-white/80">Tap a task to record it.</p>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-5">
        <section className="grid grid-cols-2 gap-3">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[8rem] flex-col items-center justify-center gap-3 rounded-2xl ${item.tone} p-4 text-center text-white shadow-md transition active:scale-[0.97]`}
              >
                <Icon className="h-10 w-10" />
                <span className="text-base font-bold leading-tight">{item.label}</span>
              </Link>
            )
          })}
        </section>

        <Link
          href="/dashboard"
          className="mt-5 block rounded-2xl border border-slate-300 bg-white py-3.5 text-center text-base font-semibold text-slate-700"
        >
          Open Dashboard
        </Link>

        <Link href="/mobile/test" className="mt-3 block text-center text-xs font-medium text-emerald-700">
          ✓ Mobile Nursing Input Working — tap to test
        </Link>
      </main>
    </div>
  )
}
