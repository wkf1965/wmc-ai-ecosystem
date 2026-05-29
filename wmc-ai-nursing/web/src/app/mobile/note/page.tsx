"use client"

import { useState } from "react"
import {
  ErrorNote,
  MobilePage,
  NurseNameField,
  RoomPatientFields,
  SavedScreen,
  SubmitBar,
  TextArea,
  useNurseName,
} from "../../../components/mobile/MobileForm"

export default function MobileNotePage() {
  const [room, setRoom] = useState("")
  const [patientName, setPatientName] = useState("")
  const [note, setNote] = useState("")
  const [nurseName, setNurseName] = useNurseName()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  function reset() {
    setRoom("")
    setPatientName("")
    setNote("")
    setSaved(false)
    setError("")
  }

  async function submit() {
    setError("")
    if (!note.trim()) return setError("Please enter a note.")
    if (!nurseName.trim()) return setError("Please enter your name.")
    setBusy(true)
    try {
      const res = await fetch("/api/note", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room, patientName, note, nurseName }),
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
    <MobilePage title="Patient Note" subtitle="Record an observation" accent="bg-indigo-700">
      {saved ? (
        <SavedScreen onAgain={reset} />
      ) : (
        <>
          <ErrorNote error={error} />
          <RoomPatientFields room={room} setRoom={setRoom} patientName={patientName} setPatientName={setPatientName} />
          <TextArea label="Note" value={note} onChange={setNote} placeholder="What did you observe?" rows={5} required />
          <NurseNameField value={nurseName} onChange={setNurseName} />
          <SubmitBar onSubmit={submit} busy={busy} label="Save note" />
        </>
      )}
    </MobilePage>
  )
}
