import { announceClinicalDataUpdate } from "./patientManagement"

export type NursingNote = {
  id: string
  patientId: string
  date: string
  recordedAt: string
  recordedBy: string
  appetite: string
  mood: string
  mobility: string
  bloodPressure: string
  bloodSugar: string
  urination: string
  bowelMovement: string
  skinCondition: string
  abnormalEvents: string
  nurseRemarks: string
  noteText: string
  painScore: string
  hydrationWatch: boolean
}

export type NursingNoteInput = Omit<NursingNote, "id">

export type NursingNoteInputErrors = Partial<Record<keyof NursingNoteInput | "content", string>>

export const NOTE_PATIENTS = [
  "p1001",
  "p1002",
]

const NOTE_STORAGE_KEY = "wmc_nursing_notes_v1"

function pastDate(offset = 0) {
  const date = new Date()
  date.setDate(date.getDate() - offset)
  return date.toISOString().slice(0, 10)
}

const NOTES_SEED: NursingNote[] = [
  {
    id: "n-1",
    patientId: "p1001",
    date: pastDate(1),
    recordedAt: new Date().toISOString(),
    recordedBy: "R.N. Patel",
    appetite: "reduced, 50% lunch",
    mood: "calm but withdrawn",
    bloodPressure: "128/78",
    bloodSugar: "186 mg/dL",
    urination: "light yellow, less than usual",
    bowelMovement: "no BM yesterday",
    skinCondition: "redness at coccyx",
    mobility: "limited stand with walker",
    noteText: "Patient reported mild chest tightness; near fall while transferring.",
    abnormalEvents: "near fall while transferring",
    nurseRemarks: "requested close observation after ambulation",
    painScore: "4",
    hydrationWatch: true,
  },
  {
    id: "n-2",
    patientId: "p1002",
    date: pastDate(2),
    recordedAt: new Date(new Date().setDate(new Date().getDate() - 2)).toISOString(),
    recordedBy: "Nurse Kim",
    appetite: "good appetite",
    mood: "tearful, anxious",
    bloodPressure: "112/64",
    bloodSugar: "95 mg/dL",
    urination: "normal",
    bowelMovement: "soft stool this morning",
    skinCondition: "intact",
    mobility: "assisted walk with support",
    noteText: "Patient anxious with intermittent tearfulness; slurred speech observed in morning.",
    abnormalEvents: "slurred speech observed in morning",
    nurseRemarks: "monitor emotional distress and vitals",
    painScore: "0",
    hydrationWatch: false,
  },
  {
    id: "n-3",
    patientId: "p1001",
    date: pastDate(3),
    recordedAt: new Date(new Date().setDate(new Date().getDate() - 3)).toISOString(),
    recordedBy: "R.N. Patel",
    appetite: "minimal intake overnight",
    mood: "restless",
    bloodPressure: "116/66",
    bloodSugar: "178 mg/dL",
    urination: "high frequency",
    bowelMovement: "small stool volume",
    skinCondition: "skin intact, blanching erythema in sacrum",
    mobility: "requires two-person transfer",
    noteText: "Patient restless overnight; required two staff for bed mobility due to weakness.",
    abnormalEvents: "required two staff for bed mobility",
    nurseRemarks: "started pressure prevention schedule every 2 hours",
    painScore: "2",
    hydrationWatch: true,
  },
  {
    id: "n-4",
    patientId: "p1003",
    date: pastDate(1),
    recordedAt: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(),
    recordedBy: "Nurse Chan",
    appetite: "adequate breakfast only",
    mood: "cooperative",
    bloodPressure: "132/72",
    bloodSugar: "104 mg/dL",
    urination: "normal color and amount",
    bowelMovement: "regular",
    skinCondition: "redness resolved",
    mobility: "requires walker with supervision",
    noteText: "No acute events overnight. Cooperative but slower gait.",
    abnormalEvents: "no acute events",
    nurseRemarks: "continue gait training with walker",
    painScore: "1",
    hydrationWatch: false,
  },
  {
    id: "n-5",
    patientId: "p1004",
    date: pastDate(4),
    recordedAt: new Date(new Date().setDate(new Date().getDate() - 4)).toISOString(),
    recordedBy: "Nurse Lee",
    appetite: "good appetite",
    mood: "engaged",
    bloodPressure: "125/70",
    bloodSugar: "110 mg/dL",
    urination: "normal",
    bowelMovement: "regular",
    skinCondition: "dry skin on shins",
    mobility: "ambulates with cane and stand-by assist",
    noteText: "Patient noted brief dizziness in morning standing; appetite remained good.",
    abnormalEvents: "brief dizziness in morning standing",
    nurseRemarks: "advise slow position changes",
    painScore: "3",
    hydrationWatch: false,
  },
  {
    id: "n-6",
    patientId: "p1003",
    date: pastDate(5),
    recordedAt: new Date(new Date().setDate(new Date().getDate() - 5)).toISOString(),
    recordedBy: "Nurse Patel",
    appetite: "poor",
    mood: "agitated in evening",
    bloodPressure: "118/68",
    bloodSugar: "132 mg/dL",
    urination: "dark urine",
    bowelMovement: "constipated",
    skinCondition: "intact",
    mobility: "requires bed mobility only",
    noteText: "Patient agitated in evening with increased confusion after 20:00.",
    abnormalEvents: "increased confusion after 20:00",
    nurseRemarks: "recheck vitals after hydration and monitor",
    painScore: "5",
    hydrationWatch: true,
  },
]

