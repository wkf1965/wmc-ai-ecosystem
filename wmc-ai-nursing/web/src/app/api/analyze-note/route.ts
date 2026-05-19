import { NextResponse } from "next/server"
import { getPatientById } from "../../../lib/patientManagement"
import { analyzeNursingNote } from "../../../lib/nursingNoteAnalyzer"
import { NursingNote } from "../../../lib/nursingNotes"

type AnalyzePayload = {
  patientId?: string
  note?: Partial<NursingNote>
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as AnalyzePayload | null
  if (!payload?.note) {
    return NextResponse.json({ error: "Missing note payload" }, { status: 400 })
  }

  const patient = payload.patientId ? getPatientById(payload.patientId) : null
  const result = analyzeNursingNote(payload.note as any, patient)

  return NextResponse.json({
    route: "analyze-note",
    generatedAt: new Date().toISOString(),
    result,
  })
}
