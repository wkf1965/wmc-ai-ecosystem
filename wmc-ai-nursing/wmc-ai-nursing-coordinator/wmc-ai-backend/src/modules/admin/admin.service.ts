import { sheetDb } from '../../db/index.js'
import type { SheetTab } from '../../db/sheet-tabs.js'
import { nurseAcknowledgementMemoryStore } from '../acknowledgements/nurseAcknowledgement.store.js'
import { nursingAnnouncementMemoryStore } from '../announcements/nursingAnnouncement.store.js'
import { incidentReportsMemoryStore } from '../incidents/incident.store.js'
import { nurseShiftOtMemoryStore } from '../nurseShift/nurseShift.store.js'
import { nursingClinicalRecordsMemoryStore } from '../nursing/nursing.records.store.js'
import { nurseReminderMemoryStore } from '../reminders/nurseReminder.store.js'
import { sideTurningMemoryStore } from '../turning/turning.store.js'
import { woundAssessmentMemoryStore } from '../wound/woundAssessment.store.js'

const CLINICAL_SHEET_TABS: SheetTab[] = [
  'nursing_daily_reports',
  'vital_signs',
  'medications',
  'nursing_alerts',
  'doctor_review_queue',
  'rehab_sessions',
  'ai_results',
]

/** Patient-linked sheet tabs cleared by reset-patients (users/crm kept). */
const PATIENT_RECORD_SHEET_TABS: SheetTab[] = [
  'patients',
  'nursing_daily_reports',
  'vital_signs',
  'medications',
  'nursing_alerts',
  'rehab_sessions',
]

const MEMORY_STORES = [
  { name: 'nursingRecords', store: nursingClinicalRecordsMemoryStore },
  { name: 'sideTurning', store: sideTurningMemoryStore },
  { name: 'ot', store: nurseShiftOtMemoryStore },
  { name: 'woundAssessments', store: woundAssessmentMemoryStore },
  { name: 'incidents', store: incidentReportsMemoryStore },
  { name: 'announcements', store: nursingAnnouncementMemoryStore },
  { name: 'reminders', store: nurseReminderMemoryStore },
  { name: 'acknowledgements', store: nurseAcknowledgementMemoryStore },
] as const

const PATIENT_MEMORY_STORES = [
  { name: 'nursingRecords', store: nursingClinicalRecordsMemoryStore },
  { name: 'sideTurning', store: sideTurningMemoryStore },
  { name: 'ot', store: nurseShiftOtMemoryStore },
] as const

export async function clearAllMockRecords() {
  for (const { name, store } of MEMORY_STORES) {
    store.clear()
  }

  let sheetTabsCleared: SheetTab[] = []
  if (typeof sheetDb.clearTabs === 'function') {
    sheetTabsCleared = await sheetDb.clearTabs(CLINICAL_SHEET_TABS)
  }

  return {
    clearedAt: new Date().toISOString(),
    memoryStoresCleared: MEMORY_STORES.map((entry) => entry.name),
    sheetTabsCleared,
  }
}

/** Reset patient-linked stored data only — keeps users, CRM, system config, workflow engine. */
export async function resetPatientRecords() {
  for (const { store } of PATIENT_MEMORY_STORES) {
    store.clear()
  }

  let sheetTabsCleared: SheetTab[] = []
  if (typeof sheetDb.clearTabs === 'function') {
    sheetTabsCleared = await sheetDb.clearTabs(PATIENT_RECORD_SHEET_TABS)
  }

  return {
    clearedAt: new Date().toISOString(),
    memoryStoresCleared: PATIENT_MEMORY_STORES.map((entry) => entry.name),
    sheetTabsCleared,
    categoriesCleared: ['patients', 'nursingRecords', 'sideTurning', 'ot', 'alerts', 'rehabProgress'],
  }
}
