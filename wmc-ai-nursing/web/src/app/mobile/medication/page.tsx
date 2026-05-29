"use client"

import { useState } from "react"
import {
  ErrorNote,
  Field,
  MobilePage,
  NurseNameField,
  RoomPatientFields,
  SavedScreen,
  SubmitBar,
  TextArea,
  useNurseName,
} from "../../../components/mobile/MobileForm"

export default function MobileMedicationPage() {
  const [room, setRoom] = useState("")
  const [patientName, setPatientName] = useState("")
  const [medicationName, setMedicationName] = useState("")
  const [dose, setDose] = useState("")
  const [timeGiven, setTimeGiven] = useState("")
  const [remark, setRemark] = useState("")
  const [givenBy, setGivenBy] = useNurseName()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  function reset() {
    setRoom("")
    setPatientName("")
    setMedicationName("")
    setDose("")
    setTimeGiven("")
    setRemark("")
    setSaved(false)
    setError("")
  }

  async function submit() {
    setError("")
    if (!room.trim()) return setError("Please enter the room.")
    if (!medicationName.trim()) return setError("Please enter the medication name.")
    if (!givenBy.trim()) return setError("Please enter your name.")
    setBusy(true)
    try {
      const res = await fetch("/api/medication", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room, patientName, medicationName, dose, timeGiven, givenBy, remark }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Could not save. Try again.")
        return
      }
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <MobilePage title="Medication Given" subtitle="Record medication" accent="bg-fuchsia-700">
      {saved ? (
        <SavedScreen onAgain={reset} />
      ) : (
        <>
          <ErrorNote error={error} />
          <RoomPatientFields room={room} setRoom={setRoom} patientName={patientName} setPatientName={setPatientName} />
          <Field label="Medication name" value={medicationName} onChange={setMedicationName} placeholder="e.g. Paracetamol" required />
          <Field label="Dose" value={dose} onChange={setDose} placeholder="e.g. 500 mg" />
          <Field label="Time given" value={timeGiven} onChange={setTimeGiven} placeholder="e.g. 14:30" />
          <TextArea label="Remark" value={remark} onChange={setRemark} placeholder="Optional notes" />
          <NurseNameField value={givenBy} onChange={setGivenBy} />
          <SubmitBar onSubmit={submit} busy={busy} label="Save medication" />
        </>
      )}
    </MobilePage>
  )
}
