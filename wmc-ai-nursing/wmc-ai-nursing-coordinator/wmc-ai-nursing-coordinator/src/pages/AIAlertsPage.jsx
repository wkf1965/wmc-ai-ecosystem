import { useMemo, useState } from 'react'
import { Brain, ShieldAlert } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { aiAlerts } from '../data/dummyData'

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }

function severityBadge(sev) {
  if (sev === 'critical') return 'danger'
  if (sev === 'high') return 'warning'
  if (sev === 'medium') return 'warning'
  return 'success'
}

export default function AIAlertsPage() {
  const [filter, setFilter] = useState('all')

  const sorted = useMemo(() => {
    const list = [...aiAlerts].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    if (filter === 'all') return list
    return list.filter((a) => a.severity === filter)
  }, [filter])

  return (
    <div>
      <PageHeader
        title="AI risk alerts"
        description="Pattern detection across notes, vitals, and therapy logs — always verify at the bedside before action."
        action={
          <div className="flex flex-wrap gap-2">
            {['all', 'critical', 'high', 'medium'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ring-1 transition-colors ${
                  filter === f
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 ring-1 ring-amber-100">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
        <p>
          <strong>Clinical governance:</strong> AI outputs are adjuncts to professional judgment. Escalate per
          facility policy and document acknowledgments in the EHR.
        </p>
      </div>

      <div className="space-y-4">
        {sorted.map((a) => (
          <Card key={a.id} padding="p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 flex-1 gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-800">
                  <Brain className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">{a.title}</h3>
                    <Badge variant={severityBadge(a.severity)}>{a.severity}</Badge>
                    <Badge variant="info">{a.category}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {a.patientName} · Model confidence {(a.confidence * 100).toFixed(0)}%
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-700">{a.description}</p>
                  <ul className="mt-4 space-y-1.5">
                    {a.suggestedActions.map((s) => (
                      <li key={s} className="flex gap-2 text-sm text-slate-800">
                        <span className="text-teal-600">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2 lg:items-end">
                <Badge
                  variant={
                    a.status === 'resolved' ? 'success' : a.status === 'acknowledged' ? 'info' : 'warning'
                  }
                >
                  {a.status}
                </Badge>
                <time className="text-xs text-slate-500" dateTime={a.createdAt}>
                  {new Date(a.createdAt).toLocaleString()}
                </time>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Acknowledge
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                  >
                    Create task
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
