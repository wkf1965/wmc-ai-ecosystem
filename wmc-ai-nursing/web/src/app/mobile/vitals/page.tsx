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

export default function MobileVitalsPage() {
  const [room, setRoom] = useState("")
  const [patientName, setPatientName] = useState("")
  const [temperature, setTemperature] = useState("")
  const [bloodPressure, setBloodPressure] = useState("")
  const [pulse, setPulse] = useState("")
  const [spo2, setSpo2] = useState("")
  const [glucose, setGlucose] = useState("")
  const [remark, setRemark] = useState("")
  const [nurseName, setNurseName] = useNurseName()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  function reset() {
    setRoom("")
    setPatientName("")
    setTemperature("")
    setBloodPressure("")
    setPulse("")
    setSpo2("")
    setGlucose("")
    setRemark("")
    setSaved(false)
    setError("")
  }

  async function submit() {
    setError("")
    if (!room.trim()) return setError("Please enter the room.")
    if (!nurseName.trim()) return setError("Please enter your name.")
    setBusy(true)
    try {
      const res = await fetch("/api/vitals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          room,
          patientName,
          temperature,
          bloodPressure,
          pulse,
          spo2,
          glucose,
          remark,
          nurseName,
        }),
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
    <MobilePage title="Vital Signs" subtitle="Record patient vitals" accent="bg-rose-600">
      {saved ? (
        <SavedScreen onAgain={reset} />
      ) : (
        <>
          <ErrorNote error={error} />
          <RoomPatientFields room={room} setRoom={setRoom} patientName={patientName} setPatientName={setPatientName} />
          <Field label="Temperature (°C)" value={temperature} onChange={setTemperature} placeholder="e.g. 36.8" inputMode="decimal" />
          <Field label="Blood pressure" value={bloodPressure} onChange={setBloodPressure} placeholder="e.g. 120/80" />
          <Field label="Pulse (bpm)" value={pulse} onChange={setPulse} placeholder="e.g. 78" inputMode="numeric" />
          <Field label="SpO2 (%)" value={spo2} onChange={setSpo2} placeholder="e.g. 98" inputMode="numeric" />
          <Field label="Glucose (mmol/L)" value={glucose} onChange={setGlucose} placeholder="e.g. 5.6" inputMode="decimal" />
          <TextArea label="Remark" value={remark} onChange={setRemark} placeholder="Optional notes" />
          <NurseNameField value={nurseName} onChange={setNurseName} />
          <SubmitBar onSubmit={submit} busy={busy} label="Save vitals" />
        </>
      )}
    </MobilePage>
  )
}
