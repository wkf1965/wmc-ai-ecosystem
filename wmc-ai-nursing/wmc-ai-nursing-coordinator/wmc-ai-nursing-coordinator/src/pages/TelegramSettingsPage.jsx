import { useEffect, useState } from 'react'
import { Bot, ClipboardCheck, FlaskConical, Link2, RefreshCw, Send } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'

async function fetchTelegramSettingsPanels() {
  const [cRes, lRes] = await Promise.all([
    fetch('/api/integrations/telegram/config'),
    fetch('/api/integrations/telegram/last'),
  ])
  return {
    cJson: await cRes.json().catch(() => ({})),
    lJson: await lRes.json().catch(() => ({})),
  }
}

/** Reference ngrok URL — set TELEGRAM_WEBHOOK_URL in `.env` to your active tunnel + this path. */
const EXPECTED_WEBHOOK_URL =
  'https://satirical-hurled-sincerity.ngrok-free.dev/api/integrations/telegram/webhook'

const SAMPLE_UPDATE = {
  update_id: 100001,
  message: {
    message_id: 42,
    date: Math.floor(Date.now() / 1000),
    chat: { id: 999001, type: 'private' },
    from: { id: 501, username: 'demo_nurse', first_name: 'Demo' },
    text: 'Room 12: Patient confused, refused lunch, weak mobility',
  },
}

const btnOutline =
  'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50'

