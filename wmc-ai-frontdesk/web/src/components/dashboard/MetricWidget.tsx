import { KpiCard } from "@wmc/ui"

type MetricTone = "neutral" | "good" | "warn" | "danger"

export function MetricWidget({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string | number
  tone?: MetricTone
}) {
  return <KpiCard label={label} value={value} tone={tone} />
}

