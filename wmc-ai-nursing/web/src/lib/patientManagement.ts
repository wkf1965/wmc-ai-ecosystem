export type PatientRiskLevel = "Low" | "Moderate" | "High"

export const GENDER_OPTIONS = ["Female", "Male", "Non-binary", "Other", "Prefer not to say"] as const
export const FALL_RISK_OPTIONS = ["Low", "Moderate", "High"] as const
export const PRESSURE_SORE_RISK_OPTIONS = ["Low", "Moderate", "High"] as const
export const REHAB_STATUS_OPTIONS = [
  "Not in rehabilitation",
  "Active rehabilitation",
  "Long-term care",
  "Short-stay / transitional",
  "Hospice / comfort care",
] as const

export type Patient = {
  id: string
  fullName: string
  roomNumber: string
  age: number
  gender: string
  diagnosis: string
  admissionDate: string
  mobilityStatus: string
  feedingStatus: string
  toiletAssistance: string
  fallRisk: PatientRiskLevel | string
  pressureSoreRisk: PatientRiskLevel | string
  mentalStatus: string
  currentMedications: string
  familyContact: string
  assignedNurse: string
  rehabilitationStatus: string
  createdAt: string
  updatedAt: string
}

export type PatientFormData = {
  fullName: string
  roomNumber: string
  age: string
  gender: string
  diagnosis: string
  admissionDate: string
  mobilityStatus: string
  feedingStatus: string
  toiletAssistance: string
  fallRisk: string
  pressureSoreRisk: string
  mentalStatus: string
  currentMedications: string
  familyContact: string
  assignedNurse: string
  rehabilitationStatus: string
}

const STORAGE_KEY = "wmc_nursing_patients_v1"
export const CLINICAL_DATA_UPDATE_EVENT = "wmc:clinical-data-updated"
const LAST_UPDATE_KEY = "wmc_nursing_last_update"
const ROOM_NUMBER_PATTERN = /^[A-D]-\d{3}$/
const LEGACY_DEMO_PATIENT_NAMES = new Set([
  "demo resident",
  "clara nguyen",
  "david chen",
  "eleanor o'connor",
  "margaret chen",
  "samuel rivera",
  "jamal okafor",
  "elena morales",
  "yuki sato",
  "priya menon",
  "miguel santos",
  "fatima al-hassan",
  "oliver grant",
])

export function announceClinicalDataUpdate() {
  if (typeof window === "undefined") return
  window.localStorage.setItem(LAST_UPDATE_KEY, new Date().toISOString())
  window.dispatchEvent(new Event(CLINICAL_DATA_UPDATE_EVENT))
}

export const INITIAL_PATIENTS: Patient[] = []

const nowIso = () => new Date().toISOString()
const nextId = () => `p${Math.floor(Math.random() * 90000) + 10000}`

export function emptyPatientForm(): PatientFormData {
  return {
    fullName: "",
    roomNumber: "",
    age: "",
    gender: "",
    diagnosis: "",
    admissionDate: new Date().toISOString().slice(0, 10),
    mobilityStatus: "",
    feedingStatus: "",
    toiletAssistance: "",
    fallRisk: FALL_RISK_OPTIONS[1],
    pressureSoreRisk: PRESSURE_SORE_RISK_OPTIONS[0],
    mentalStatus: "",
    currentMedications: "",
    familyContact: "",
    assignedNurse: "",
    rehabilitationStatus: REHAB_STATUS_OPTIONS[1],
  }
}

function isBrowserStorageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function stripLegacyDemoPatients(list: Patient[]) {
  return list.filter((row) => {
    const fullName = String(row?.fullName || "")
      .trim()
      .toLowerCase()
    if (!fullName) return true
    if (LEGACY_DEMO_PATIENT_NAMES.has(fullName)) return false
    if (fullName.includes("demo") && fullName.includes("resident")) return false
    return true
  })
}

function fallbackRoomFromPatientId(patientId: string) {
  const value = String(patientId || "").replace(/\D/g, "")
  const suffix = value.padStart(3, "0")
  const wing = Number.parseInt(suffix || "0", 10) % 4
  const map = ["A", "B", "C", "D"]
  return `${map[wing]}-2${suffix.slice(-2)}`
}

function normalizeRoomNumber(value: string) {
  return String(value || "").trim().toUpperCase()
}

