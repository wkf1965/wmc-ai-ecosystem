/** Response for rule-based shift handover generation */
export interface HandoverGenerateResponse {
  handoverSummary: string
  highRiskPatients: string[]
  pendingTasks: string[]
  shiftStatus: 'Stable' | 'Attention Required'
}
