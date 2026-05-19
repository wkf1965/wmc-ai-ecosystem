export default function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 p-6 text-white">
      <p className="text-sm uppercase tracking-wide text-sky-200">WMC AI Platform</p>
      <h1 className="mt-1 text-3xl font-bold">{title}</h1>
      <p className="mt-2 max-w-3xl text-slate-200">{description}</p>
    </header>
  )
}