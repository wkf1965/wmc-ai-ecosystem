export default function StatusBadge({ value, tone = "neutral" }: { value: string; tone?: "neutral" | "good" | "warn" | "danger" }) {
  const toneClass = {
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
    good: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    warn: "bg-amber-100 text-amber-700 ring-amber-200",
    danger: "bg-rose-100 text-rose-700 ring-rose-200",
  }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${toneClass[tone]}`}>{value}</span>
}