export function listAllRoomNumbers() {
  const rooms: string[] = []
  for (const wing of ["A", "B", "C", "D"]) {
    for (let number = 201; number <= 220; number += 1) {
      rooms.push(`${wing}-${number}`)
    }
  }
  return rooms
}

export function listAvailableRooms(editingPatientId?: string) {
  const occupied = new Set(
    readPatients()
      .filter((patient) => patient.id !== editingPatientId)
      .map((patient) => normalizeRoomNumber(patient.roomNumber))
      .filter((room) => room.length > 0),
  )
  return listAllRoomNumbers().filter((room) => !occupied.has(room))
}

function normalizeStoredPatients(list: Patient[]) {
  let changed = false
  const normalized = list.map((row) => {
    const roomNumber = String((row as { roomNumber?: string }).roomNumber || "").trim()
    if (roomNumber) return row
    changed = true
    return {
      ...row,
      roomNumber: fallbackRoomFromPatientId(row.id),
    }
  })
  return { normalized, changed }
}

export function readPatients(): Patient[] {
  if (!isBrowserStorageAvailable()) {
    return []
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]))
    return []
  }

  try {
    const parsed = JSON.parse(raw) as Patient[]
    if (!Array.isArray(parsed)) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]))
      return []
    }
    const cleaned = stripLegacyDemoPatients(parsed)
    const { normalized, changed } = normalizeStoredPatients(cleaned)
    if (cleaned.length !== parsed.length || changed) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    }
    return normalized
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]))
    return []
  }
}

