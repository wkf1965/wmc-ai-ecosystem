"use client"

import { useState } from "react"
import {
  ErrorNote,
  Field,
  MobilePage,
  NurseNameField,
  RoomPatientFields,
  SavedScreen,
  SelectField,
  SubmitBar,
  TextArea,
  useNurseName,
} from "../../../components/mobile/MobileForm"

const ITEM_OPTIONS = [
  { value: "Pampers", label: "Pampers" },
  { value: "Wet tissue", label: "Wet tissue" },
  { value: "Gloves", label: "Gloves" },
  { value: "Mask", label: "Mask" },
  { value: "Gauze", label: "Gauze" },
  { value: "Dressing set", label: "Dressing set" },
  { value: "others", label: "Others" },
]

export default function MobileInventoryPage() {
  const [room, setRoom] = useState("")
  const [patientName, setPatientName] = useState("")
  const [itemName, setItemName] = useState("Pampers")
  const [customItem, setCustomItem] = useState("")
  const [quantityUsed, setQuantityUsed] = useState("1")
  const [purpose, setPurpose] = useState("")
  const [nurseName, setNurseName] = useNurseName()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  function reset() {
    setRoom("")
    setPatientName("")
    setItemName("Pampers")
    setCustomItem("")
    setQuantityUsed("1")
    setPurpose("")
    setSaved(false)
    setError("")
  }

  async function submit() {
    setError("")
    const resolvedItem = itemName === "others" ? customItem.trim() : itemName
    const qty = Number(quantityUsed)
    if (!room.trim()) return setError("Please enter the room.")
    if (!resolvedItem) return setError("Please enter the item name.")
    if (!Number.isFinite(qty) || qty <= 0) return setError("Quantity used must be greater than 0.")
    if (!nurseName.trim()) return setError("Please enter your name.")
    setBusy(true)
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemName: resolvedItem,
          quantityChange: qty,
          actionType: "used",
          room,
          patientName,
          personInCharge: nurseName,
          purpose,
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
    <MobilePage title="Inventory Usage" subtitle="Record items used" accent="bg-amber-600">
      {saved ? (
        <SavedScreen onAgain={reset} />
      ) : (
        <>
          <ErrorNote error={error} />
          <RoomPatientFields room={room} setRoom={setRoom} patientName={patientName} setPatientName={setPatientName} />
          <SelectField label="Item" value={itemName} onChange={setItemName} options={ITEM_OPTIONS} required />
          {itemName === "others" ? (
            <Field label="Item name" value={customItem} onChange={setCustomItem} placeholder="Type item name" required />
          ) : null}
          <Field label="Quantity used" value={quantityUsed} onChange={setQuantityUsed} placeholder="e.g. 2" inputMode="numeric" required />
          <TextArea label="Purpose" value={purpose} onChange={setPurpose} placeholder="Optional — what it was used for" />
          <NurseNameField value={nurseName} onChange={setNurseName} />
          <SubmitBar onSubmit={submit} busy={busy} label="Save usage" />
        </>
      )}
    </MobilePage>
  )
}
