"use client"

import { useState } from "react"
import { Camera } from "lucide-react"
import {
  ChoiceChips,
  ErrorNote,
  MobilePage,
  NurseNameField,
  RoomPatientFields,
  SavedScreen,
  SubmitBar,
  useNurseName,
} from "../../../components/mobile/MobileForm"

const POSITIONS = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "supine", label: "Supine" },
]

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Could not read photo."))
    reader.readAsDataURL(file)
  })
}

export default function MobileTurningPage() {
  const [room, setRoom] = useState("")
  const [patientName, setPatientName] = useState("")
  const [position, setPosition] = useState("left")
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState("")
  const [nurseName, setNurseName] = useNurseName()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  function reset() {
    setRoom("")
    setPatientName("")
    setPosition("left")
    setPhoto(null)
    setPhotoPreview("")
    setSaved(false)
    setError("")
  }

  async function onPhotoChange(file: File | null) {
    setPhoto(file)
    if (file) {
      try {
        setPhotoPreview(await fileToBase64(file))
      } catch {
        setPhotoPreview("")
      }
    } else {
      setPhotoPreview("")
    }
  }

  async function submit() {
    setError("")
    if (!room.trim()) return setError("Please enter the room.")
    if (!position) return setError("Please select a position.")
    if (!nurseName.trim()) return setError("Please enter your name.")
    setBusy(true)
    try {
      let photoBase64 = ""
      let photoName = ""
      if (photo) {
        photoBase64 = await fileToBase64(photo)
        photoName = photo.name
      }
      const res = await fetch("/api/turning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room, patientName, position, nurseName, photoBase64, photoName }),
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
    <MobilePage title="Side Turning" subtitle="Record a turn" accent="bg-sky-700">
      {saved ? (
        <SavedScreen onAgain={reset} />
      ) : (
        <>
          <ErrorNote error={error} />
          <RoomPatientFields room={room} setRoom={setRoom} patientName={patientName} setPatientName={setPatientName} />
          <ChoiceChips label="Position" value={position} onChange={setPosition} options={POSITIONS} required />

          <div className="mb-4">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Photo (optional)</span>
            <label className="flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-400 bg-white px-4 py-3 text-base font-semibold text-slate-600 active:scale-[0.98]">
              <Camera className="h-5 w-5" />
              {photo ? "Change photo" : "Take / upload photo"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => void onPhotoChange(e.target.files?.[0] || null)}
              />
            </label>
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="Turning preview" className="mt-3 max-h-56 w-full rounded-xl object-cover" />
            ) : null}
          </div>

          <NurseNameField value={nurseName} onChange={setNurseName} />
          <SubmitBar onSubmit={submit} busy={busy} label="Save turning" />
        </>
      )}
    </MobilePage>
  )
}
