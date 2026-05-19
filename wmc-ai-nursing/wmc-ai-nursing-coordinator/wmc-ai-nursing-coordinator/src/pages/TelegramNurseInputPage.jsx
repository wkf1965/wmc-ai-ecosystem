import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrainCircuit, MessageSquare, Send, Sparkles } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import { scoreToLevel } from '../lib/aiRiskDetection.js'
import {
  TELEGRAM_ENV,
  runTelegramIntegrationFromLocalState,
} from '../lib/telegramNurseIntegration.js'
import { loopCategoryLabel } from '../lib/telegramNurseParser.js'
import {
  appendTelegramInboundRecord,
  getTelegramExampleMessages,
  getTelegramInboundLog,
} from '../db/telegramIntegrationStorage.js'

const btnPrimary =
  'min-h-[44px] touch-manipulation rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 active:scale-[0.98] disabled:opacity-45'

export default function TelegramNurseInputPage() {
  const { patients } = usePatients()
  const { notes, addNote, refresh } = useNursingNotes()
  const [input, setInput] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [log, setLog] = useState(() => getTelegramInboundLog())
  const [serverInbound, setServerInbound] = useState([])
  const examples = useMemo(() => getTelegramExampleMessages(), [])

  useEffect(() => {
    function onUpd() {
      setLog(getTelegramInboundLog())
    }
    window.addEventListener('wmc-telegram-nurse-integration-updated', onUpd)
    return () => window.removeEventListener('wmc-telegram-nurse-integration-updated', onUpd)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const r = await fetch('/api/integrations/telegram/sim-inbound')
        if (!r.ok) return
        const j = await r.json()
        if (!cancelled && j.items) setServerInbound(j.items)
      } catch {
        /* dev server only */
      }
    }
    poll()
    const id = window.setInterval(poll, 12_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 3400)
  }

  async function runSimulation(persist) {
    const text = input.trim()
    if (!text) {
      showToast('Paste a Telegram-style message first.', 'warn')
      return
    }
    setBusy(true)
    try {
      const integration = runTelegramIntegrationFromLocalState(text, patients, notes)
      setResult(integration)

      if (persist) {
        if (!integration.nursingPayload || !integration.patientId) {
          showToast('Patient not found — note not saved. Add the resident to the roster or fix room/name.', 'warn')
          return
        }
        const created = await addNote(integration.nursingPayload)
        appendTelegramInboundRecord({
          rawText: text,
          parsed: integration.parsed,
          patientId: integration.patientId,
          noteId: created?.id,
          overallScore: integration.analysis?.overallScore,
          suggestedLoop: integration.parsed.suggestedLoopCategory,
        })
        refresh()
        showToast('Saved nursing note + logged for AI Brain (notes context).', 'success')
      }
    } catch (e) {
      showToast(String(e?.message || e), 'warn')
    } finally {
      setBusy(false)
    }
  }

  const previewScore =
    result?.analysis?.overallScore != null ? Number(result.analysis.overallScore) : NaN
  const previewLevel = Number.isFinite(previewScore) ? scoreToLevel(previewScore) : null

  return (
    <div className="mx-auto max-w-[960px] pb-10">
      <PageHeader
        title="Telegram Nurse Input"
        description="Simulation workflow: parse quick Telegram-style texts into structured cues, AI risk, and nursing notes. Webhook available on dev server only."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">TELEGRAM_MODE: {TELEGRAM_ENV.mode}</Badge>
            <Link
              to="/ai-brain"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <BrainCircuit className="h-4 w-4" aria-hidden />
              AI Brain
            </Link>
          </div>
        }
      />

      {toast ? (
        <div
          role="status"
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
            toast.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          {toast.msg}
        </div>
      ) : null}

      <Card className="mb-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
          <Send className="h-5 w-5 text-teal-600" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Test panel</h2>
        </div>
        <label className="mt-3 block text-xs font-semibold text-slate-600">
          Paste Telegram nurse message
          <textarea
            className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-inner"
            placeholder='e.g. Room 302A: Patient refused lunch, confused, weak mobility'
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={`${btnPrimary} bg-slate-700 hover:bg-slate-800`} disabled={busy} onClick={() => runSimulation(false)}>
            Preview only (no save)
          </button>
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => runSimulation(true)}>
            Simulate Telegram Input
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Env (see <code className="rounded bg-slate-100 px-1">.env.example</code>): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_MODE · Client hints use{' '}
          <code className="rounded bg-slate-100 px-1">VITE_*</code> mirror vars.
        </p>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick examples</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-[11px] font-medium text-slate-800 hover:bg-teal-50"
                onClick={() => setInput(ex)}
              >
                {ex.length > 52 ? `${ex.slice(0, 52)}…` : ex}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {result ? (
        <div className="space-y-4">
          <Card padding="p-4 sm:p-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Sparkles className="h-5 w-5 text-violet-600" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-900">Parsed result</h3>
            </div>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between gap-2 border-b border-slate-50 py-1">
                <dt className="text-slate-500">Patient room</dt>
                <dd className="font-medium text-slate-900">{result.parsed.patientRoom || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-50 py-1">
                <dt className="text-slate-500">Patient name (guess)</dt>
                <dd className="font-medium text-slate-900">{result.parsed.patientNameGuess || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-50 py-1">
                <dt className="text-slate-500">Resolved roster</dt>
                <dd className="font-medium text-slate-900">
                  {result.patientId ? `${result.patientNameResolved} (${result.patientId})` : 'Not matched'}
                </dd>
              </div>
              <div className="border-b border-slate-50 py-1">
                <dt className="text-slate-500">Nursing note body</dt>
                <dd className="mt-1 text-slate-800">{result.parsed.nursingNoteText}</dd>
              </div>
              <div className="flex flex-wrap gap-1 py-1">
                <dt className="w-full text-slate-500">Risk keywords</dt>
                {result.parsed.riskKeywords.length ? (
                  result.parsed.riskKeywords.map((k) => (
                    <Badge key={k} variant="warning">
                      {k}
                    </Badge>
                  ))
                ) : (
                  <span className="text-slate-600">—</span>
                )}
              </div>
              <div className="flex justify-between gap-2 py-1">
                <dt className="text-slate-500">Suggested loop</dt>
                <dd>
                  <Badge variant="teal">{loopCategoryLabel(result.parsed.suggestedLoopCategory)}</Badge>
                </dd>
              </div>
            </dl>
          </Card>

          <Card padding="p-4 sm:p-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <MessageSquare className="h-5 w-5 text-teal-600" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-900">AI nursing note draft</h3>
            </div>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-800">
              {result.aiNursingNoteDraft}
            </pre>
          </Card>

          <Card padding="p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-900">AI risk detection</h3>
            {previewLevel ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={previewLevel.badge}>Overall {previewLevel.label}</Badge>
                <span className="text-sm text-slate-600">Score {result.analysis.overallScore}/100</span>
              </div>
            ) : null}
            <ul className="mt-3 space-y-2">
              {(result.analysis.categories || []).map((c) => (
                <li key={c.id} className="rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2 text-xs">
                  <span className="font-semibold text-slate-900">{c.label}</span>{' '}
                  <span className="text-slate-600">
                    {c.score} pts · {c.levelLabel}
                  </span>
                  {c.signals?.length ? (
                    <p className="mt-1 text-slate-600">{c.signals.join('; ')}</p>
                  ) : null}
                </li>
              ))}
              {!result.analysis.categories?.length ? (
                <li className="text-sm text-slate-600">
                  {result.patientId ? 'No category breakdown on preview.' : 'Match a demo room (e.g. Room 3 → p3) for full category scoring.'}
                </li>
              ) : null}
            </ul>
          </Card>

          <Card padding="p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-900">Recommended action</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-800">{result.recommendedAction}</p>
          </Card>
        </div>
      ) : null}

      <Card className="mt-6" padding="p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-slate-900">Incoming sample log (browser)</h3>
        <p className="mt-1 text-xs text-slate-500">Messages saved via “Simulate Telegram Input”</p>
        <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-xs">
          {log.length === 0 ? (
            <li className="text-slate-600">No entries yet.</li>
          ) : (
            log.map((e, i) => (
              <li key={i} className="rounded-lg border border-slate-100 px-2 py-2 text-slate-700">
                <span className="font-semibold text-slate-900">{e.at}</span> · Score {e.overallScore ?? '—'} ·{' '}
                {e.parsed?.patientRoom ? `Rm ${e.parsed.patientRoom}` : '—'} · {e.suggestedLoop ?? '—'}
              </li>
            ))
          )}
        </ul>
      </Card>

      <Card className="mt-4" padding="p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-slate-900">Dev webhook queue (server memory)</h3>
        <p className="mt-1 text-xs text-slate-500">
          POST JSON to{' '}
          <code className="rounded bg-slate-100 px-1">/api/integrations/telegram/webhook</code> — does not write browser storage.
        </p>
        <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto text-xs text-slate-700">
          {serverInbound.length === 0 ? (
            <li>No server POSTs yet (curl or Telegram test).</li>
          ) : (
            serverInbound.map((e, i) => (
              <li key={i} className="rounded-lg border border-slate-100 px-2 py-2">
                {e.receivedAt} · Room {e.parsed?.patientRoom ?? '—'} · {e.parsed?.suggestedLoopCategory}
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  )
}
