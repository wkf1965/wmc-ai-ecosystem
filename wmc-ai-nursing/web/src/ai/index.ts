/**
 * WMC AI Nursing — Brain modules
 *
 * Each brain exports one entry function:
 *   runNlpBrain          — parse free-text nursing input
 *   runRiskBrain         — assess clinical risk
 *   runAlertBrain        — build alert messages
 *   runDoctorReviewBrain — doctor review decision
 *   runFamilyUpdateBrain — family notification decision
 *   analyzeTurningRisk   — pressure sore / turning risk
 *   analyzeMedication    — medication administration risk
 *   analyzeNutrition     — nutrition / dehydration risk
 *   analyzeFallRisk      — fall prevention risk
 *   analyzeMentalHealth  — mental health / behavioural risk
 *   runMasterCoordinatorBrain — aggregate all brains
 *   generateShiftHandover — automatic shift handover summary
 *   predictRisk            — predictive risk forecasts
 *   generateWardDashboard  — ward-wide dashboard summary
 *   generateExecutiveDashboard — leadership daily overview
 *   generateDailyNursingReport — daily nursing report
 */

export { runNlpBrain, type NlpBrainInput, type NlpBrainResult } from "./nlpBrain"
export { runRiskBrain, type RiskBrainInput, type RiskBrainResult } from "./riskBrain"
export { runAlertBrain, type AlertBrainInput, type AlertBrainResult, type AlertPriority } from "./alertBrain"
export {
  runDoctorReviewBrain,
  type DoctorReviewBrainInput,
  type DoctorReviewBrainResult,
  type DoctorReviewQueueItem,
  type DoctorReviewVitals,
} from "./doctorReviewBrain"
export {
  runFamilyUpdateBrain,
  type FamilyUpdateBrainInput,
  type FamilyUpdateBrainResult,
} from "./familyUpdateBrain"
export {
  analyzeTurningRisk,
  formatTelegramTurningReply,
  type TurningBrainInput,
  type TurningBrainResult,
  type PressureSoreRisk,
} from "./turningBrain"
export {
  analyzeMedication,
  formatTelegramMedicationReply,
  formatTelegramMedicationActions,
  type MedicationBrainInput,
  type MedicationBrainResult,
  type MedicationRisk,
} from "./medicationBrain"
export {
  analyzeNutrition,
  formatTelegramNutritionReply,
  formatTelegramNutritionActions,
  type NutritionBrainInput,
  type NutritionBrainResult,
  type NutritionRiskLevel,
  type FamilyUpdateLevel,
} from "./nutritionBrain"
export {
  analyzeFallRisk,
  type FallPreventionBrainInput,
  type FallPreventionBrainResult,
  type FallRiskLevel,
} from "./fallPreventionBrain"
export {
  analyzeMentalHealth,
  formatTelegramMentalHealthReply,
  formatTelegramMentalHealthActions,
  type MentalHealthBrainInput,
  type MentalHealthBrainResult,
  type MentalHealthRiskLevel,
} from "./mentalHealthBrain"
export {
  runMasterCoordinatorBrain,
  type MasterCoordinatorBrainInput,
  type MasterCoordinatorBrainResult,
  type MasterCoordinatorPatient,
  type WoundCareBrainResult,
  type CoordinatorPriority,
  type OverallRiskLevel,
} from "./masterCoordinatorBrain"
export {
  generateShiftHandover,
  type HandoverBrainInput,
  type HandoverBrainResult,
  type HandoverBrainSections,
  type HandoverPatientRecord,
  type HandoverShift,
} from "./handoverBrain"
export {
  predictRisk,
  type PredictiveRiskBrainInput,
  type PredictiveRiskBrainResult,
  type PredictiveRiskForecast,
  type PredictiveRiskLevel,
} from "./predictiveRiskBrain"
export {
  generateWardDashboard,
  wardResidentFromCoordinator,
  type WardDashboardBrainInput,
  type WardDashboardBrainResult,
  type WardRiskCounts,
  type WardPendingCounts,
  type WardResidentRecord,
} from "./wardDashboardBrain"
export {
  generateExecutiveDashboard,
  type ExecutiveDashboardBrainInput,
  type ExecutiveDashboardBrainResult,
  type ExecutiveResidentRecord,
} from "./executiveDashboardBrain"
export {
  generateDailyNursingReport,
  type DailyReportBrainInput,
  type DailyReportBrainResult,
  type DailyReportSections,
  type DailyReportResidentRecord,
} from "./dailyReportBrain"
export {
  runAiBrainPipeline,
  formatTelegramBrainReply,
  type AiBrainPipelineInput,
  type AiBrainPipelineResult,
} from "./pipeline"
