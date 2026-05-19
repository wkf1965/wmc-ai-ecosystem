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

export function announceClinicalDataUpdate() {
  if (typeof window === "undefined") return
  window.localStorage.setItem(LAST_UPDATE_KEY, new Date().toISOString())
  window.dispatchEvent(new Event(CLINICAL_DATA_UPDATE_EVENT))
}

export const INITIAL_PATIENTS: Patient[] = [
  {
    id: "p1001",
    fullName: "Margaret Chen",
    age: 82,
    gender: "Female",
    diagnosis: "Congestive heart failure, Type 2 diabetes, mild cognitive impairment",
    admissionDate: "2026-02-14",
    mobilityStatus: "Walker with supervision",
    feedingStatus: "Assisted feeding, soft diet",
    toiletAssistance: "Assistance x1",
    fallRisk: "Moderate",
    pressureSoreRisk: "Moderate",
    mentalStatus: "Oriented to person and place",
    currentMedications: "Furosemide, metformin, atorvastatin, donepezil",
    familyContact: "Amy Chen (daughter) • +86 138 0000 1122",
    assignedNurse: "R.N. Patel",
    rehabilitationStatus: "Active rehabilitation",
    createdAt: "2026-02-14T09:12:00.000Z",
    updatedAt: "2026-05-13T06:10:00.000Z",
  },
  {
    id: "p1002",
    fullName: "Samuel Rivera",
    age: 74,
    gender: "Male",
    diagnosis: "Post-stroke weakness, hypertension, chronic kidney disease stage 3",
    admissionDate: "2026-03-20",
    mobilityStatus: "Two-person transfer",
    feedingStatus: "Total assist, minced and moist",
    toiletAssistance: "Maximal assist",
    fallRisk: "High",
    pressureSoreRisk: "High",
    mentalStatus: "Flat affect, intermittent confusion",
    currentMedications: "Aspirin, amlodipine, sertraline, sodium bicarbonate",
    familyContact: "Laura Rivera (daughter) • +1 786 555 0192",
    assignedNurse: "Nurse Kim",
    rehabilitationStatus: "Active rehabilitation",
    createdAt: "2026-03-20T10:40:00.000Z",
    updatedAt: "2026-05-13T05:40:00.000Z",
  },
  {
    id: "p1003",
    fullName: "Eleanor O'Connor",
    age: 89,
    gender: "Female",
    diagnosis: "COPD, osteoarthritis, urinary incontinence",
    admissionDate: "2025-11-02",
    mobilityStatus: "Wheelchair dependent",
    feedingStatus: "Independent, chopped solids",
    toiletAssistance: "Supervision",
    fallRisk: "Moderate",
    pressureSoreRisk: "Low",
    mentalStatus: "Mildly forgetful, generally calm",
    currentMedications: "Tiotropium, albuterol PRN, acetaminophen, oxybutynin",
    familyContact: "Michael O'Connor (son) • +1 212 555 2211",
    assignedNurse: "Nurse Patel",
    rehabilitationStatus: "Long-term care",
    createdAt: "2025-11-02T14:11:00.000Z",
    updatedAt: "2026-05-12T18:20:00.000Z",
  },
  {
    id: "p1004",
    fullName: "Jamal Okafor",
    age: 68,
    gender: "Male",
    diagnosis: "Chronic obstructive pulmonary disease, atrial fibrillation",
    admissionDate: "2026-01-08",
    mobilityStatus: "Independent with cane",
    feedingStatus: "Independent, regular diet",
    toiletAssistance: "Assistance x1 for safety",
    fallRisk: "Low",
    pressureSoreRisk: "Low",
    mentalStatus: "Alert and cooperative",
    currentMedications: "Warfarin, formoterol, budesonide, metoprolol",
    familyContact: "Chimamanda Okafor (spouse) • +234 801 000 7744",
    assignedNurse: "Nurse Lee",
    rehabilitationStatus: "Not in rehabilitation",
    createdAt: "2026-01-08T08:25:00.000Z",
    updatedAt: "2026-05-10T20:05:00.000Z",
  },
  {
    id: "p1005",
    fullName: "Clara Nguyen",
    age: 76,
    gender: "Female",
    diagnosis: "Post-operative hip fracture, atrial fibrillation, anemia",
    admissionDate: "2026-04-28",
    mobilityStatus: "Bed-chair transfer only",
    feedingStatus: "Assisted, high-protein pureed",
    toiletAssistance: "Partial assist",
    fallRisk: "High",
    pressureSoreRisk: "High",
    mentalStatus: "Anxious, sometimes disoriented at night",
    currentMedications: "Apixaban, bisacodyl, tramadol, iron supplements",
    familyContact: "Linh Nguyen (daughter) • +84 909 223 118",
    assignedNurse: "Nurse Santos",
    rehabilitationStatus: "Active rehabilitation",
    createdAt: "2026-04-28T11:09:00.000Z",
    updatedAt: "2026-05-13T07:05:00.000Z",
  },
  {
    id: "p1006",
    fullName: "Elena Morales",
    age: 90,
    gender: "Female",
    diagnosis: "Dementia with behavioral symptoms, hypertension",
    admissionDate: "2025-07-17",
    mobilityStatus: "Ambulates with close assist",
    feedingStatus: "Assisted feeding, pureed diet",
    toiletAssistance: "Full assist",
    fallRisk: "High",
    pressureSoreRisk: "Moderate",
    mentalStatus: "Requires reorientation frequently",
    currentMedications: "Memantine, lisinopril, trazodone",
    familyContact: "Rosa Morales (daughter) • +1 305 555 0187",
    assignedNurse: "Nurse Lee",
    rehabilitationStatus: "Long-term care",
    createdAt: "2025-07-17T13:32:00.000Z",
    updatedAt: "2026-05-12T21:20:00.000Z",
  },
  {
    id: "p1007",
    fullName: "Yuki Sato",
    age: 79,
    gender: "Female",
    diagnosis: "Parkinson’s disease, glaucoma, constipation",
    admissionDate: "2026-03-03",
    mobilityStatus: "Shuffling gait, needs arm support",
    feedingStatus: "Independent, requires slow eating",
    toiletAssistance: "Assistance x1",
    fallRisk: "Moderate",
    pressureSoreRisk: "Moderate",
    mentalStatus: "Cooperative, occasionally irritable",
    currentMedications: "Carbidopa-levodopa, latanoprost, senna",
    familyContact: "Kenji Sato (son) • +81 90 0000 4455",
    assignedNurse: "R.N. Patel",
    rehabilitationStatus: "Active rehabilitation",
    createdAt: "2026-03-03T10:18:00.000Z",
    updatedAt: "2026-05-11T09:15:00.000Z",
  },
  {
    id: "p1008",
    fullName: "Priya Menon",
    age: 71,
    gender: "Female",
    diagnosis: "Rheumatoid arthritis, osteopenia, atrial flutter",
    admissionDate: "2026-02-02",
    mobilityStatus: "Uses walker, fatigue with stairs",
    feedingStatus: "Independent, soft diet",
    toiletAssistance: "Partial assist",
    fallRisk: "Moderate",
    pressureSoreRisk: "Low",
    mentalStatus: "Clear, low mood",
    currentMedications: "Hydroxychloroquine, methotrexate, calcium carbonate, vitamin D3",
    familyContact: "Priya Reddy (daughter-in-law) • +65 8822 9931",
    assignedNurse: "Nurse Kim",
    rehabilitationStatus: "Not in rehabilitation",
    createdAt: "2026-02-02T07:50:00.000Z",
    updatedAt: "2026-05-09T16:05:00.000Z",
  },
  {
    id: "p1009",
    fullName: "Miguel Santos",
    age: 83,
    gender: "Male",
    diagnosis: "Dementia, recurrent UTIs, BPH",
    admissionDate: "2025-12-25",
    mobilityStatus: "Requires supervision with walker",
    feedingStatus: "Partial assist, regular diet",
    toiletAssistance: "Maximal assist",
    fallRisk: "High",
    pressureSoreRisk: "High",
    mentalStatus: "Generally pleasant, worse in late afternoon",
    currentMedications: "Nitrofurantoin (prophylactic), tamsulosin, omeprazole",
    familyContact: "Ana Santos (wife) • +34 600 445 778",
    assignedNurse: "Nurse Santos",
    rehabilitationStatus: "Long-term care",
    createdAt: "2025-12-25T14:55:00.000Z",
    updatedAt: "2026-05-13T07:40:00.000Z",
  },
  {
    id: "p1010",
    fullName: "David Chen",
    age: 77,
    gender: "Male",
    diagnosis: "Ischemic stroke, hyperlipidemia, depression",
    admissionDate: "2026-05-01",
    mobilityStatus: "Limited stand, needs two-person support",
    feedingStatus: "Assisted, pureed",
    toiletAssistance: "Assistance x2",
    fallRisk: "High",
    pressureSoreRisk: "Moderate",
    mentalStatus: "Lethargic but cooperative",
    currentMedications: "Clopidogrel, atorvastatin, citalopram, senna",
    familyContact: "Emily Chen (son) • +1 646 555 0140",
    assignedNurse: "R.N. Patel",
    rehabilitationStatus: "Active rehabilitation",
    createdAt: "2026-05-01T09:25:00.000Z",
    updatedAt: "2026-05-13T06:55:00.000Z",
  },
  {
    id: "p1011",
    fullName: "Fatima Al-Hassan",
    age: 86,
    gender: "Female",
    diagnosis: "Congestive heart failure, atrial fibrillation, chronic wounds",
    admissionDate: "2025-09-10",
    mobilityStatus: "Bedbound, Hoyer lift transfers",
    feedingStatus: "Assisted, pureed with supplements",
    toiletAssistance: "Total assist",
    fallRisk: "High",
    pressureSoreRisk: "High",
    mentalStatus: "Usually pleasant, intermittent agitation",
    currentMedications: "Furosemide, digoxin, enoxaparin, vitamin C",
    familyContact: "Karim Al-Hassan (son) • +971 55 901 2233",
    assignedNurse: "Nurse Lee",
    rehabilitationStatus: "Hospice / comfort care",
    createdAt: "2025-09-10T08:05:00.000Z",
    updatedAt: "2026-05-12T23:10:00.000Z",
  },
  {
    id: "p1012",
    fullName: "Oliver Grant",
    age: 72,
    gender: "Male",
    diagnosis: "Chronic kidney disease, anemia, peripheral vascular disease",
    admissionDate: "2026-01-29",
    mobilityStatus: "Slow walker, poor endurance",
    feedingStatus: "Independent, low sodium diet",
    toiletAssistance: "Assistance x1",
    fallRisk: "Moderate",
    pressureSoreRisk: "Moderate",
    mentalStatus: "Alert, occasionally frustrated",
    currentMedications: "Epoetin (as prescribed), furosemide, ferrous sulfate",
    familyContact: "Margaret Grant (niece) • +1 718 555 0129",
    assignedNurse: "Nurse Santos",
    rehabilitationStatus: "Short-stay / transitional",
    createdAt: "2026-01-29T13:02:00.000Z",
    updatedAt: "2026-05-11T15:33:00.000Z",
  },
]

const nowIso = () => new Date().toISOString()
const nextId = () => `p${Math.floor(Math.random() * 90000) + 10000}`

export function emptyPatientForm(): PatientFormData {
  return {
    fullName: "",
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

export function readPatients(): Patient[] {
  if (!isBrowserStorageAvailable()) {
    return [...INITIAL_PATIENTS]
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seeded = [...INITIAL_PATIENTS]
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  }

  try {
    const parsed = JSON.parse(raw) as Patient[]
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seeded = [...INITIAL_PATIENTS]
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
      return seeded
    }
    return parsed
  } catch {
    const seeded = [...INITIAL_PATIENTS]
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    return seeded
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

export function validatePatientForm(form: PatientFormData) {
  const trim = (value: string) => value.trim()
  const errors: Record<string, string> = {}

  if (!trim(form.fullName)) errors.fullName = "Full name is required."
  if (trim(form.fullName).length > 0 && trim(form.fullName).length < 2) errors.fullName = "Full name must be at least 2 characters."
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
