import type { ReactNode } from "react"

type DashboardCardProps = {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function DashboardCard({
  title,
  subtitle,
  action,
  children,
  className = "",
}: DashboardCardProps) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-base font-semibold text-slate-900">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="text-sm text-slate-700">{children}</div>
    </section>
  )
}

