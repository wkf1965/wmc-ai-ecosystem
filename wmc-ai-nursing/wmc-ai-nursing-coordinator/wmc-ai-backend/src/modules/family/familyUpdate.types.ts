export type FamilyUpdateStatusLevel = 'Stable' | 'Attention' | 'Critical'

export interface FamilyUpdateResponse {
  familyUpdate: string
  status: FamilyUpdateStatusLevel
  recommendedFamilyAction: string
}
