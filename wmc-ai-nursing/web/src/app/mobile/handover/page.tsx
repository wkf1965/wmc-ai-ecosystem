"use client"

import { useState } from "react"
import {
  ErrorNote,
  MobilePage,
  NurseNameField,
  SavedScreen,
  SelectField,
  SubmitBar,
  TextArea,
  useNurseName,
} from "../../../components/mobile/MobileForm"

const SHIFTS = [
  { value: "Morning", label: "Morning" },
  { value: "Evening", label: "Evening" },
  { value: "Night", label: "Night" },
]

export default function MobileHandoverPage() {
  const [shift, setShift] = useState("Morning")
  const [summary, setSummary] = useState("")
  const [concerns, setConcerns] = useState("")
  const [urgentFollowUp, setUrgentFollowUp] = useState("")
  const [nurseName, setNurseName] = useNurseName()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  function reset() {
    setShift("Morning")
    setSummary("")
    setConcerns("")
    setUrgentFollowUp("")
    setSaved(false)
    setError("")
  }

  async function submit() {
    setError("")
    if (!nurseName.trim()) return setError("Please enter your name.")
    if (!summary.trim()) return setError("Please enter a handover summary.")
    setBusy(true)
    try {
      const res = await fetch("/api/handover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shift, nurseName, summary, concerns, urgentFollowUp }),
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
    <MobilePage title="Shift Handover" subtitle="Pass on the shift" accent="bg-teal-700">
      {saved ? (
        <SavedScreen onAgain={reset} />
      ) : (
        <>
          <ErrorNote error={error} />
          <SelectField label="Shift" value={shift} onChange={setShift} options={SHIFTS} required />
          <NurseNameField value={nurseName} onChange={setNurseName} />
          <TextArea label="Summary" value={summary} onChange={setSummary} placeholder="Overview of the shift" rows={4} required />
          <TextArea label="Concerns" value={concerns} onChange={setConcerns} placeholder="Anything to watch" rows={3} />
          <TextArea label="Urgent follow up" value={urgentFollowUp} onChange={setUrgentFollowUp} placeholder="Needs immediate action" rows={3} />
          <SubmitBar onSubmit={submit} busy={busy} label="Save handover" />
        </>
      )}
    </MobilePage>
  )
}
