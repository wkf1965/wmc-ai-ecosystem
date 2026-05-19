import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Download, FileText } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { qualityMetrics, censusTrend } from '../data/dummyData'

const reportRows = [
  { name: 'Nursing hours PPD', value: '3.8', target: '3.5', status: 'ok' },
  { name: 'Restraint-free days', value: '100%', target: '100%', status: 'ok' },
  { name: 'Antipsychotic use (LTC)', value: '11%', target: '<15%', status: 'ok' },
  { name: 'Pressure injury rate', value: '0.9', target: '<1.2', status: 'watch' },
]

export default function ReportsPage() {
  const lastCensus = censusTrend[censusTrend.length - 1]

  const chartData = qualityMetrics.map((q) => ({
    name: q.name,
    value: q.value,
    benchmark: q.benchmark,
  }))

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Quality, utilization, and regulatory-ready summaries — figures are illustrative."
        action={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Download className="h-4 w-4" aria-hidden />
            Export PDF (demo)
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card padding="p-5">
          <p className="text-sm font-medium text-slate-500">Current occupancy</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{lastCensus.occupancy}%</p>
          <p className="mt-1 text-xs text-slate-600">
            Admits {lastCensus.admits} · DC {lastCensus.discharges}
          </p>
        </Card>
        <Card padding="p-5">
          <p className="text-sm font-medium text-slate-500">Incidents (30d)</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">3</p>
          <p className="mt-1 text-xs text-slate-600">2 minor, 1 under review</p>
        </Card>
        <Card padding="p-5">
          <p className="text-sm font-medium text-slate-500">Readmission (30d)</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">1</p>
          <p className="mt-1 text-xs text-emerald-700">Within internal target</p>
        </Card>
        <Card padding="p-5">
          <p className="text-sm font-medium text-slate-500">Family satisfaction</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">4.6</p>
          <p className="mt-1 text-xs text-slate-600">Rolling 90-day survey</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card padding="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-teal-600" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-slate-900">Quality indicators</h3>
              <p className="text-sm text-slate-500">Observed vs internal benchmark (demo)</p>
            </div>
          </div>
          <div className="h-64 w-full min-h-[16rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" interval={0} angle={-12} textAnchor="end" height={48} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="value" name="Observed" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.value <= entry.benchmark ? '#0d9488' : '#ea580c'} />
                  ))}
                </Bar>
                <Bar dataKey="benchmark" name="Benchmark" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card padding="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900">Operational snapshot</h3>
          <p className="text-sm text-slate-500">Selected KPIs for leadership huddle</p>
          <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Metric</th>
                  <th className="px-4 py-3">Actual</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {reportRows.map((row) => (
                  <tr key={row.name}>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{row.value}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-500">{row.target}</td>
                    <td className="px-4 py-3">
                      <Badge variant={row.status === 'ok' ? 'success' : 'warning'}>
                        {row.status === 'ok' ? 'On track' : 'Watch'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Replace with your data warehouse or EHR extracts. Charts use Recharts and scale on small screens.
          </p>
        </Card>
      </div>
    </div>
  )
}
