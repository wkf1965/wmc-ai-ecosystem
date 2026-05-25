type Tone = "good" | "warn" | "danger" | "neutral"

const toneClass: Record<Tone, string> = {
  good: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  warn: "bg-amber-100 text-amber-800 ring-amber-200",
  danger: "bg-rose-100 text-rose-800 ring-rose-200",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${toneClass[tone]}`}
    >
      {label}
    </span>
  )
}