export default function TelegramSettingsPage() {
  const [config, setConfig] = useState(null)
  const [last, setLast] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [webhookInfo, setWebhookInfo] = useState(null)
  const [testChatId, setTestChatId] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { cJson, lJson } = await fetchTelegramSettingsPanels()
        if (cancelled) return
        if (cJson.ok) setConfig(cJson)
        if (lJson.ok) setLast(lJson.last || null)
      } catch {
        if (cancelled) return
        setToast('Could not reach dev webhook APIs (is Vite running?)')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function loadState() {
    try {
      const { cJson, lJson } = await fetchTelegramSettingsPanels()
      if (cJson.ok) setConfig(cJson)
      if (lJson.ok) setLast(lJson.last || null)
    } catch {
      setToast('Could not reach dev webhook APIs (is Vite running?)')
    }
  }

  async function runTestWebhook() {
    setBusy(true)
    setToast(null)
    try {
      const res = await fetch('/api/integrations/telegram/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(SAMPLE_UPDATE),
      })
      const json = await res.json().catch(() => ({}))
      if (!json.ok) {
        setToast(json.error || `Webhook error (${res.status})`)
      } else {
        setToast(json.telegramSent ? 'Test processed — Telegram reply sent.' : 'Test processed (simulation — no Telegram send).')
      }
      await loadState()
    } catch (e) {
      setToast(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function callSetWebhook() {
    setBusy(true)
    setToast(null)
    try {
      const res = await fetch('/api/integrations/telegram/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json().catch(() => ({}))
      if (!json.ok) setToast(json.error || `Set webhook failed (${res.status})`)
      else setToast(`Telegram webhook registered: ${json.urlUsed}`)
      await loadState()
    } catch (e) {
      setToast(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function callWebhookInfo() {
    setBusy(true)
    setToast(null)
    try {
      const res = await fetch('/api/integrations/telegram/webhook-info')
      const json = await res.json().catch(() => ({}))
      if (!json.ok) {
        setWebhookInfo(null)
        setToast(json.error || `Webhook info failed (${res.status})`)
      } else {
        setWebhookInfo(json.info)
        setToast('Webhook status loaded from Telegram.')
      }
    } catch (e) {
      setWebhookInfo(null)
      setToast(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function callSendTestReply() {
    setBusy(true)
    setToast(null)
    try {
      const payload = {}
      if (testChatId.trim()) payload.chat_id = testChatId.trim()
      const res = await fetch('/api/integrations/telegram/send-test-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!json.ok) setToast(json.error || `Send failed (${res.status})`)
      else setToast(`Test reply sent to chat ${json.chat_id}.`)
    } catch (e) {
      setToast(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const mode = config?.mode ?? '…'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Telegram nurse bot"
        description="Configure BotFather token and ngrok HTTPS URL in .env. Use buttons below to register the webhook with Telegram, verify status, and send a test DM. Incoming messages are parsed, scored, saved to the local mock store, and replied when TELEGRAM_MODE is live or production."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => loadState()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={runTestWebhook}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60"
            >
              <FlaskConical className="h-4 w-4" aria-hidden />
              Test webhook (local POST)
            </button>
          </div>
        }
      />

      {toast ? (
        <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{toast}</p>
      ) : null}

      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Bot className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900">Environment (.env)</h3>
              <Badge variant={mode === 'simulation' ? 'warning' : 'success'}>{mode}</Badge>
              {config?.botTokenConfigured ? (
                <Badge variant="teal">TELEGRAM_BOT_TOKEN set</Badge>
              ) : (
                <Badge variant="default">No bot token</Badge>
              )}
              {config?.chatIdConfigured ? (
                <Badge variant="info">TELEGRAM_CHAT_ID set</Badge>
              ) : (
                <Badge variant="default">No chat id</Badge>
              )}
            </div>
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
              <li>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">TELEGRAM_BOT_TOKEN</code> — BotFather token (server reads from{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.env</code>; restart dev server after edits).
              </li>
              <li>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">TELEGRAM_WEBHOOK_URL</code> — full public HTTPS URL below (ngrok → Vite).
              </li>
              <li>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">TELEGRAM_CHAT_ID</code> — optional default for “Send test reply”.
              </li>
              <li>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">TELEGRAM_MODE</code>:{' '}
                <strong>simulation</strong> (default) = parse + mock store, no auto-reply;{' '}
                <strong>live</strong> or <strong>production</strong> = also <code className="rounded bg-slate-100 px-1 text-[11px]">sendMessage</code>{' '}
                on each inbound webhook.
              </li>
            </ul>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Target webhook URL</p>
              <p className="mt-1 font-mono text-xs break-all text-slate-900">{EXPECTED_WEBHOOK_URL}</p>
              <p className="mt-2 text-xs text-slate-600">
                Set <code className="rounded bg-white px-1">TELEGRAM_WEBHOOK_URL</code> to this value (or your current ngrok host + the same path).{' '}
                {config?.webhookUrl ? (
                  <>
                    Loaded from env:{' '}
                    <span className="font-mono text-slate-800">{config.webhookUrl}</span>
                  </>
                ) : (
                  <span className="text-amber-800">Env webhook URL is empty.</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-900">Telegram API setup</h3>
        <p className="mt-1 text-sm text-slate-600">
          Calls Telegram&apos;s <code className="rounded bg-slate-100 px-1 text-xs">setWebhook</code>,{' '}
          <code className="rounded bg-slate-100 px-1 text-xs">getWebhookInfo</code>, and{' '}
          <code className="rounded bg-slate-100 px-1 text-xs">sendMessage</code> using <strong>TELEGRAM_BOT_TOKEN</strong> from{' '}
          <code className="rounded bg-slate-100 px-1 text-xs">.env</code>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} className={btnOutline} onClick={callSetWebhook}>
            <Link2 className="h-4 w-4 shrink-0 text-teal-700" aria-hidden />
            Set Telegram Webhook
          </button>
          <button type="button" disabled={busy} className={btnOutline} onClick={callWebhookInfo}>
            <ClipboardCheck className="h-4 w-4 shrink-0 text-teal-700" aria-hidden />
            Check Webhook Status
          </button>
          <button type="button" disabled={busy} className={btnOutline} onClick={callSendTestReply}>
            <Send className="h-4 w-4 shrink-0 text-teal-700" aria-hidden />
            Send Test Reply
          </button>
        </div>
        <label className="mt-4 block text-xs font-semibold text-slate-600">
          Override chat id for test reply (optional if TELEGRAM_CHAT_ID is set)
          <input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 123456789"
            value={testChatId}
            onChange={(e) => setTestChatId(e.target.value)}
            className="mt-1 w-full max-w-xs rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-inner"
          />
        </label>
        {webhookInfo ? (
          <div className="mt-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">getWebhookInfo</p>
            <pre className="max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-emerald-100">
              {JSON.stringify(webhookInfo, null, 2)}
            </pre>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Send className="h-5 w-5 text-slate-600" aria-hidden />
          <h3 className="text-base font-semibold text-slate-900">Last webhook payload (mock store)</h3>
        </div>
        {!last ? (
          <p className="text-sm text-slate-500">No entries yet — message the bot or run Test webhook (local POST).</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Extracted fields</p>
              <pre className="max-h-48 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-emerald-100">
                {JSON.stringify(last.extracted, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Raw Telegram update (stored)</p>
              <pre className="max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-sky-100">
                {JSON.stringify(last.rawTelegramPayload, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Nursing record</p>
              <pre className="max-h-56 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-amber-100">
                {JSON.stringify(last.nursingRecord, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">AI brain snapshot</p>
              <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-violet-100">
                {JSON.stringify(last.brainSignals, null, 2)}
              </pre>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reply text</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{last.replyText}</p>
              <p className="mt-2 text-xs text-slate-600">
                Telegram send:{' '}
                <span className="font-medium">{last.telegramSent ? 'yes' : 'no'}</span>
                {last.telegramError ? (
                  <>
                    {' '}
                    — <span className="text-red-700">{last.telegramError}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
