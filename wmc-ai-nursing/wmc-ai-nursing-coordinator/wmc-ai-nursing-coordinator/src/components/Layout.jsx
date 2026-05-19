import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ClipboardList,
  Activity,
  Sparkles,
  HeartHandshake,
  FileBarChart,
  ShieldCheck,
  Menu,
  X,
  Stethoscope,
  ScanHeart,
  FileText,
  Pill,
  UserRoundCheck,
  LineChart,
  Send,
  Smartphone,
  Settings,
  Bot,
  HeartPulse,
  BedDouble,
  ClipboardClock,
  Timer,
  Table2,
  Clock,
  ClockAlert,
  Camera,
  Repeat2,
  MonitorSmartphone,
  RotateCw,
  PillBottle,
  Droplets,
  UtensilsCrossed,
  Dumbbell,
  Bandage,
  Brain,
  Toilet,
  Siren,
  Moon,
  Footprints,
  ClipboardSignature,
  BrainCircuit,
  Cpu,
  LayoutGrid,
  MessagesSquare,
  Microscope,
  TestTube2,
  DoorOpen,
  Braces,
} from 'lucide-react'
import { useState } from 'react'
import { facilityName } from '../data/dummyData'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/patients', label: 'Patients', icon: Users },
  { to: '/patient-registration', label: 'Patient registration', icon: UserPlus },
  { to: '/nursing-notes', label: 'Daily Nursing Notes', icon: ClipboardList },
  { to: '/rehab', label: 'Rehabilitation Progress', icon: Activity },
  { to: '/ai-risk', label: 'AI Risk Detection', icon: ScanHeart },
  { to: '/ai-risk-prediction-loop', label: 'AI Risk Prediction Loop', icon: BrainCircuit },
  { to: '/alerts', label: 'AI Alerts', icon: Sparkles },
  { to: '/ai-brain', label: 'AI Intelligent Brain', icon: Cpu },
  { to: '/telegram-nurse-input', label: 'Telegram Nurse Input', icon: Send },
  { to: '/telegram-test', label: 'Telegram Test', icon: TestTube2 },
  { to: '/telegram-nursing-dashboard', label: 'Telegram Nursing Dashboard', icon: LayoutGrid },
  { to: '/room-module', label: 'Room Module', icon: DoorOpen },
  { to: '/family-updates', label: 'Family Updates', icon: HeartHandshake },
  { to: '/family-update-loop', label: 'Family Update Loop', icon: MessagesSquare },
  /** Prominent placement — long nav scrolls; these must stay easy to find */
  { to: '/side-turning', label: 'Side Turning', icon: BedDouble },
  { to: '/side-turning-loop', label: 'Side Turning Loop', icon: RotateCw },
  { to: '/overtime', label: 'Overtime', icon: Clock },
  { to: '/staff-overtime-loop', label: 'Staff Overtime Loop', icon: ClockAlert },
  { to: '/emergency-response-loop', label: 'Emergency Response Loop', icon: Siren },
  { to: '/sleep-monitoring-loop', label: 'Sleep Monitoring Loop', icon: Moon },
  { to: '/fall-prevention-loop', label: 'Fall Prevention Loop', icon: Footprints },
  { to: '/care-loops', label: 'Care Loops', icon: Repeat2 },
  { to: '/health-check-loop', label: 'Health Check Loop', icon: MonitorSmartphone },
  { to: '/hydration-loop', label: 'Hydration Loop', icon: Droplets },
  { to: '/nutrition-loop', label: 'Feeding / Nutrition Loop', icon: UtensilsCrossed },
  { to: '/rehabilitation-loop', label: 'Rehabilitation Loop', icon: Dumbbell },
  { to: '/wound-care-loop', label: 'Wound Care Loop', icon: Bandage },
  { to: '/infection-control-loop', label: 'Infection Control Loop', icon: Microscope },
  { to: '/mental-health-loop', label: 'Mental Health Loop', icon: Brain },
  { to: '/continence-loop', label: 'Toilet / Continence Loop', icon: Toilet },
  { to: '/side-turning-posture', label: 'Posture & photo', icon: Camera },
  { to: '/shift-handover', label: 'Shift Handover', icon: FileText },
  { to: '/supervisor', label: 'Supervisor Center', icon: ShieldCheck },
  { to: '/doctor-review', label: 'Doctor Review', icon: UserRoundCheck },
  { to: '/doctor-review-loop', label: 'Doctor Review Loop', icon: ClipboardSignature },
  { to: '/medications', label: 'Medication Tracking', icon: Pill },
  { to: '/medication-loop', label: 'Medication Loop', icon: PillBottle },
  { to: '/rehab-tracking', label: 'Rehabilitation Tracking', icon: LineChart },
  { to: '/nurse-input', label: 'Nurse Vital Input', icon: HeartPulse },
  { to: '/mobile-nurse', label: 'Mobile Nurse Input', icon: Smartphone },
  { to: '/staff-attendance', label: 'Staff Attendance', icon: ClipboardClock },
  { to: '/ot-management', label: 'OT Management', icon: Timer },
  { to: '/ot-reports', label: 'OT Reports', icon: Table2 },
  { to: '/settings/google-sheet', label: 'Google Sheet', icon: Settings },
  { to: '/settings/telegram', label: 'Telegram Bot', icon: Bot },
  { to: '/backend-api-test', label: 'Backend API test', icon: Braces },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
]

function NavItems({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Main">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-teal-500/15 text-teal-100 shadow-sm ring-1 ring-teal-400/30'
                : 'text-slate-300 hover:bg-white/5 hover:text-white',
            ].join(' ')
          }
        >
          <Icon className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-800/80 bg-slate-900 text-slate-100 lg:flex lg:fixed lg:inset-y-0 lg:z-40">
        <div className="shrink-0 flex items-center gap-3 border-b border-slate-800/80 px-4 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 shadow-lg shadow-teal-900/40">
            <Stethoscope className="h-5 w-5 text-white" aria-hidden />
          </div>
          <div className="min-w-0 text-left">
            <p className="truncate text-xs font-semibold uppercase tracking-wider text-teal-300/90">
              AI Coordinator
            </p>
            <p className="truncate text-sm font-semibold text-white">{facilityName}</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <NavItems />
        </div>
        <div className="shrink-0 border-t border-slate-800/80 p-4 text-xs text-slate-500">
          Demo dashboard · No live PHI
        </div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!open}
        onClick={() => setOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh max-h-dvh w-[min(18rem,100%)] flex-col border-r border-slate-800 bg-slate-900 text-slate-100 shadow-2xl transition-transform duration-200 ease-out lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-3 py-4">
          <span className="text-sm font-semibold text-white">Menu</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <NavItems onNavigate={() => setOpen(false)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-slate-900 sm:text-xl">
                Internal Nursing Coordinator
              </h1>
              <p className="hidden truncate text-sm text-slate-500 sm:block">
                {location.pathname === '/'
                  ? 'Unit overview and AI-assisted insights'
                  : 'Secure care operations view'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 sm:inline">
              Live census: 94%
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-xs font-bold text-white">
              NC
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
