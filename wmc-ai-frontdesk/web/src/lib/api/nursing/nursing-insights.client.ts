import { fetchInsight } from "./fetch"
import type {
  DailyFacilityReportResponse,
  FamilyCommunicationQueueResponse,
  HandoverAutoGenerateResponse,
  NightShiftMonitorResponse,
  PredictiveRiskResponse,
} from "./insights-types"
import {
  mockAutoHandover,
  mockDailyFacilityReport,
  mockFamilyCommunicationQueue,
  mockNightShiftMonitor,
  mockPredictiveRisk,
} from "./mock-insights"

/** Normalize alternate backend field names for predictive risk */
function normalizePredictiveRisk(raw: Record<string, unknown>): PredictiveRiskResponse {
  return {
    overallPrediction:
      (raw.overallPrediction as string) ??
      (raw.overall_prediction as string) ??
      "Risk assessment available",
    highConcernAreas:
      (raw.highConcernAreas as string[]) ??
      (raw.high_concern_areas as string[]) ??
      [],
    preventiveRecommendations:
      (raw.preventiveRecommendations as string[]) ??
      (raw.preventive_recommendations as string[]) ??
      (raw.recommendations as string[]) ??
      [],
    generatedAt: raw.generatedAt as string | undefined,
  }
}

export function fetchPredictiveRisk() {
  return fetchInsight<PredictiveRiskResponse>(
    "/analytics/predictive-risk",
    mockPredictiveRisk,
    (data) =>
      normalizePredictiveRisk(data as unknown as Record<string, unknown>)
  )
}

export function fetchNightShiftMonitor() {
  return fetchInsight<NightShiftMonitorResponse>(
    "/night-shift/monitor",
    mockNightShiftMonitor
  )
}

export function fetchDailyFacilityReport() {
  return fetchInsight<DailyFacilityReportResponse>(
    "/reports/daily-facility",
    mockDailyFacilityReport
  )
}

export function fetchAutoHandover() {
  return fetchInsight<HandoverAutoGenerateResponse>(
    "/handover/auto-generate",
    mockAutoHandover
  )
}

export function fetchFamilyCommunicationQueue() {
  return fetchInsight<FamilyCommunicationQueueResponse>(
    "/family/communication-queue",
    mockFamilyCommunicationQueue
  )
}
