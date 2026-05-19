export function PageHeader({ title, description, action }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-slate-600 sm:text-base">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function Card({ children, className = '', padding = 'p-5 sm:p-6' }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50 ${padding} ${className}`}
    >
      {children}
    </div>
  )
}

export function Badge({ children, variant = 'default', className = '' }) {
  const styles = {
    default: 'bg-slate-100 text-slate-700 ring-slate-200/60',
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-200/60',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200/60',
    danger: 'bg-red-50 text-red-800 ring-red-200/60',
    info: 'bg-sky-50 text-sky-900 ring-sky-200/60',
    teal: 'bg-teal-50 text-teal-900 ring-teal-200/60',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[variant] || styles.default} ${className}`}
    >
      {children}
    </span>
  )
}
