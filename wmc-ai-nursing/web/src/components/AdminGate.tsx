"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Lock } from "lucide-react"
import { getRole, setRole, verifyAdminPin, ROLE_CHANGE_EVENT, type AppRole } from "../lib/roleMode"

/**
 * Blocks a management page unless the current role is "admin".
 * Renders a full-screen overlay with a PIN unlock when access is denied.
 * Placed as the first child inside a page; renders nothing for admins.
 */
export default function AdminGate({ pageName }: { pageName: string }) {
  // Start as null → treat as locked until we confirm role on the client,
  // so protected content is never briefly exposed.
  const [role, setRoleState] = useState<AppRole | null>(null)
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    const sync = () => setRoleState(getRole())
    sync()
    window.addEventListener(ROLE_CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(ROLE_CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  if (role === "admin") return null

  function unlock() {
    if (verifyAdminPin(pin)) {
      setRole("admin")
      setError("")
    } else {
      setError("Incorrect PIN.")
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/95 p-6">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <span className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <Lock className="h-7 w-7" />
        </span>
        <h2 className="text-xl font-bold text-slate-900">Admin access required</h2>
        <p className="mt-1 text-sm text-slate-500">
          {pageName} is a management page. Enter the admin PIN to continue.
        </p>

        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") unlock()
          }}
          placeholder="Admin PIN"
          className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg tracking-widest"
        />
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

        <button
          type="button"
          onClick={unlock}
          className="mt-3 min-h-[52px] w-full rounded-2xl bg-slate-900 text-base font-semibold text-white active:scale-[0.98]"
        >
          Unlock
        </button>
        <Link
          href="/nurse"
          className="mt-3 inline-block text-sm font-semibold text-slate-500 underline"
        >
          Back to Nurse Mode
        </Link>
      </div>
    </div>
  )
}
