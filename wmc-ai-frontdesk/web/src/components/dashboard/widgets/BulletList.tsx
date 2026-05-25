import type { ReactNode } from "react"

export function BulletList({
  items,
  empty = "None",
  tone = "default",
}: {
  items: string[]
  empty?: string
  tone?: "default" | "danger" | "warn"
}) {
  if (!items.length) {
    return <p className="text-sm italic text-slate-500">{empty}</p>
  }

  const itemClass =
    tone === "danger"
      ? "text-rose-800"
      : tone === "warn"
        ? "text-amber-800"
        : "text-slate-700"

  return (
    <ul className={`mt-2 list-inside list-disc space-y-1 text-sm ${itemClass}`}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export function LabelBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {children}
    </div>
  )
}
