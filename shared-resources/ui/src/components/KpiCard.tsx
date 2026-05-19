export default function KpiCard({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "good" | "warn" | "danger" }) {
  const toneClass = {
    neutral: "text-slate-900",
    good: "text-emerald-700",
    warn: "text-amber-700",
    danger: "text-rose-700",
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${toneClass[tone]}`}>{value}</p>
    </div>
  )
}