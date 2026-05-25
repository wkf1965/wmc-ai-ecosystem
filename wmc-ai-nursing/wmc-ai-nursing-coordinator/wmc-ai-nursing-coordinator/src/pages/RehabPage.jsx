import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CheckCircle2, Circle, Target } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { rehabPrograms } from '../data/dummyData'

export default function RehabPage() {
  return (
    <div>
      <PageHeader
        title="Nursing care progress"
        description="Functional trends, therapy minutes, and milestone tracking for active nursing support caseload."
      />

      <div className="space-y-6">
        {rehabPrograms.map((prog) => (
          <Card key={prog.patientId} padding="p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
                  <Target className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{prog.patientName}</h3>
                  <p className="mt-1 max-w-prose text-sm text-slate-600">{prog.primaryGoal}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="info">{prog.sessionsPerWeek} sessions / week</Badge>
                    <Badge variant="default">Target discharge: {prog.targetDate}</Badge>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                  <p className="text-xs font-medium text-slate-500">Barthel index</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {prog.barthelIndex.current}
                    <span className="text-sm font-normal text-slate-500"> / 100</span>
                  </p>
                  <p className="text-xs text-emerald-700">+{prog.barthelIndex.current - prog.barthelIndex.admission} vs admit</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                  <p className="text-xs font-medium text-slate-500">FIM motor</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {prog.fimMotor.current}
                    <span className="text-sm font-normal text-slate-500"> / 91</span>
                  </p>
                  <p className="text-xs text-emerald-700">+{prog.fimMotor.current - prog.fimMotor.admission} vs admit</p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Therapy minutes by week</h4>
                <div className="mt-3 h-56 w-full min-h-[14rem]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={prog.weeklyMinutes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="pt" name="PT min" fill="#0d9488" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="ot" name="OT min" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Functional gain (simulated)</h4>
                <div className="mt-3 h-56 w-full min-h-[14rem]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={[
                        { label: 'Week 1', barthel: prog.barthelIndex.admission, fim: prog.fimMotor.admission },
                        { label: 'Week 2', barthel: prog.barthelIndex.admission + 6, fim: prog.fimMotor.admission + 5 },
                        { label: 'Week 3', barthel: prog.barthelIndex.admission + 10, fim: prog.fimMotor.admission + 9 },
                        {
                          label: 'Current',
                          barthel: prog.barthelIndex.current,
                          fim: prog.fimMotor.current,
                        },
                      ]}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="barthel" name="Barthel" stroke="#0d9488" strokeWidth={2} dot />
                      <Line type="monotone" dataKey="fim" name="FIM motor" stroke="#7c3aed" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <h4 className="text-sm font-semibold text-slate-900">Milestones</h4>
              <ul className="mt-3 space-y-2">
                {prog.milestones.map((m) => (
                  <li
                    key={m.label}
                    className="flex items-start gap-3 rounded-xl bg-slate-50/80 px-3 py-2.5 ring-1 ring-slate-100"
                  >
                    {m.done ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                    ) : (
                      <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${m.done ? 'text-slate-900' : 'text-slate-600'}`}>{m.label}</p>
                      {m.date ? <p className="text-xs text-slate-500">Met {m.date}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
