import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FlaskConical, MessageSquare, RefreshCw, ShieldAlert, Stethoscope, Users } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import { scoreToLevel } from '../lib/aiRiskDetection.js'
import { runTelegramIntegrationFromLocalState } from '../lib/telegramNurseIntegration.js'
import { buildTelegramWorkflowReply } from '../lib/telegramWorkflowReply.js'

const btnGhost =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-800 shadow-sm hover:border-teal-300 hover:bg-teal-50'
const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-45'

const SAMPLE_SCENARIOS = [
  { label: 'Patient confused and agitated', text: 'Room 302A: Patient confused and agitated, yelling at staff' },
  { label: 'Patient refused medication', text: 'Room 318C: Patient refused 0900 medications per MAR' },
  { label: 'Patient fell in bathroom', text: 'Room 214B: Patient fell in bathroom, hip pain, RN notified' },
  { label: 'Poor appetite and dark urine', text: 'Room 305A: Poor appetite, refused lunch tray, dark urine noted' },
  { label: 'Fever and low oxygen', text: 'Room 221D: Fever 38.4°C, SpO2 91% on 2L NC, productive cough' },
]

function collectDetectedRisks(integration) {
  const { parsed, analysis } = integration
  if (analysis?.telegramPatientUnresolved) {
    return ['Patient not linked — resolve roster match before using structured AI signals.']
  }
  const fromCats = (analysis.categories || [])
    .filter((c) => c.score >= 15 && (c.signals?.length || c.level !== 'minimal'))
    .flatMap((c) =>
      c.signals?.length ? c.signals.map((s) => `${c.label}: ${s}`) : [`${c.label}: elevated (${c.score})`],
    )
  const keywords = parsed.riskKeywords.map((k) => `Keyword flag: ${k}`)
  const merged = [...new Set([...keywords, ...fromCats])]
  return merged.length ? merged : ['No strong structured signals — verify at bedside.']
}

function buildFamilyUpdateSuggestion(integration) {
  const { parsed, patientNameResolved } = integration
  const who = patientNameResolved || (parsed.patientRoom ? `the resident in Room ${parsed.patientRoom}` : 'your loved one')
  const focus = parsed.loopCategoryLabel || 'general condition'
  const themes = []
  if (parsed.riskKeywords.length) themes.push(`today’s report highlights ${parsed.riskKeywords.slice(0, 4).join(', ')}`)
  if (integration.analysis.anyEscalation || parsed.suggestedLoopCategory === 'doctor_review') {
    themes.push('the care team is escalating per protocol and will update you as soon as there is news')
  } else {
    themes.push('staff are monitoring closely and providing supportive care')
  }
  return `Draft family SMS — Re: ${who} (${focus}): ${themes.join('; ')}. Reply STOP to opt out; call the unit desk for clinical detail.`
}

const TELEGRAM_ENTRIES_URL = '/api/integrations/telegram/entries?limit=12'

