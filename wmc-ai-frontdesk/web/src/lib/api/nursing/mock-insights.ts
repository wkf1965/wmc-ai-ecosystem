import type {
  DailyFacilityReportResponse,
  FamilyCommunicationQueueResponse,
  HandoverAutoGenerateResponse,
  NightShiftMonitorResponse,
  PredictiveRiskResponse,
} from "./insights-types"

export function mockPredictiveRisk(): PredictiveRiskResponse {
  return {
    overallPrediction:
      "Elevated clinical risk across 2 monitored patients — prioritize vitals and turning compliance in the next 4 hours.",
    highConcernAreas: [
      "Hypoxia trend (Ah Chong)",
      "Pressure injury risk (Mdm Lee)",
      "Pending wound photography",
    ],
    preventiveRecommendations: [
      "Increase SpO2 checks to q30min for high-risk patients",
      "Complete side turning before 02:00",
      "Escalate abnormal vitals to on-call physician",
    ],
    generatedAt: new Date().toISOString(),
  }
}

export function mockNightShiftMonitor(): NightShiftMonitorResponse {
  return {
    nightShiftSummary: {
      highRiskPatients: ["Ah Chong", "Mdm Lee"],
      pendingTasks: [
        "Complete side turning for Ah Chong",
        "Recheck oxygen for Mdm Lee",
      ],
      criticalAlerts: [
        "Low oxygen detected for Ah Chong",
        "Bed exit attempt detected",
      ],
      unacknowledgedAlerts: 2,
      doctorEscalations: 1,
    },
    recommendations: [
      "Increase supervision for high-risk patients",
      "Prioritize oxygen monitoring",
      "Complete all pending side turning before 02:00",
    ],
    systemStatus: "Critical",
  }
}

export function mockDailyFacilityReport(): DailyFacilityReportResponse {
  return {
    reportDate: new Date().toISOString().slice(0, 10),
    facilityStatus: "Attention Required",
    executiveSummary:
      "Facility operating with elevated acuity. One emergency pathway active; nursing OT slightly above plan.",
    shiftHandoverStatus: "Attention Required",
    keyMetrics: {
      totalPatients: 58,
      highRiskPatients: 6,
      emergencyCases: 1,
      doctorEscalations: 3,
      incidentReports: 2,
      pendingTasks: 18,
      medicationAlerts: 2,
      woundCases: 4,
      totalOTHours: 42.5,
    },
    riskHighlights: ["Fall risk cluster on Ward B", "Two open wound escalations"],
    staffHighlights: ["Night shift coverage complete", "3 nurses on extended OT"],
    familyCommunicationSummary: ["1 urgent family touchpoint pending"],
    managementRecommendations: [
      "Review escalation queue with medical lead",
      "Confirm OT approvals for weekend shift",
    ],
  }
}

export function mockAutoHandover(): HandoverAutoGenerateResponse {
  return {
    shift: "Day → Evening",
    generatedAt: new Date().toISOString().replace("T", " ").slice(0, 16),
    overallShiftStatus: "Attention Required",
    handoverSummary:
      "Shift transition requires focused follow-up on vitals, turning, and family communications.",
    highRiskPatients: [
      { patientName: "Ah Chong", issues: ["Low SpO2", "Pending turning"] },
    ],
    pendingTasks: [
      "Side turning pending for Ah Chong",
      "Wound photo missing for Ah Chong",
    ],
    criticalAlerts: ["Low oxygen detected for Ah Chong"],
    recommendations: ["Prioritize high-risk bedside checks", "Send urgent family update"],
    preparedByAI: true,
  }
}

export function mockFamilyCommunicationQueue(): FamilyCommunicationQueueResponse {
  return {
    queue: [
      {
        patientName: "Ah Chong",
        priority: "Urgent",
        reason: "Low oxygen and doctor escalation",
        recommendedMessage:
          "Please update family immediately regarding oxygen monitoring and doctor review.",
      },
      {
        patientName: "Test Patient",
        priority: "Medium",
        reason: "Good rehab improvement",
        recommendedMessage: "Provide positive progress update to family.",
      },
    ],
    summary: {
      urgentFamilyUpdates: 1,
      routineUpdates: 1,
      totalPendingCommunications: 2,
    },
    recommendedActions: [
      "Prioritize urgent medical notifications",
      "Send routine updates before shift end",
    ],
  }
}
