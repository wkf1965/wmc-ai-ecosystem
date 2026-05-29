"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import {
  Activity,
  BedDouble,
  Bell,
  Boxes,
  Building2,
  CalendarClock,
  ClipboardList,
  Clock3,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Menu,
  Pill,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  X,
} from "lucide-react"
import { getRole, setRole, ROLE_CHANGE_EVENT, type AppRole } from "../lib/roleMode"

type NavItem = { name: string; href: string; icon: typeof Activity; adminOnly?: boolean }

// Full module list. adminOnly entries are hidden in Nurse Mode.
const ALL_MODULES: NavItem[] = [
  { name: "Nurse Mode", href: "/nurse", icon: Stethoscope },
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, adminOnly: true },
  { name: "Turning / Position Care", href: "/turning", icon: BedDouble },
  { name: "Turning Supervisor Review", href: "/turning-supervisor-review", icon: ShieldCheck, adminOnly: true },
  { name: "Vital Signs", href: "/vital-signs", icon: Activity },
  { name: "Medications", href: "/medications", icon: Pill },
  { name: "Patients", href: "/patients", icon: Users },
  { name: "Rooms", href: "/rooms", icon: Building2 },
  { name: "Nurse Duty Roster", href: "/nurse-duty-roster", icon: CalendarClock },
  { name: "Overtime OT", href: "/overtime-ot", icon: Clock3 },
  { name: "Inventory", href: "/inventory", icon: Boxes, adminOnly: true },
  { name: "Nursing Notes", href: "/ai-note-analyzer", icon: ClipboardList },
  { name: "AI Alerts", href: "/ai-risk", icon: Bell },
  { name: "Shift Handover", href: "/shift-handover", icon: HeartPulse },
  { name: "AI Daily Summary", href: "/ai-summary", icon: Sparkles },
  { name: "WhatsApp Alerts", href: "/whatsapp-alerts", icon: Bell },
  { name: "Reports", href: "/reports", icon: FileText, adminOnly: true },
]

function isActive(pathname: string, href: string) {
  if (href === "/nurse") return pathname === "/nurse" || pathname === "/"
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function MobileNav() {
  const pathname = usePathname() || "/"
  const [open, setOpen] = useState(false)
  const [role, setRoleState] = useState<AppRole>("nurse")

  useEffect(() => {
    const sync = () => setRoleState(getRole())
    sync()
    window.addEventListener(ROLE_CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(ROLE_CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    document.body.style.overflow = open ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const modules = role === "admin" ? ALL_MODULES : ALL_MODULES.filter((item) => !item.adminOnly)

  // Bottom-bar primary destination depends on role.
  const home: NavItem =
    role === "admin"
      ? { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }
      : { name: "Nurse", href: "/nurse", icon: Stethoscope }

  const quickActions: NavItem[] = [
    home,
    { name: "Turning", href: "/turning", icon: BedDouble },
    { name: "Vitals", href: "/vital-signs", icon: Activity },
  ]

  return (
    <>
      {/* ── Full-screen module drawer ─────────────────────────────────── */}
      {open ? (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          />
          <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-base font-semibold text-white">
                  WN
                </span>
                <div>
                  <p className="text-base font-semibold text-slate-900">WMC Nursing</p>
                  <p className="text-xs text-slate-500">{role === "admin" ? "Admin mode" : "Nurse mode"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 active:bg-slate-100"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <nav className="grid grid-cols-2 gap-3 overflow-y-auto p-4">
              {modules.map((item) => {
                const Icon = item.icon
                const active = isActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex min-h-[5rem] flex-col items-start justify-between rounded-2xl border p-4 text-sm font-semibold transition active:scale-[0.98] ${
                      active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-800"
                    }`}
                  >
                    <Icon className={`h-7 w-7 ${active ? "text-white" : "text-slate-500"}`} />
                    <span className="leading-tight">{item.name}</span>
                  </Link>
                )
              })}
            </nav>

            {/* Role switch footer */}
            <div className="border-t border-slate-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {role === "admin" ? (
                <button
                  type="button"
                  onClick={() => {
                    setRole("nurse")
                    setOpen(false)
                  }}
                  className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 active:bg-slate-100"
                >
                  Exit Admin → Nurse Mode
                </button>
              ) : (
                <Link
                  href="/reports"
                  onClick={() => setOpen(false)}
                  className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 active:bg-slate-100"
                >
                  Admin login (management pages)
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Fixed bottom navigation bar (mobile + tablet only) ─────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          {quickActions.map((item) => {
            const Icon = item.icon
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[4rem] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition active:bg-slate-100 ${
                  active ? "text-slate-900" : "text-slate-500"
                }`}
              >
                <Icon className={`h-6 w-6 ${active ? "text-slate-900" : "text-slate-500"}`} />
                {item.name}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open all modules"
            className="flex min-h-[4rem] flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-500 active:bg-slate-100"
          >
            <Menu className="h-6 w-6" />
            Menu
          </button>
        </div>
      </nav>
    </>
  )
}
