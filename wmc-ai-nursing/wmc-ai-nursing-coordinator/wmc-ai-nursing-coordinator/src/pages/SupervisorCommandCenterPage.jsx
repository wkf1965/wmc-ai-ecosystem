import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BedDouble, BellRing, Droplets, Loader2, Pill, RefreshCw, Send, ShieldCheck, Timer, Trash2, UserRoundCheck, ClipboardList } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import { aiAlerts } from '../data/dummyData'
import { analyzeAllPatientsFromNotes } from '../lib/aiRiskDetection.js'
import {
  DELETE_RECORDS_CONFIRM,
  DELETE_RECORDS_SUCCESS,
  RESET_PATIENTS_CONFIRM,
  RESET_PATIENTS_SUCCESS,
  deleteAllOldRecords,
  deletePatientRecords,
  fetchDashboard,
} from '../api/dashboardApi.js'

const AUTO_REFRESH_MS = 30_000

const actionDefaults = { resolved: false, doctorEscalated: false, familyNotified: false, nursingTaskCreated: false }
const SEVERITY_STEPS = { red: 85, orange: 55, green: 20 }

function severityFromScore(score = 0) {
  if (score >= SEVERITY_STEPS.red) return 'red'
  if (score >= SEVERITY_STEPS.orange) return 'orange'
  return 'green'
}

function severityClass(level) {
  if (level === 'red') return 'bg-red-100 text-red-700 border-red-200'
  if (level === 'orange') return 'bg-orange-100 text-orange-700 border-orange-200'
  return 'bg-emerald-100 text-emerald-700 border-emerald-200'
}

function buildMissedMedications(notes, resolvePatientName) {
  const rows = []
  for (const note of notes) {
    const text = `${note.nurseRemarks || ''} ${note.abnormalEvents || ''} ${note.appetite || ''}`.toLowerCase()
    if (!/(missed|not taken|refused|held dose|not administered|missed dose)/.test(text)) continue
    const name = resolvePatientName(note.patientId) || note.patientNameSnapshot || 'Unknown'
    rows.push({
      id: `${note.id}-missed`,
      patientId: note.patientId || 'unknown',
      patientName: name,
      noteDate: note.date,
      noteText: note.nurseRemarks || note.abnormalEvents || 'No note detail',
    })
  }
  return rows
}

function buildFollowUpQueue(criticalResidents) {
  return criticalResidents
    .filter((entry) => entry.patientName && entry.patientName !== 'Unknown')
    .map((entry) => {
      const topRisk = (entry.categories || []).find((category) => Number(category.score) >= 55)?.label || 'trend change'
      return {
        id: `${entry.patientId}-followup`,
        patientId: entry.patientId,
        patientName: entry.patientName,
        title: `Follow-up task for ${entry.patientName}`,
        details: `${topRisk} and transfer/safety recheck needed`,
        status: 'pending',
      }
    })
}

function buildRecommendations(criticalResidents, escalations) {
  const lines = []

  const hasCategory = (entry, keyword) => {
    const categories = entry.categories || []
    return categories.some((category) => category.label.toLowerCase().includes(keyword))
  }

  if (criticalResidents.length > 0) {
    lines.push(`Prioritize bedside reassessment for ${criticalResidents.length} high-risk residents before handoff completion.`)
  }
  if (escalations.length > 0) {
    lines.push(`Escalate ${escalations.length} unresolved alerts to provider pathway and document actions in handover notes.`)
  }
  if (criticalResidents.some((entry) => hasCategory(entry, 'dehydration'))) {
    lines.push('Initiate hydration and intake monitoring rounds every 2 hours for affected residents.')
  }
  if (criticalResidents.some((entry) => hasCategory(entry, 'fall'))) {
    lines.push('Apply assisted transfer protocol and call-light proximity checks for fall-risk residents.')
  }
  if (lines.length === 0) {
    lines.push('No urgent AI recommendation; maintain routine surveillance and review at next handover.')
  }
  return lines
}

