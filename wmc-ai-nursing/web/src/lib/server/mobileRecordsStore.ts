import { promises as fs } from "fs"
import path from "path"

/**
 * Lightweight persistent store for records submitted from the nurse mobile
 * input pages (vitals, medication, shift handover, patient notes).
 *
 * Side turning and inventory usage reuse the existing nursingModuleStore.
 */

export type VitalsRecord = {
  id: string
  room: string
  patientName: string
  temperature: string
  bloodPressure: string
  pulse: string
  spo2: string
  glucose: string
  remark: string
  nurseName: string
  recordedAt: string
}

export type MedicationRecord = {
  id: string
  room: string
  patientName: string
  medicationName: string
  dose: string
  timeGiven: string
  givenBy: string
  remark: string
  recordedAt: string
}

export type HandoverRecord = {
  id: string
  shift: string
  nurseName: string
  summary: string
  concerns: string
  urgentFollowUp: string
  recordedAt: string
}

export type PatientNoteRecord = {
  id: string
  room: string
  patientName: string
  note: string
  nurseName: string
  recordedAt: string
}

export type ClinicalAlertRecord = {
  id: string
  patientName: string
  room: string
  alertType: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM"
  detail: string
  detectedAt: string
  resolved: boolean
  resolvedAt: string | null
  resolvedBy: string | null
  nurseName: string
}

type MobileStore = {
  vitals: VitalsRecord[]
  medications: MedicationRecord[]
  handovers: HandoverRecord[]
  notes: PatientNoteRecord[]
  clinicalAlerts: ClinicalAlertRecord[]
}

const STORE_FILE = path.join(process.cwd(), ".mobile-records-store.json")

const emptyStore: MobileStore = { vitals: [], medications: [], handovers: [], notes: [], clinicalAlerts: [] }

function nowIso() {
  return new Date().toISOString()
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function readStore(): Promise<MobileStore> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8")
    const parsed = JSON.parse(raw) as Partial<MobileStore>
    return {
      vitals: Array.isArray(parsed.vitals) ? parsed.vitals : [],
      medications: Array.isArray(parsed.medications) ? parsed.medications : [],
      handovers: Array.isArray(parsed.handovers) ? parsed.handovers : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      clinicalAlerts: Array.isArray(parsed.clinicalAlerts) ? parsed.clinicalAlerts : [],
    }
  } catch {
    return { ...emptyStore }
  }
}

async function writeStore(store: MobileStore) {
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8")
}

export async function readMobileStore() {
  return readStore()
}

export async function addVitalsRecord(input: Omit<VitalsRecord, "id" | "recordedAt"> & { recordedAt?: string }) {
  const store = await readStore()
  const record: VitalsRecord = { id: makeId("vit"), recordedAt: input.recordedAt || nowIso(), ...input }
  store.vitals.unshift(record)
  store.vitals = store.vitals.slice(0, 5000)
  await writeStore(store)
  return record
}

export async function addMedicationRecord(
  input: Omit<MedicationRecord, "id" | "recordedAt"> & { recordedAt?: string },
) {
  const store = await readStore()
  const record: MedicationRecord = { id: makeId("med"), recordedAt: input.recordedAt || nowIso(), ...input }
  store.medications.unshift(record)
  store.medications = store.medications.slice(0, 5000)
  await writeStore(store)
  return record
}

export async function addHandoverRecord(
  input: Omit<HandoverRecord, "id" | "recordedAt"> & { recordedAt?: string },
) {
  const store = await readStore()
  const record: HandoverRecord = { id: makeId("ho"), recordedAt: input.recordedAt || nowIso(), ...input }
  store.handovers.unshift(record)
  store.handovers = store.handovers.slice(0, 5000)
  await writeStore(store)
  return record
}

export async function addPatientNoteRecord(
  input: Omit<PatientNoteRecord, "id" | "recordedAt"> & { recordedAt?: string },
) {
  const store = await readStore()
  const record: PatientNoteRecord = { id: makeId("note"), recordedAt: input.recordedAt || nowIso(), ...input }
  store.notes.unshift(record)
  store.notes = store.notes.slice(0, 5000)
  await writeStore(store)
  return record
}

export async function addClinicalAlerts(
  alerts: Array<{
    patientName: string
    room: string
    alertType: string
    severity: "CRITICAL" | "HIGH" | "MEDIUM"
    detail: string
    nurseName?: string
    detectedAt?: string
  }>,
): Promise<ClinicalAlertRecord[]> {
  if (!alerts.length) return []
  const store = await readStore()
  const created: ClinicalAlertRecord[] = alerts.map((a) => ({
    id: makeId("alert"),
    patientName: a.patientName,
    room: a.room,
    alertType: a.alertType,
    severity: a.severity,
    detail: a.detail,
    detectedAt: a.detectedAt || nowIso(),
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    nurseName: a.nurseName || "",
  }))
  store.clinicalAlerts.unshift(...created)
  store.clinicalAlerts = store.clinicalAlerts.slice(0, 5000)
  await writeStore(store)
  return created
}

export async function resolveClinicalAlert(id: string, resolvedBy?: string) {
  const store = await readStore()
  const idx = store.clinicalAlerts.findIndex((a) => a.id === id)
  if (idx === -1) throw new Error("Clinical alert not found.")
  store.clinicalAlerts[idx] = {
    ...store.clinicalAlerts[idx],
    resolved: true,
    resolvedAt: nowIso(),
    resolvedBy: resolvedBy || null,
  }
  await writeStore(store)
  return store.clinicalAlerts[idx]
}
