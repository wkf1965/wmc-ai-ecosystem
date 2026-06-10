/**
 * Risk Brain — clinical risk assessment for nursing / vital input.
 */

import { assessNursingRisk, type NursingRiskPayload } from "../lib/server/riskBrainV2Input"
import type { RiskBrainResult } from "../lib/server/riskBrainV2"

export type RiskBrainInput = NursingRiskPayload

export type { RiskBrainResult }

/** Assess clinical risk and return structured Risk Brain V2 output. */
export function runRiskBrain(input: RiskBrainInput): RiskBrainResult {
  return assessNursingRisk(input)
}
