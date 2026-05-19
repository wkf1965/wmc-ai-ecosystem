import Link from "next/link"

export default function ReportsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Clinical Insight</p>
          <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Operational snapshots for quality and compliance.</p>
        </div>
        <Link href="/dashboard" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Back to dashboard
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Completion trend</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">98%</p>
          <p className="text-sm text-slate-500">Nursing notes completed within shift window</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">AI escalations</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">17</p>
          <p className="text-sm text-slate-500">Flags generated in last 7 days</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">High-risk residents</p>
          <p className="mt-2 text-2xl font-bold text-rose-700">7</p>
          <p className="text-sm text-slate-500">Requires continuous monitoring</p>
        </article>
      </section>
    </main>
  )
}