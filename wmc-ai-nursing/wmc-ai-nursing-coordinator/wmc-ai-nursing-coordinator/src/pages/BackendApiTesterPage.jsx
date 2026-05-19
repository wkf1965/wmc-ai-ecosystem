import { useCallback, useEffect, useState } from 'react'
import { Braces, KeyRound, Loader2, LogOut, Play } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'

/**
 * Full REST base (must include `/api/v1`). Override with VITE_API_BASE_URL in `.env`.
 * Direct URL works with backend CORS; `/api` + Vite proxy also works if you prefer relative URLs.
 */
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '')
    : 'http://localhost:4000/api/v1'
)

const TOKEN_KEY = 'wmcBackendApiTesterJwt'

const SAMPLE_LOGIN = {
  email: 'admin@wmc.local',
  password: 'password123',
}

const SAMPLES = {
  patientPost: {
    name: 'Ah Lim',
    age: 78,
    gender: 'Male',
    condition: 'Stroke rehab',
    phone: '0123456789',
  },
  leadPost: {
    name: 'Mr Tan',
    phone: '0124520077',
    interest: 'Nursing home care',
    source: 'WhatsApp',
    status: 'hot lead',
  },
  nursingRecordLegacy: {
    patientName: 'Ah Lim',
    temperature: '37.2',
    bloodPressure: '130/80',
    condition: 'Stable',
    nurseNote: 'Patient ate well today',
  },
  nursingClinicalRecord: {
    patientId: 'P001',
    patientName: 'Test Patient',
    nurseName: 'Nurse Mary',
    bloodPressure: '130/80',
    pulse: 78,
    temperature: 36.8,
    oxygen: 98,
    painScore: 3,
    appetite: 'Good',
    mood: 'Calm',
    mobility: 'Needs assistance',
    sideTurning: 'Left side completed',
    woundCondition: 'No redness',
    notes: 'Patient stable today',
  },
  rehabProgress: {
    patientName: 'Ah Lim',
    painScore: 4,
    mobility: 'Can walk with support',
    therapistNote: 'Improved balance today',
  },
  aiSummary: {
    patientName: 'Ah Lim',
    notes:
      'Stroke patient, today walking improved, appetite good, blood pressure stable',
  },
}

const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-45'
const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:border-teal-300 hover:bg-teal-50 disabled:opacity-45'

async function request(path, { method = 'GET', body, token } = {}) {
  const pathPart = path.startsWith('/') ? path : `/${path}`
  const url = `${API_BASE}${pathPart}`
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { _parseError: true, raw: text }
  }
  return { ok: res.ok, status: res.status, data }
}

