"use client"

export type AppRole = "nurse" | "admin"

const ROLE_KEY = "wmc_role"
const NAME_KEY = "wmc_nurse_name"

export const ROLE_CHANGE_EVENT = "wmc-role-change"

// Frontend-only admin gate. Override with NEXT_PUBLIC_ADMIN_PIN at build time.
const ADMIN_PIN = String(process.env.NEXT_PUBLIC_ADMIN_PIN || "1234").trim()

export function getRole(): AppRole {
  if (typeof window === "undefined") return "nurse"
  return window.localStorage.getItem(ROLE_KEY) === "admin" ? "admin" : "nurse"
}

export function setRole(role: AppRole) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(ROLE_KEY, role)
  window.dispatchEvent(new Event(ROLE_CHANGE_EVENT))
}

export function verifyAdminPin(pin: string): boolean {
  return String(pin).trim() === ADMIN_PIN && ADMIN_PIN.length > 0
}

export function getNurseName(): string {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem(NAME_KEY) || ""
}

export function setNurseName(name: string) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(NAME_KEY, String(name).trim())
  window.dispatchEvent(new Event(ROLE_CHANGE_EVENT))
}
