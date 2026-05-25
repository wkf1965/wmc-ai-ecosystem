import { nursingFetch } from "./fetch"
import { getMockNursingDashboard } from "./mock-nursing-dashboard"
import type {
  NursingCommandCenterStatus,
  NursingDashboardSnapshot,
  NursingDashboardSummary,
  NursingEscalationQueueResponse,
  NursingPatientsResponse,
  NursingRecordsResponse,
  NursingTasksQueueResponse,
} from "./types"

export type FetchResult<T> = { ok: true; data: T } | { ok: false; error: string }

export { nursingFetch }

function aggregateSnapshot(
  fetchedAt: string,
  patients: FetchResult<NursingPatientsResponse>,
  records: FetchResult<NursingRecordsResponse>,
  summary: FetchResult<NursingDashboardSummary>,
  tasks: FetchResult<NursingTasksQueueResponse>,
  escalations: FetchResult<NursingEscalationQueueResponse>,
  commandCenter: FetchResult<NursingCommandCenterStatus>
): NursingDashboardSnapshot {
  const errors: string[] = []
  const note = (r: FetchResult<unknown>) => {
    if (!r.ok) errors.push(r.error)
  }
  note(patients)
  note(records)
  note(summary)
  note(tasks)
  note(escalations)
  note(commandCenter)

  const anyOk =
    patients.ok ||
    records.ok ||
    summary.ok ||
    tasks.ok ||
    escalations.ok ||
    commandCenter.ok

  if (!anyOk) {
    return getMockNursingDashboard(errors.join("; ") || "All nursing API calls failed")
  }

  const summaryData = summary.ok ? summary.data : null
  const patientsCount = patients.ok
    ? patients.data.patients.length
    : (summaryData?.totalPatients ?? 0)
  const recordsCount = records.ok ? records.data.records.length : 0
  const highRiskNames = summaryData?.highRiskPatients ?? []
  const pendingTasks =
    summaryData?.pendingTasks?.length ??
    (tasks.ok ? tasks.data.summary.totalTasks : 0)
  const urgentEscalations = escalations.ok
    ? escalations.data.summary.urgentCases
    : 0
  const facilityStatus = commandCenter.ok
    ? commandCenter.data.facilityStatus
    : (summaryData?.shiftStatus ?? "Unknown")
  const commandCenterStatus = commandCenter.ok
    ? commandCenter.data.facilityStatus
    : "Unknown"
  const shiftStatus = summaryData?.shiftStatus ?? "Unknown"
  const supervisorSystemStatus = escalations.ok
    ? escalations.data.systemStatus
    : "Unknown"

  return {
    online: true,
    usingMock: false,
    error: errors.length > 0 ? errors.join("; ") : null,
    fetchedAt,
    totalPatients: summaryData?.totalPatients ?? patientsCount,
    nursingRecordsCount: recordsCount,
    highRiskPatients: highRiskNames.length,
    highRiskPatientNames: highRiskNames,
    pendingTasks,
    urgentEscalations,
    facilityStatus,
    commandCenterStatus,
    shiftStatus,
    supervisorSystemStatus,
  }
}

/** Fetch core nursing dashboard endpoints in parallel */
export async function fetchNursingDashboard(): Promise<NursingDashboardSnapshot> {
  const fetchedAt = new Date().toISOString()

  const [patients, records, summary, tasks, escalations, commandCenter] =
    await Promise.all([
      nursingFetch<NursingPatientsResponse>("/patients"),
      nursingFetch<NursingRecordsResponse>("/nursing/records"),
      nursingFetch<NursingDashboardSummary>("/dashboard/summary"),
      nursingFetch<NursingTasksQueueResponse>("/tasks/queue"),
      nursingFetch<NursingEscalationQueueResponse>("/supervisor/escalation-queue"),
      nursingFetch<NursingCommandCenterStatus>("/command-center/status"),
    ])

  return aggregateSnapshot(
    fetchedAt,
    patients,
    records,
    summary,
    tasks,
    escalations,
    commandCenter
  )
}