export function writePatients(list: Patient[]) {
  if (!isBrowserStorageAvailable()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

function cloneWithTimestamp(patient: Omit<Patient, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  const ts = nowIso()
  return {
    ...patient,
    id: patient.id || nextId(),
    createdAt: ts,
    updatedAt: ts,
  }
}

export function listPatients(): Patient[] {
  return readPatients()
}

export function getPatientById(patientId: string): Patient | null {
  return readPatients().find((p) => p.id === patientId) ?? null
}

export function createPatient(payload: PatientFormData): Patient {
  const current = readPatients()
  const created = cloneWithTimestamp({
    ...payload,
    id: nextId(),
    age: Number.parseInt(payload.age || "0", 10) || 0,
    fullName: payload.fullName.trim(),
    roomNumber: normalizeRoomNumber(payload.roomNumber),
    diagnosis: payload.diagnosis.trim(),
    admissionDate: payload.admissionDate.trim(),
    mobilityStatus: payload.mobilityStatus.trim(),
    feedingStatus: payload.feedingStatus.trim(),
    toiletAssistance: payload.toiletAssistance.trim(),
    fallRisk: payload.fallRisk,
    pressureSoreRisk: payload.pressureSoreRisk,
    mentalStatus: payload.mentalStatus.trim(),
    currentMedications: payload.currentMedications.trim(),
    familyContact: payload.familyContact.trim(),
    assignedNurse: payload.assignedNurse.trim(),
    rehabilitationStatus: payload.rehabilitationStatus,
  } as Omit<Patient, "id" | "createdAt" | "updatedAt">)

  current.unshift(created)
  writePatients(current)
  announceClinicalDataUpdate()
  return created
}

export function updatePatient(patientId: string, payload: PatientFormData): Patient | null {
  const current = readPatients()
  const idx = current.findIndex((p) => p.id === patientId)
  if (idx === -1) return null

  const updated: Patient = {
    ...current[idx],
    ...payload,
    age: Number.parseInt(payload.age || "0", 10) || 0,
    fullName: payload.fullName.trim(),
    roomNumber: normalizeRoomNumber(payload.roomNumber),
    diagnosis: payload.diagnosis.trim(),
    admissionDate: payload.admissionDate.trim(),
    mobilityStatus: payload.mobilityStatus.trim(),
    feedingStatus: payload.feedingStatus.trim(),
    toiletAssistance: payload.toiletAssistance.trim(),
    fallRisk: payload.fallRisk,
    pressureSoreRisk: payload.pressureSoreRisk,
    mentalStatus: payload.mentalStatus.trim(),
    currentMedications: payload.currentMedications.trim(),
    familyContact: payload.familyContact.trim(),
    assignedNurse: payload.assignedNurse.trim(),
    rehabilitationStatus: payload.rehabilitationStatus,
    updatedAt: nowIso(),
  }

  current[idx] = updated
  writePatients(current)
  announceClinicalDataUpdate()
  return updated
}

export function removePatient(patientId: string) {
  const current = readPatients()
  const removed = current.filter((p) => p.id !== patientId)
  if (removed.length === current.length) return false
  writePatients(removed)
  announceClinicalDataUpdate()
  return true
}

export function toForm(patient: Patient): PatientFormData {
  return {
    fullName: patient.fullName,
    roomNumber: patient.roomNumber || "",
    age: String(patient.age),
    gender: patient.gender,
    diagnosis: patient.diagnosis,
    admissionDate: patient.admissionDate,
    mobilityStatus: patient.mobilityStatus,
    feedingStatus: patient.feedingStatus,
    toiletAssistance: patient.toiletAssistance,
    fallRisk: patient.fallRisk as string,
    pressureSoreRisk: patient.pressureSoreRisk as string,
    mentalStatus: patient.mentalStatus,
    currentMedications: patient.currentMedications,
    familyContact: patient.familyContact,
    assignedNurse: patient.assignedNurse,
    rehabilitationStatus: patient.rehabilitationStatus,
  }
}

export function validatePatientForm(form: PatientFormData, editingPatientId?: string) {
  const trim = (value: string) => value.trim()
  const errors: Record<string, string> = {}

  if (!trim(form.fullName)) errors.fullName = "Full name is required."
  if (trim(form.fullName).length > 0 && trim(form.fullName).length < 2) errors.fullName = "Full name must be at least 2 characters."
  const roomNumber = normalizeRoomNumber(form.roomNumber)
  if (!roomNumber) {
    errors.roomNumber = "Room number is required."
  } else if (!ROOM_NUMBER_PATTERN.test(roomNumber)) {
    errors.roomNumber = "Room must match format A-201 (wing A-D and 3 digits)."
  } else {
    const hasDuplicate = readPatients().some(
      (row) => normalizeRoomNumber(row.roomNumber) === roomNumber && row.id !== editingPatientId,
    )
    if (hasDuplicate) {
      errors.roomNumber = "This room is already assigned to another resident."
    }
  }
  if (!trim(form.age)) errors.age = "Age is required."
  if (Number.isNaN(Number.parseInt(form.age, 10)) || Number.parseInt(form.age, 10) <= 0) errors.age = "Age must be a positive number."
  if (Number.parseInt(form.age, 10) > 130) errors.age = "Age must be below 130."

  if (!form.gender) errors.gender = "Gender is required."
  if (!trim(form.diagnosis)) errors.diagnosis = "Diagnosis is required."
  if (!trim(form.admissionDate)) {
    errors.admissionDate = "Admission date is required."
  } else if (Number.isNaN(Date.parse(form.admissionDate))) {
    errors.admissionDate = "Admission date format is invalid."
  } else if (new Date(form.admissionDate) > new Date()) {
    errors.admissionDate = "Admission date cannot be in the future."
  }

  if (!trim(form.mobilityStatus)) errors.mobilityStatus = "Mobility status is required."
  if (!trim(form.feedingStatus)) errors.feedingStatus = "Feeding status is required."
  if (!trim(form.toiletAssistance)) errors.toiletAssistance = "Toilet assistance is required."
  if (!trim(form.mentalStatus)) errors.mentalStatus = "Mental status is required."
  if (!trim(form.currentMedications)) errors.currentMedications = "Medications are required."
  if (!trim(form.familyContact)) errors.familyContact = "Family contact is required."
  if (!trim(form.assignedNurse)) errors.assignedNurse = "Assigned nurse is required."

  if (!FALL_RISK_OPTIONS.includes(form.fallRisk as (typeof FALL_RISK_OPTIONS)[number])) {
    errors.fallRisk = "Select a valid fall-risk level."
  }
  if (!PRESSURE_SORE_RISK_OPTIONS.includes(form.pressureSoreRisk as (typeof PRESSURE_SORE_RISK_OPTIONS)[number])) {
    errors.pressureSoreRisk = "Select a valid pressure risk level."
  }
  if (!REHAB_STATUS_OPTIONS.includes(form.rehabilitationStatus as (typeof REHAB_STATUS_OPTIONS)[number])) {
    errors.rehabilitationStatus = "Select a valid rehabilitation status."
  }

  return errors
}
