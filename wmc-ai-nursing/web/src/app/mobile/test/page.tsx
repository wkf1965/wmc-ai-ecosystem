"use client"

import Link from "next/link"
import { CheckCircle2 } from "lucide-react"

export default function MobileTestPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-emerald-50 px-6 text-center">
      <CheckCircle2 className="mb-5 h-20 w-20 text-emerald-600" />
      <h1 className="text-2xl font-bold text-emerald-900">Mobile Nursing Input Working</h1>
      <p className="mt-2 text-sm text-emerald-700">
        Next.js App Router route <code className="rounded bg-white px-1.5 py-0.5">/mobile/test</code> is live.
      </p>
      <Link
        href="/mobile"
        className="mt-8 inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-emerald-600 px-8 text-base font-bold text-white shadow active:scale-[0.98]"
      >
        Go to Nurse Menu
      </Link>
    </div>
  )
}