export default function TelegramTestPage() {
  const { patients } = usePatients()
  const { notes } = useNursingNotes()
  const [input, setInput] = useState('')
  const [result, setResult] = useState(null)
  const [storeEntries, setStoreEntries] = useState([])
  const [storeError, setStoreError] = useState(null)

  const refreshEntries = useCallback(() => {
    setStoreError(null)
    fetch(TELEGRAM_ENTRIES_URL)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.entries)) setStoreEntries(j.entries)
        else setStoreError(j.error || 'Could not load entries')
      })
      .catch((e) => setStoreError(String(e?.message || e)))
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(TELEGRAM_ENTRIES_URL)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j.ok && Array.isArray(j.entries)) {
          setStoreEntries(j.entries)
          setStoreError(null)
        } else {
          setStoreError(j.error || 'Could not load entries')
        }
      })
      .catch((e) => {
        if (!cancelled) setStoreError(String(e?.message || e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const workflowReplyPreview = useMemo(() => (result ? buildTelegramWorkflowReply(result) : ''), [result])

  function runParse(textOverride) {
    const text = (textOverride ?? input).trim()
    if (!text) return
    const integration = runTelegramIntegrationFromLocalState(text, patients, notes)
    setResult(integration)
    if (textOverride !== undefined) setInput(textOverride)
  }

  const scoreNum = result?.analysis?.overallScore != null ? Number(result.analysis.overallScore) : NaN
  const overallLevel = Number.isFinite(scoreNum) ? scoreToLevel(scoreNum) : null
  const doctorReview =
    result &&
    Number.isFinite(scoreNum) &&
    (result.analysis.anyEscalation ||
      scoreNum >= 55 ||
      result.parsed.suggestedLoopCategory === 'doctor_review')
  const urgentEscalation =
    result &&
    !result.analysis?.telegramPatientUnresolved &&
    (result.parsed.suggestedLoopCategory === 'doctor_review' || overallLevel?.level === 'critical')

  return (
    <div className="mx-auto max-w-[960px] pb-10">
      <PageHeader
        title="Telegram test lab"
        description="Simulation harness for nurse Telegram messages plus live mock-store listing from the dev webhook. Parsing, loop routing, workflow risk labels, and bot reply wording match the shared webhook processor."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="warning">Simulation + mock store</Badge>
            <Badge variant="info">Integration test</Badge>
          </div>
        }
      />

      <Card className="mb-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
          <MessageSquare className="h-5 w-5 text-teal-600" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Nurse Telegram message</h2>
        </div>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Nurse Telegram message
          <textarea
            className="mt-1 min-h-[128px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-inner placeholder:text-slate-400"
            placeholder="e.g. Room 302A: Patient confused, refused lunch, weak mobility"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={() => runParse()}>
            Run parse
          </button>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sample scenarios</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SAMPLE_SCENARIOS.map(({ label, text }) => (
              <button key={label} type="button" className={btnGhost} onClick={() => runParse(text)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="mb-4" padding="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-slate-600" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900">Latest Telegram webhook inputs</h2>
          </div>
          <button type="button" className={btnGhost} onClick={() => refreshEntries()}>
            Refresh list
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Newest first from GET /api/integrations/telegram/entries (dev Vite middleware or Express on port 3001).
        </p>
        {storeError ? <p className="mt-2 text-sm text-amber-800">{storeError}</p> : null}
        {storeEntries.length === 0 && !storeError ? (
          <p className="mt-3 text-sm text-slate-600">No rows in telegram-mock-store.json yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {storeEntries.map((e) => {
              const nr = e.nursingRecord || {}
              const room = nr.room ? `Room ${nr.room}` : 'Room —'
              return (
                <li key={e.id || e.receivedAt} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm">
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    <span className="font-semibold text-slate-900">{room}</span>
                    {nr.patient ? <span className="text-slate-600">{nr.patient}</span> : null}
                    <Badge variant="teal">{nr.category || '—'}</Badge>
                    <Badge variant="info">{nr.workflowRiskLabel || nr.riskLevel || '—'}</Badge>
                  </div>
                  {nr.note ? <p className="mt-1 text-xs leading-relaxed text-slate-700">{String(nr.note).slice(0, 220)}</p> : null}
                  {e.replyText ? (
                    <p className="mt-2 font-mono text-[11px] leading-snug text-violet-900">{String(e.replyText).slice(0, 280)}</p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-slate-500">{e.receivedAt || ''}</p>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {result ? (
        <div className="space-y-4">
          <Card padding="p-4 sm:p-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Stethoscope className="h-5 w-5 text-teal-600" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-900">Parsed summary</h3>
            </div>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Patient condition</dt>
                <dd className="mt-1 font-medium leading-relaxed text-slate-900">{result.parsed.nursingNoteText}</dd>
                {result.parsed.patientRoom ? (
                  <p className="mt-1 text-xs text-slate-600">Room {result.parsed.patientRoom}</p>
                ) : null}
                {result.parsed.patientNameGuess ? (
                  <p className="mt-1 text-xs text-slate-600">Name cue: {result.parsed.patientNameGuess}</p>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Loop category</dt>
                <dd className="mt-2">
                  <Badge variant="teal">{result.parsed.loopCategoryLabel}</Badge>
                </dd>
                {result.parsed.riskKeywords?.length ? (
                  <p className="mt-2 text-xs text-slate-600">Risk keywords: {result.parsed.riskKeywords.join(', ')}</p>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI risk score</dt>
                <dd className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-slate-900">{result.analysis.overallScore}</span>
                  <span className="text-slate-600">/ 100</span>
                  {overallLevel ? <Badge variant={overallLevel.badge}>{overallLevel.label}</Badge> : null}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI recommendation</dt>
                <dd className="mt-1 leading-relaxed text-slate-800">{result.recommendedAction}</dd>
              </div>
            </dl>
          </Card>

          <Card padding="p-4 sm:p-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-900">Clinical actions &amp; escalation</h3>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detected risks</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-800">
                  {collectDetectedRisks(result).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested nurse action</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-800">{result.recommendedAction}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Doctor review required</span>
                  <Badge variant={doctorReview ? 'danger' : 'success'}>{doctorReview ? 'Yes' : 'No'}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 ${urgentEscalation ? 'text-red-600' : 'text-slate-400'}`} aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Urgent escalation</span>
                  <Badge variant={urgentEscalation ? 'danger' : 'default'}>{urgentEscalation ? 'Activated' : 'Not indicated'}</Badge>
                </div>
              </div>
            </div>
          </Card>

          <Card padding="p-4 sm:p-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Users className="h-5 w-5 text-sky-600" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-900">Family update suggestion</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-800">{buildFamilyUpdateSuggestion(result)}</p>
          </Card>

          <Card padding="p-4 sm:p-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <FlaskConical className="h-5 w-5 text-violet-600" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-900">Telegram reply preview</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">Same wording as the webhook sends in live mode (workflow risk labels).</p>
            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 font-mono text-sm leading-relaxed text-violet-950">
              {workflowReplyPreview}
            </div>
          </Card>
        </div>
      ) : (
        <Card padding="p-4 sm:p-5">
          <p className="text-sm text-slate-600">Enter a message or tap a sample scenario to see parsing and AI output.</p>
        </Card>
      )}
    </div>
  )
}
