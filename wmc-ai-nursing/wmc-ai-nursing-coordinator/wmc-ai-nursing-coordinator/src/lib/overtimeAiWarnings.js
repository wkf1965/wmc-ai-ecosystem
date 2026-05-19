/**
 * Demo AI-style overtime workload flags (not clinical advice).
 */

const MONTH_HIGH_HOURS = 24
const MONTH_WARN_HOURS = 16
const SINGLE_SHIFT_HIGH = 6

/**
 * @param {object[]} claims all claims
 * @param {string} ym YYYY-MM
 */
export function analyzeOvertimeWorkload(claims, ym) {
  const prefix = ym.slice(0, 7)
  const monthClaims = claims.filter((c) => c.shiftDate?.startsWith(prefix) && c.status !== 'rejected')

  const byNurse = {}
  for (const c of monthClaims) {
    const n = c.nurseName?.trim() || 'Unknown'
    byNurse[n] = (byNurse[n] || 0) + (Number(c.totalOtHours) || 0)
  }

  /** @type {{ level: string, nurseName: string, message: string }[]} */
  const warnings = []

  for (const [nurseName, total] of Object.entries(byNurse)) {
    if (total >= MONTH_HIGH_HOURS) {
      warnings.push({
        level: 'high',
        nurseName,
        message: `${nurseName} has ${total.toFixed(1)}h approved/pending OT this month — exceeds ${MONTH_HIGH_HOURS}h simulation threshold. Consider staffing review and fatigue mitigation.`,
      })
    } else if (total >= MONTH_WARN_HOURS) {
      warnings.push({
        level: 'moderate',
        nurseName,
        message: `${nurseName} approaching elevated monthly OT (${total.toFixed(1)}h). Monitor for cumulative fatigue.`,
      })
    }
  }

  for (const c of monthClaims) {
    const h = Number(c.totalOtHours) || 0
    if (h >= SINGLE_SHIFT_HIGH) {
      warnings.push({
        level: 'high',
        nurseName: c.nurseName,
        message: `Single claim on ${c.shiftDate}: ${h}h OT (${c.nurseName}) — unusually long extension; verify staffing and handoff.`,
      })
    }
  }

  return warnings
}