export function emptyNursingNote(): NursingNoteInput {
  return {
    patientId: "",
    date: new Date().toISOString().slice(0, 10),
    recordedAt: nowIso(),
    recordedBy: "",
    appetite: "",
    mood: "",
    mobility: "",
    bloodPressure: "",
    bloodSugar: "",
    urination: "",
    bowelMovement: "",
    skinCondition: "",
    abnormalEvents: "",
    nurseRemarks: "",
    noteText: "",
    painScore: "",
    hydrationWatch: false,
  }
}

const trim = (value: string) => value.trim()

function normalizeNote(candidate: Partial<NursingNote>, index = 0): NursingNote {
  return {
    id: String(candidate.id || `n-legacy-${index}-${nowIsoDateTime()}`),
    patientId: candidate.patientId || "",
    date: candidate.date || pastDate(0),
    recordedAt: candidate.recordedAt || candidate.date || toIsoDateTime(),
    recordedBy: candidate.recordedBy || "Unknown nurse",
    appetite: candidate.appetite || "",
    mood: candidate.mood || "",
    mobility: candidate.mobility || "",
    bloodPressure: candidate.bloodPressure || "",
    bloodSugar: candidate.bloodSugar || "",
    urination: candidate.urination || "",
    bowelMovement: candidate.bowelMovement || "",
    skinCondition: candidate.skinCondition || "",
    abnormalEvents: candidate.abnormalEvents || "",
    nurseRemarks: candidate.nurseRemarks || "",
    noteText: candidate.noteText || "",
    painScore: candidate.painScore || "",
    hydrationWatch: Boolean(candidate.hydrationWatch),
  }
}

function hasAnyContent(input: NursingNoteInput) {
  return !!(
    trim(input.appetite) ||
    trim(input.mood) ||
    trim(input.mobility) ||
    trim(input.noteText) ||
    trim(input.painScore) ||
    trim(input.bloodPressure) ||
    trim(input.bloodSugar) ||
    trim(input.urination) ||
    trim(input.bowelMovement) ||
    trim(input.skinCondition) ||
    trim(input.abnormalEvents) ||
    trim(input.nurseRemarks) ||
    input.hydrationWatch
  )
}

const toIsoDateTime = nowIso

export function validateNursingNoteInput(input: NursingNoteInput, opts?: { requirePatientId?: boolean }) {
  const next: NursingNoteInputErrors = {}
  const requirePatientId = opts?.requirePatientId ?? false

  if (requirePatientId && !trim(input.patientId)) {
    next.patientId = "A patient is required."
  }

  if (!trim(input.date)) {
    next.date = "Note date is required."
  } else if (Number.isNaN(Date.parse(input.date))) {
    next.date = "Please provide a valid date."
  } else if (new Date(input.date) > new Date()) {
    next.date = "Note date cannot be in the future."
  }

  if (!hasAnyContent(input)) {
    next.content = "At least one clinical field is required."
  }

  return next
}

function nowIso() {
  return new Date().toISOString()
}

const storageAvailable = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined"

export function listNotes() {
  if (!storageAvailable()) return [...NOTES_SEED]
  const raw = window.localStorage.getItem(NOTE_STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(NOTES_SEED))
    return [...NOTES_SEED]
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      window.localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(NOTES_SEED))
      return [...NOTES_SEED]
    }
    return (parsed as Array<Partial<NursingNote>>).map((note, index) => normalizeNote(note, index))
  } catch {
    window.localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(NOTES_SEED))
    return [...NOTES_SEED]
  }
}

export function addNote(note: Omit<NursingNote, "id">) {
  const current = listNotes()
  const normalized = normalizeNote({
    id: `n-${Date.now()}`,
    ...note,
  })
  const next = [
    normalized,
    ...current,
  ]
  if (storageAvailable()) window.localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(next))
  announceClinicalDataUpdate()
  return next
}

export function notesForPatient(patientId: string) {
  return listNotes().filter((note) => note.patientId === patientId)
}
