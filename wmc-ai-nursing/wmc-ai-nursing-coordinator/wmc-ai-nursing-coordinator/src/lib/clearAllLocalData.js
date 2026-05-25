/**
 * Clear all browser-side demo/clinical data from localStorage.
 */
export function clearBrowserLocalStorage() {
  const count = localStorage.length
  localStorage.clear()
  window.dispatchEvent(new Event('wmc-clinical-data-updated'))
  window.dispatchEvent(new Event('wmc-care-loops-updated'))
  window.dispatchEvent(new Event('wmc-health-check-loops-updated'))
  return count
}

/** Patient-linked browser storage only (keeps Telegram logs, inventory, auth tokens, etc.). */
const PATIENT_RECORD_LOCAL_KEYS = [
  'wmc_patients_v1',
  'wmc_nursing_notes_v1',
  'wmc_side_turning_schedules_v1',
  'wmc_side_turning_events_v1',
  'wmc_side_turning_loop_v1',
  'wmc_ot_staff_v1',
  'wmc_ot_attendance_v1',
  'wmc_ot_payroll_records_v2',
  'wmc_ot_payroll_summary_v2',
  'wmc_staff_overtime_loop_v1',
  'wmc_vital_records_v1',
  'wmc_vital_signs_v1',
  'wmc_medication_tracking_v1',
  'wmc_ai_risks_v1',
  'wmc_mobile_nurse_escalations_v1',
  'wmc_doctor_review_records_v1',
  'wmc_rehab_tracking_sessions_v1',
  'wmc_rehabilitation_loop_v1',
]

export function clearPatientRecordsLocalStorage() {
  let removed = 0
  for (const key of PATIENT_RECORD_LOCAL_KEYS) {
    if (localStorage.getItem(key) != null) {
      localStorage.removeItem(key)
      removed += 1
    }
  }
  window.dispatchEvent(new Event('wmc-clinical-data-updated'))
  window.dispatchEvent(new Event('wmc-care-loops-updated'))
  window.dispatchEvent(new Event('wmc-health-check-loops-updated'))
  return removed
}