export default function BackendApiTesterPage() {
  const [email, setEmail] = useState(SAMPLE_LOGIN.email)
  const [password, setPassword] = useState(SAMPLE_LOGIN.password)
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [userLabel, setUserLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [lastError, setLastError] = useState(null)

  const signedIn = Boolean(token)

  const persistToken = useCallback((t, user) => {
    setToken(t)
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
    if (user) setUserLabel(`${user.name || user.fullName || user.email} (${user.role})`)
    else setUserLabel('')
  }, [])

  /** Restore display name from GET /auth/me when a token is already in localStorage. */
  useEffect(() => {
    if (!token) {
      setUserLabel('')
      return
    }
    let cancelled = false
    ;(async () => {
      const { ok, status, data } = await request('/auth/me', { token })
      if (cancelled) return
      if (ok && data?.email) {
        setUserLabel(
          `${data.name || data.fullName || data.email} (${data.role})`,
        )
      } else if (status === 401) {
        persistToken('', null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, persistToken])

  const handleLogin = async () => {
    setBusy(true)
    setLastError(null)
    setLastResult(null)
    try {
      const { ok, status, data } = await request('/auth/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      })
      setLastResult({
        step: `POST ${API_BASE}/auth/login`,
        ok,
        status,
        data,
      })
      if (ok && data?.token) {
        persistToken(data.token, data.user)
        setLastError(null)
      } else {
        persistToken('', null)
        const msg =
          (data && typeof data.message === 'string' && data.message) ||
          (data && typeof data.error === 'string' && data.error) ||
          `Login failed (HTTP ${status})`
        setLastError(msg)
      }
    } catch (e) {
      setLastError(String(e?.message || e))
      persistToken('', null)
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = () => {
    persistToken('', null)
    setLastResult(null)
    setLastError(null)
  }

  const runAuthorized = async (label, path, method, body) => {
    if (!token) {
      setLastError('Please sign in first (use the login section above).')
      setLastResult(null)
      return
    }
    setBusy(true)
    setLastError(null)
    try {
      const { ok, status, data } = await request(path, { method, body, token })
      setLastResult({ step: label, ok, status, data })
      if (!ok) {
        setLastError(
          (data && typeof data.message === 'string' && data.message) ||
            (data && typeof data.error === 'string' && data.error) ||
            `Request failed (HTTP ${status})`,
        )
      }
    } catch (e) {
      setLastError(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const actions = [
      {
        id: 'patients-get',
        title: 'List patients',
        hint: `GET ${API_BASE}/patients`,
        detail: 'Loads every patient in the backend store. Sends Authorization: Bearer <token>.',
        onClick: () => runAuthorized(`GET ${API_BASE}/patients`, '/patients', 'GET'),
      },
      {
        id: 'patients-post',
        title: 'Create sample patient',
        hint: `POST ${API_BASE}/patients`,
        detail: 'Adds “Ah Lim” (or updates your store). Needed before name-based nursing/rehab/AI calls.',
        onClick: () =>
          runAuthorized(`POST ${API_BASE}/patients`, '/patients', 'POST', SAMPLES.patientPost),
      },
      {
        id: 'crm-leads',
        title: 'Create sample CRM lead',
        hint: `POST ${API_BASE}/crm/leads`,
        detail: 'Mr Tan / WhatsApp — demo intake.',
        onClick: () =>
          runAuthorized(`POST ${API_BASE}/crm/leads`, '/crm/leads', 'POST', SAMPLES.leadPost),
      },
      {
        id: 'nursing-records-get',
        title: 'List structured nursing records',
        hint: `GET ${API_BASE}/nursing/records`,
        detail: 'In-memory clinical assessments (newest first).',
        onClick: () =>
          runAuthorized(`GET ${API_BASE}/nursing/records`, '/nursing/records', 'GET'),
      },
      {
        id: 'nursing-records-post',
        title: 'Post structured nursing record',
        hint: `POST ${API_BASE}/nursing/records`,
        detail:
          'Clinical snapshot (patientId can be MRNs like P001). In-memory; dev bypass ok without Bearer.',
        onClick: () =>
          runAuthorized(
            `POST ${API_BASE}/nursing/records`,
            '/nursing/records',
            'POST',
            SAMPLES.nursingClinicalRecord,
          ),
      },
      {
        id: 'nursing-quick-record',
        title: 'Post legacy quick-record (vital_signs)',
        hint: `POST ${API_BASE}/nursing/quick-record`,
        detail: 'Uses patient name “Ah Lim”. Saves to persistent vital_signs tab.',
        onClick: () =>
          runAuthorized(
            `POST ${API_BASE}/nursing/quick-record`,
            '/nursing/quick-record',
            'POST',
            SAMPLES.nursingRecordLegacy,
          ),
      },
      {
        id: 'rehab-progress',
        title: 'Submit rehab progress',
        hint: `POST ${API_BASE}/rehab/progress`,
        detail: 'Therapist-style payload for “Ah Lim”.',
        onClick: () =>
          runAuthorized(
            `POST ${API_BASE}/rehab/progress`,
            '/rehab/progress',
            'POST',
            SAMPLES.rehabProgress,
          ),
      },
      {
        id: 'ai-summary',
        title: 'Request AI notes summary',
        hint: `POST ${API_BASE}/ai/summary`,
        detail: 'Stub LLM response saved under ai_results.',
        onClick: () =>
          runAuthorized(`POST ${API_BASE}/ai/summary`, '/ai/summary', 'POST', SAMPLES.aiSummary),
      },
    ]

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Backend API tester"
        description={`Try the WMC AI Backend from the browser. API base: ${API_BASE} (set VITE_API_BASE_URL to override). Uses demo sample JSON — no typing required.`}
      />

      <Card className="mb-6 border-amber-100 bg-amber-50/80">
        <h3 className="text-sm font-bold text-amber-950">Before you start</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-950/90">
          <li>
            Run <code className="rounded bg-white px-1 py-0.5 text-xs">wmc-ai-backend</code> on{' '}
            <strong>port 4000</strong> and seed demo users (
            <code className="rounded bg-white px-1 py-0.5 text-xs">npm run seed</code>). This page
            calls <code className="rounded bg-white px-1 py-0.5 text-xs">{API_BASE}</code> directly (
            CORS). Optional: set <code className="rounded bg-white px-1 py-0.5 text-xs">
              VITE_API_BASE_URL
            </code>{' '}
            in <code className="rounded bg-white px-1 py-0.5 text-xs">.env</code>.
          </li>
          <li>
            Default login below is the seeded <strong>admin</strong> account (can call every button).
          </li>
          <li>
            Create the sample patient before nursing, rehab, or AI buttons if “Ah Lim” is not in the
            database yet.
          </li>
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              void handleLogin()
            }}
          >
            <div className="mb-4 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-teal-600" aria-hidden />
              <h3 className="text-lg font-semibold text-slate-900">1. Sign in</h3>
            </div>
            <label className="block text-xs font-medium text-slate-600" htmlFor="api-email">
              Email
            </label>
            <input
              id="api-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-3 mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <label className="block text-xs font-medium text-slate-600" htmlFor="api-password">
              Password
            </label>
            <input
              id="api-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-4 mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={btnPrimary} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Sign in
              </button>
              <button
                type="button"
                className={btnSecondary}
                disabled={busy || !signedIn}
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
              {signedIn ? (
                <Badge variant="success">Signed in</Badge>
              ) : (
                <Badge variant="warning">Not signed in</Badge>
              )}
            </div>
            {userLabel ? (
              <p className="mt-3 text-xs text-slate-600">
                Session: <strong>{userLabel}</strong>
              </p>
            ) : null}
          </form>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Braces className="h-5 w-5 text-teal-600" aria-hidden />
            <h3 className="text-lg font-semibold text-slate-900">Sample payloads</h3>
          </div>
          <p className="mb-3 text-xs text-slate-600">
            Each button sends fixed demo JSON (good for quick smoke tests).
          </p>
          <pre className="max-h-64 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-emerald-100">
            {JSON.stringify(SAMPLES, null, 2)}
          </pre>
        </Card>
      </div>

      <Card className="mt-6">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">2. Run a request</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.map((a) => (
            <div
              key={a.id}
              className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/80 p-4"
            >
              <p className="font-semibold text-slate-900">{a.title}</p>
              <p className="mt-0.5 font-mono text-[11px] text-teal-700">{a.hint}</p>
              <p className="mt-2 text-xs text-slate-600">{a.detail}</p>
              <button
                type="button"
                className={`${btnSecondary} mt-3 min-h-[40px] justify-center`}
                disabled={busy || !signedIn}
                onClick={a.onClick}
              >
                <Play className="h-4 w-4 text-teal-600" />
                Run
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6">
        <h3 className="mb-2 text-lg font-semibold text-slate-900">Last response</h3>
        {lastError ? (
          <p
            className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-100"
            role="alert"
          >
            {lastError}
          </p>
        ) : null}
        {lastResult ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-slate-700">{lastResult.step}</span>
              <Badge variant={lastResult.ok ? 'success' : 'danger'}>
                HTTP {lastResult.status}
              </Badge>
              <Badge variant={lastResult.ok ? 'teal' : 'warning'}>
                {lastResult.ok ? 'OK' : 'Error'}
              </Badge>
            </div>
            <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-sky-100">
              {JSON.stringify(lastResult.data, null, 2)}
            </pre>
          </>
        ) : (
          <p className="text-sm text-slate-500">Run login or an API button to see JSON here.</p>
        )}
      </Card>
    </div>
  )
}
