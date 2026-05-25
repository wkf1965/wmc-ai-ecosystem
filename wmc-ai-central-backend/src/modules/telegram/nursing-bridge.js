const NURSING_API_URL = (process.env.NURSING_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const NURSING_API_PREFIX = process.env.NURSING_API_PREFIX ?? '/api/v1'
const NURSING_API_TOKEN = process.env.NURSING_API_TOKEN ?? 'demo-token'
const FETCH_TIMEOUT_MS = 8000

function nursingUrl(path) {
  const segment = path.startsWith('/') ? path : `/${path}`
  return `${NURSING_API_URL}${NURSING_API_PREFIX}${segment}`
}

async function nursingFetch(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const headers = { Accept: 'application/json' }
    if (NURSING_API_TOKEN) {
      headers.Authorization = `Bearer ${NURSING_API_TOKEN}`
    }
    const res = await fetch(nursingUrl(path), { headers, signal: controller.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const MOCK = {
  handover: {
    shift: 'Day → Evening',
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
    overallShiftStatus: 'Attention Required',
    handoverSummary:
      'Shift transition requires focused follow-up on vitals, turning, and family communications.',
    highRiskPatients: [{ patientName: 'Ah Chong', issues: ['Low SpO2', 'Pending turning'] }],
    pendingTasks: ['Side turning pending for Ah Chong', 'Wound photo missing for Ah Chong'],
    criticalAlerts: ['Low oxygen detected for Ah Chong'],
    recommendations: ['Prioritize high-risk bedside checks'],
    preparedByAI: true,
  },
  tasks: {
    tasks: [
      {
        priority: 'Urgent',
        patientName: 'Ah Chong',
        task: 'Notify doctor about low oxygen',
        dueTime: 'Immediate',
        source: 'Doctor Escalation',
      },
      {
        priority: 'High',
        patientName: 'Ah Chong',
        task: 'Complete side turning',
        dueTime: '12:00',
        source: 'Pressure Ulcer Risk',
      },
    ],
    summary: { urgentTasks: 1, highPriorityTasks: 1, mediumPriorityTasks: 0, totalTasks: 2 },
  },
  dashboardSummary: {
    totalPatients: 3,
    highRiskPatients: ['Ah Chong'],
    pendingTasks: ['Side turning pending for Ah Chong', 'Medication review needed'],
    alerts: {
      fallRisk: 1,
      pressureUlcerRisk: 1,
      vitalAlerts: 1,
      woundAlerts: 1,
      medicationAlerts: 1,
      doctorEscalations: 1,
    },
    shiftStatus: 'Attention Required',
  },
  escalationQueue: {
    queue: [
      {
        priority: 'Urgent',
        patientName: 'Ah Chong',
        issue: 'Low oxygen detected',
        source: 'Doctor Escalation',
        recommendedAction: 'Notify on-call physician immediately',
      },
    ],
    summary: { urgentCases: 1, highRiskCases: 0, mediumRiskCases: 0, totalQueueItems: 1 },
    systemStatus: 'Attention Required',
  },
  nightShift: {
    nightShiftSummary: {
      highRiskPatients: ['Ah Chong', 'Mdm Lee'],
      pendingTasks: ['Complete side turning for Ah Chong', 'Recheck oxygen for Mdm Lee'],
      criticalAlerts: ['Low oxygen detected for Ah Chong', 'Bed exit attempt detected'],
      unacknowledgedAlerts: 2,
      doctorEscalations: 1,
    },
    recommendations: ['Increase supervision for high-risk patients', 'Prioritize oxygen monitoring'],
    systemStatus: 'Critical',
  },
  predictiveRisk: {
    overallPrediction:
      'Elevated clinical risk — prioritize vitals and turning compliance in the next 4 hours.',
    highConcernAreas: ['Hypoxia trend (Ah Chong)', 'Pressure injury risk (Mdm Lee)'],
    preventiveRecommendations: [
      'Increase SpO2 checks q30min',
      'Complete side turning before 02:00',
    ],
  },
  patientAhChong: {
    patientName: 'Ah Chong',
    riskLevel: 'High',
    latestVitals: { oxygen: '91%', bloodPressure: '148/92', pulse: 98, temperature: '37.8°C' },
    openAlerts: ['Low oxygen detected', 'Side turning pending'],
    pendingTasks: ['Complete side turning', 'Notify doctor about low oxygen'],
    lastUpdated: new Date().toISOString(),
  },
}

async function getHandover() {
  return (await nursingFetch('/handover/auto-generate')) ?? MOCK.handover
}

async function getTasks() {
  return (await nursingFetch('/tasks/queue')) ?? MOCK.tasks
}

async function getDashboardSummary() {
  return (await nursingFetch('/dashboard/summary')) ?? MOCK.dashboardSummary
}

async function getEscalationQueue() {
  return (await nursingFetch('/supervisor/escalation-queue')) ?? MOCK.escalationQueue
}

async function getNightShift() {
  return (await nursingFetch('/night-shift/monitor')) ?? MOCK.nightShift
}

async function getPredictiveRisk() {
  const live = await nursingFetch('/analytics/predictive-risk')
  if (live) return live
  return MOCK.predictiveRisk
}

module.exports = {
  MOCK,
  getHandover,
  getTasks,
  getDashboardSummary,
  getEscalationQueue,
  getNightShift,
  getPredictiveRisk,
}