export default function SupervisorCommandCenterPage() {
  const { patients, getById, refresh: refreshPatients } = usePatients()
  const { notes, refresh: refreshNotes } = useNursingNotes()
  const [alertActions, setAlertActions] = useState(() => {
    const base = {}
    for (const alert of aiAlerts) {
      base[alert.id] = { ...actionDefaults }
    }
    return base
  })
  const [followUpQueue, setFollowUpQueue] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [deletingPatients, setDeletingPatients] = useState(false)
  const [refreshFeedback, setRefreshFeedback] = useState(null)
  const [backendSnapshot, setBackendSnapshot] = useState(null)

  const resolvePatientName = (patientId) => {
    const patient = getById(patientId)
    return patient ? patient.fullName : ''
  }

  const patientAnalysis = useMemo(() => analyzeAllPatientsFromNotes(patients, notes, getById), [patients, notes, getById])
  const criticalResidents = useMemo(() => {
    return patientAnalysis
      .filter((entry) => severityFromScore(entry.overallScore) !== 'green')
      .filter((entry) => entry.patientName && entry.patientName !== 'Unknown')
      .sort((a, b) => b.overallScore - a.overallScore)
  }, [patientAnalysis])

  const fallRiskResidents = useMemo(() => {
    return patientAnalysis.filter((entry) =>
      (entry.categories || []).some((category) => category.label.toLowerCase().includes('fall risk')),
    )
  }, [patientAnalysis])

  const dehydrationResidents = useMemo(() => {
    return patientAnalysis.filter((entry) =>
      (entry.categories || []).some((category) => category.label.toLowerCase().includes('dehydration')),
    )
  }, [patientAnalysis])

  const missedMedications = useMemo(
    () => buildMissedMedications(notes, resolvePatientName),
    [notes, resolvePatientName], // intentionally stable via hook context updates
  )

  const escalatedAlerts = useMemo(() => {
    return aiAlerts.filter((alert) => {
      const action = alertActions[alert.id]
      if (action?.resolved) return false
      return alert.status !== 'resolved' || alert.severity === 'critical'
    })
  }, [alertActions])

  const severityCounts = useMemo(() => {
    return {
      red: criticalResidents.length,
      orange: criticalResidents.filter((entry) => severityFromScore(entry.overallScore) === 'orange').length,
      green: patientAnalysis.filter((entry) => severityFromScore(entry.overallScore) === 'green').length,
    }
  }, [criticalResidents, patientAnalysis])

  const recommendations = useMemo(() => {
    const local = buildRecommendations(criticalResidents, escalatedAlerts)
    const pendingTasks = backendSnapshot?.summary?.pendingTasks
    if (Array.isArray(pendingTasks) && pendingTasks.length > 0) {
      return [...new Set([...pendingTasks, ...local])]
    }
    return local
  }, [criticalResidents, escalatedAlerts, backendSnapshot])

  const backendModuleCards = useMemo(() => {
    const alertRollup = backendSnapshot?.summary?.alerts
    const alertTotal = alertRollup
      ? Object.values(alertRollup).reduce((sum, value) => sum + (Number(value) || 0), 0)
      : null

    return [
      {
        label: 'Nursing records',
        value: backendSnapshot ? (backendSnapshot.nursingRecords?.length ?? 0) : '—',
        sub: backendSnapshot ? 'Loaded from backend' : 'Click Refresh data',
        icon: ClipboardList,
        tone: 'green',
      },
      {
        label: 'Side turning',
        value: backendSnapshot ? (backendSnapshot.sideTurning?.length ?? 0) : '—',
        sub: backendSnapshot?.summary?.pendingTasks?.filter((t) => /side turning/i.test(t)).length
          ? `${backendSnapshot.summary.pendingTasks.filter((t) => /side turning/i.test(t)).length} pending`
          : backendSnapshot
            ? 'Records loaded'
            : 'Click Refresh data',
        icon: BedDouble,
        tone: 'orange',
      },
      {
        label: 'OT',
        value: backendSnapshot ? (backendSnapshot.ot?.recordCount ?? 0) : '—',
        sub: backendSnapshot
          ? `${backendSnapshot.ot?.totalOvertimeHours ?? 0}h OT · ${backendSnapshot.ot?.pendingApprovalCount ?? 0} pending`
          : 'Click Refresh data',
        icon: Timer,
        tone: 'orange',
      },
      {
        label: 'Alerts',
        value: backendSnapshot
          ? Math.max(backendSnapshot.alerts?.length ?? 0, alertTotal ?? 0)
          : '—',
        sub: backendSnapshot ? 'Nursing + rollup alerts' : 'Click Refresh data',
        icon: BellRing,
        tone: 'red',
      },
    ]
  }, [backendSnapshot])

  const dashboardCards = useMemo(() => {
    const summary = backendSnapshot?.summary
    const alertRollup = summary?.alerts
    const alertTotal = alertRollup
      ? Object.values(alertRollup).reduce((sum, value) => sum + (Number(value) || 0), 0)
      : escalatedAlerts.length

    return [
      ['Critical residents', summary?.highRiskPatients?.length ?? criticalResidents.length, AlertTriangle, 'red'],
      ['Escalated alerts', alertTotal, BellRing, 'orange'],
      ['Fall risk patients', alertRollup?.fallRisk ?? fallRiskResidents.length, UserRoundCheck, 'orange'],
      ['Dehydration risk', dehydrationResidents.length, Droplets, 'orange'],
      ['Missed medications', alertRollup?.medicationAlerts ?? missedMedications.length, Pill, 'red'],
      ['Nurse follow-up queue', followUpQueue.filter((item) => item.status !== 'done').length, ClipboardList, 'green'],
      ['AI recommendations', recommendations.length, ShieldCheck, 'green'],
    ]
  }, [
    backendSnapshot,
    criticalResidents.length,
    escalatedAlerts.length,
    fallRiskResidents.length,
    dehydrationResidents.length,
    missedMedications.length,
    followUpQueue,
    recommendations.length,
  ])

  const handleRefreshData = useCallback(async () => {
    setRefreshing(true)
    setRefreshFeedback(null)
    try {
      const response = await fetchDashboard()
      console.log('[AI Command Center] Dashboard API response:', response)
      setBackendSnapshot(response)
      setRefreshFeedback({
        type: 'success',
        message: `Data refreshed at ${new Date().toLocaleTimeString()}. Shift status: ${response.summary?.shiftStatus ?? 'unknown'}.`,
      })
    } catch (error) {
      const offline = error instanceof Error && error.name === 'BackendOfflineError'
      const message = offline ? 'Backend offline' : error instanceof Error ? error.message : 'Failed to refresh dashboard data.'
      console.error('[AI Command Center] Refresh data failed:', error)
      setRefreshFeedback({ type: 'error', message })
    } finally {
      setRefreshing(false)
    }
  }, [])

  const handleClearAllRecords = useCallback(async () => {
    if (!window.confirm(DELETE_RECORDS_CONFIRM)) return

    setClearing(true)
    setRefreshFeedback(null)
    try {
      await deleteAllOldRecords()
      refreshPatients()
      refreshNotes()
      setAlertActions(() => {
        const base = {}
        for (const alert of aiAlerts) {
          base[alert.id] = { ...actionDefaults }
        }
        return base
      })
      setFollowUpQueue([])
      await handleRefreshData()
      setRefreshFeedback({ type: 'success', message: DELETE_RECORDS_SUCCESS })
    } catch (error) {
      const offline = error instanceof Error && error.name === 'BackendOfflineError'
      const message = offline ? 'Backend offline' : error instanceof Error ? error.message : 'Failed to delete records.'
      console.error('[AI Command Center] Delete records failed:', error)
      setRefreshFeedback({ type: 'error', message })
    } finally {
      setClearing(false)
    }
  }, [handleRefreshData, refreshNotes, refreshPatients])

  const handleDeletePatientRecords = useCallback(async () => {
    if (!window.confirm(RESET_PATIENTS_CONFIRM)) return

    setDeletingPatients(true)
    setRefreshFeedback(null)
    try {
      await deletePatientRecords()
      refreshPatients()
      refreshNotes()
      setFollowUpQueue([])
      await handleRefreshData()
      setRefreshFeedback({ type: 'success', message: RESET_PATIENTS_SUCCESS })
    } catch (error) {
      const offline = error instanceof Error && error.name === 'BackendOfflineError'
      const message = offline ? 'Backend offline' : error instanceof Error ? error.message : 'Failed to delete patient records.'
      console.error('[AI Command Center] Delete patient records failed:', error)
      setRefreshFeedback({ type: 'error', message })
    } finally {
      setDeletingPatients(false)
    }
  }, [handleRefreshData, refreshNotes, refreshPatients])

  useEffect(() => {
    void handleRefreshData()
    const intervalId = window.setInterval(() => {
      void handleRefreshData()
    }, AUTO_REFRESH_MS)
    return () => window.clearInterval(intervalId)
  }, [handleRefreshData])

  useEffect(() => {
    setFollowUpQueue((current) => {
      const existing = new Map(current.map((item) => [item.id, item]))
      return buildFollowUpQueue(criticalResidents).map((item) => ({
        ...item,
        status: existing.get(item.id)?.status || item.status,
      }))
    })
  }, [criticalResidents])

  function setAction(id, patch) {
    setAlertActions((current) => ({
      ...current,
      [id]: {
        ...(current[id] || actionDefaults),
        ...patch,
      },
    }))
  }

  function updateFollowUp(id, status) {
    setFollowUpQueue((current) => current.map((item) => (item.id === id ? { ...item, status } : item)))
  }

  function makeAlertSummaryText() {
    const summaryLines = [
      `AI Supervisor Command Center Snapshot (${new Date().toLocaleString()})`,
      `Critical residents: ${criticalResidents.length}`,
      `Escalated alerts: ${escalatedAlerts.length}`,
      `Fall risk: ${fallRiskResidents.length}`,
      `Dehydration risk: ${dehydrationResidents.length}`,
      `Missed medication events: ${missedMedications.length}`,
      '',
      'Priority actions:',
      ...followUpQueue
        .filter((item) => item.status !== 'done')
        .map((item) => `- ${item.title}: ${item.details}`),
    ]
    return summaryLines.join('\n')
  }

  return (
    <div>
      <PageHeader
        title="AI Supervisor Command Center"
        description="Review critical residents, escalation queue, and nursing tasks before approving handoff actions."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRefreshData}
              disabled={refreshing || clearing || deletingPatients}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              {refreshing ? 'Refreshing...' : 'Refresh data'}
            </button>
            <button
              type="button"
              onClick={handleClearAllRecords}
              disabled={refreshing || clearing || deletingPatients}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {clearing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden />
              )}
              {clearing ? 'Clearing...' : 'Clear All Records'}
            </button>
            <button
              type="button"
              onClick={handleDeletePatientRecords}
              disabled={refreshing || clearing || deletingPatients}
              className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingPatients ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden />
              )}
              {deletingPatients ? 'Deleting...' : 'Delete Patient Records'}
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={() => {
                navigator.clipboard.writeText(makeAlertSummaryText())
              }}
            >
              Copy summary
            </button>
          </div>
        }
      />

      <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 ring-1 ring-amber-100">
        <p>
          <strong>Local mode:</strong> Action buttons update local records and do not send live notifications.
        </p>
      </section>

      {refreshFeedback ? (
        <section
          role="status"
          className={`mb-4 rounded-2xl border p-3 text-sm ${
            refreshFeedback.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {refreshFeedback.message}
        </section>
      ) : null}

      <section className="mb-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Backend live data</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {backendModuleCards.map(({ label, value, sub, icon: Icon, tone }) => (
            <Card key={label} padding="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityClass(tone)}`}>{tone}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Icon className="h-5 w-5 text-slate-500" aria-hidden />
                <p className="text-2xl font-bold text-slate-900">{value}</p>
              </div>
              <p className="mt-1 text-xs text-slate-500">{sub}</p>
            </Card>
          ))}
        </div>
        {backendSnapshot?.fetchedAt ? (
          <p className="mt-2 text-xs text-slate-500">Last synced: {new Date(backendSnapshot.fetchedAt).toLocaleString()} · auto-refresh every 30s</p>
        ) : null}
      </section>

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboardCards.map(([label, count, Icon, tone]) => (
          <Card key={String(label)} padding="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-500">{label}</p>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityClass(tone)}`}>{tone}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Icon className="h-5 w-5 text-slate-500" aria-hidden />
              <p className="text-2xl font-bold text-slate-900">{count}</p>
            </div>
            {label === 'Critical residents' ? (
              <p className="mt-1 text-xs text-slate-500">Red {severityCounts.red}, Orange {severityCounts.orange}, Green {severityCounts.green}</p>
            ) : null}
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <h2 className="text-lg font-semibold text-slate-900">Critical residents</h2>
          <div className="mt-4 space-y-3">
            {criticalResidents.length === 0 ? <p className="text-sm text-slate-600">No residents currently in critical threshold.</p> : null}
            {criticalResidents.map((entry) => {
              const severity = severityFromScore(entry.overallScore)
              return (
                <div key={entry.patientId} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{entry.patientName}</p>
                      <p className="text-xs text-slate-600">
                        Risk score: {entry.overallScore} · Last note: {entry.lastNoteDate || 'No recent note'}
                      </p>
                    </div>
                    <Badge className={severityClass(severity)}>{severity.toUpperCase()}</Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-slate-900">AI recommendations</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {recommendations.map((item) => (
              <li key={item} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Escalated alerts</h2>
          <div className="mt-4 space-y-3">
            {escalatedAlerts.length === 0 ? <p className="text-sm text-slate-600">No escalated alerts.</p> : null}
            {escalatedAlerts.map((alert) => {
              const state = alertActions[alert.id] || actionDefaults
              const level =
                alert.severity === 'critical'
                  ? 'red'
                  : alert.severity === 'high'
                    ? 'orange'
                    : alert.severity === 'medium'
                      ? 'orange'
                      : 'green'
              return (
                <div key={alert.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
                      <p className="text-xs text-slate-600">{alert.patientName}</p>
                      <p className="mt-1 text-sm text-slate-700">{alert.description}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityClass(level)}`}>
                      {alert.severity}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setAction(alert.id, { resolved: true })}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      Resolve alert
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction(alert.id, { doctorEscalated: true })}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                    >
                      Escalate to doctor
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction(alert.id, { familyNotified: true })}
                      className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-800 hover:bg-purple-100"
                    >
                      Notify family
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction(alert.id, { nursingTaskCreated: true })}
                      className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                    >
                      Create nursing task
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {state.resolved ? <Badge variant="success">resolved</Badge> : <Badge>open</Badge>}
                    {state.doctorEscalated ? <Badge variant="warning">doctor alerted</Badge> : null}
                    {state.familyNotified ? <Badge variant="info">family notified</Badge> : null}
                    {state.nursingTaskCreated ? <Badge variant="default">task created</Badge> : null}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Nurse follow-up queue</h2>
          <div className="mt-4 space-y-2">
            {followUpQueue.length === 0 ? <p className="text-sm text-slate-600">No follow-up tasks assigned.</p> : null}
            {followUpQueue.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-600">{item.details}</p>
                  </div>
                  <span className="rounded-full border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700">
                    {item.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateFollowUp(item.id, 'in_progress')}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                  >
                    Start task
                  </button>
                  <button
                    type="button"
                    onClick={() => updateFollowUp(item.id, 'done')}
                    className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                  >
                    Mark complete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Rehabilitation-related risk watch</h2>
          <div className="mt-4 space-y-2">
            {dehydrationResidents.length === 0 && fallRiskResidents.length === 0 ? (
              <p className="text-sm text-slate-600">No immediate rehab-linked risk flags in this cycle.</p>
            ) : null}
            {[...fallRiskResidents, ...dehydrationResidents]
              .filter((item, index, all) => all.findIndex((entry) => entry.patientId === item.patientId) === index)
              .map((item) => (
                <p key={item.patientId} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-900">{item.patientName}</span> — risk profile review at handover transfer.
                </p>
              ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Missed medications</h2>
          <div className="mt-4 space-y-2">
            {missedMedications.length === 0 ? <p className="text-sm text-slate-600">No missed-medication events detected.</p> : null}
            {missedMedications.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                <p className="font-semibold text-slate-900">{item.patientName}</p>
                <p className="text-xs text-slate-600">
                  {item.noteDate} · {item.noteText}
                </p>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      window.alert(`Create medication follow-up for ${item.patientName} in local mode.`)
                    }}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    Create nursing task
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">AI Supervisor summary panel</h2>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => {
              navigator.clipboard.writeText(makeAlertSummaryText())
            }}
          >
            <Send className="h-4 w-4" aria-hidden />
            Copy summary
          </button>
        </div>
        <pre className="mt-3 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {makeAlertSummaryText()}
        </pre>
      </Card>
    </div>
  )
}
