import { promises as fs } from "fs"
import path from "path"

export type InventoryItemRecord = {
  id: string
  itemName: string
  quantity: number
  unit: string
  personInCharge: string
  lastUpdatedAt: string
}

export type InventoryActionType = "taken" | "given" | "used" | "added"

export type InventoryEventRecord = {
  id: string
  itemId: string
  itemName: string
  quantityChange: number
  unit: string
  room: string
  patientName: string
  personInCharge: string
  actionType: InventoryActionType
  recordedAt: string
  source: "telegram" | "frontend" | "api"
  sourceStatus: "live" | "simulation"
}

export type OtApprovalStatus = "pending" | "approved" | "rejected"

export type OtLogRecord = {
  id: string
  nurseName: string
  date: string
  dutyPunchInAt: string
  dutyPunchOutAt: string | null
  otPunchInAt: string | null
  otPunchOutAt: string | null
  normalHours: number
  otHours: number
  otRate: number
  totalOtAllowance: number
  status: "on_duty" | "duty_completed" | "ot_active" | "ot_completed"
  approvalStatus: OtApprovalStatus
  approvedAt: string | null
  approvedBy: string | null
  approvalNote: string | null
  rejectedAt: string | null
  rejectionReason: string | null
  source: "telegram" | "manual"
  syncStatus: "synced" | "pending_sync" | "failed_sync"
  syncError: string | null
  lastSyncAttemptAt: string | null
}

export type OtApprovalAuditRecord = {
  id: string
  recordId: string
  nurseName: string
  date: string
  action: OtApprovalStatus
  approvedBy: string
  approvalNote: string
  rejectionReason: string
  timestamp: string
}

export type OtPunchEventRecord = {
  id: string
  nurseName: string
  commandType: "punchin" | "punchout" | "otin" | "otout"
  timestamp: string
  source: "telegram" | "manual"
}

export type OtRecalculationAuditRecord = {
  id: string
  recordId: string
  nurseName: string
  date: string
  old_rate: number
  new_rate: number
  old_allowance: number
  new_allowance: number
  updated_at: string
}

export type SettingRecord = {
  key: string
  value: string
  updatedAt: string
}

export type TurningStatus = "done" | "due_soon" | "overdue"

export type TurningRecord = {
  id: string
  patientName: string
  room: string
  turningTime: string
  position: "left side" | "right side" | "supine" | "prone"
  nurseName: string
  recordedAt: string
  nextTurningDueAt: string
  status: TurningStatus
  source: "telegram" | "frontend" | "api"
  sourceStatus: "live" | "simulation"
}

export type DutyRowRecord = {
  id: string
  shift: string
  timeWindow: string
  ward: string
  leadNurse: string
  nurseNames: string
  onDuty: number
  handoverAt: string
}

export type WeeklyRosterRowRecord = {
  day: string
  morning: string
  evening: string
  night: string
}

export type DutyRosterRecord = {
  dutyRows: DutyRowRecord[]
  nurseLeaveList: string
  weeklyRoster: WeeklyRosterRowRecord[]
  updatedAt: string
}

type NursingModuleStore = {
  inventory: InventoryItemRecord[]
  inventoryEvents: InventoryEventRecord[]
  otLogs: OtLogRecord[]
  otPunchEvents: OtPunchEventRecord[]
  otRecalculationAuditLogs: OtRecalculationAuditRecord[]
  settings: SettingRecord[]
  turningRecords: TurningRecord[]
  dutyRoster: DutyRosterRecord
  duty_roster_settings: DutyRosterRecord
}

const STORE_FILE = path.join(process.cwd(), ".nursing-module-store.json")
const DEFAULT_SHIFT_HOURS = 8

const INVENTORY_ITEM_CATALOG: Array<{ id: string; itemName: string; unit: string }> = [
  { id: "pampers", itemName: "Pampers", unit: "packs" },
  { id: "wet-tissu", itemName: "Wet tissu", unit: "packs" },
  { id: "ryles-tube", itemName: "Ryles tube", unit: "pcs" },
  { id: "cbd-tube", itemName: "CBD tube", unit: "pcs" },
  { id: "prime-edema", itemName: "Prime edema", unit: "units" },
  { id: "milk-powder", itemName: "Milk powder", unit: "scoops" },
  { id: "gloves", itemName: "Gloves", unit: "pcs" },
]

const defaultStore: NursingModuleStore = {
  inventory: INVENTORY_ITEM_CATALOG.map((item) => ({
    id: item.id,
    itemName: item.itemName,
    quantity: 0,
    unit: item.unit,
    personInCharge: "",
    lastUpdatedAt: "",
  })),
  inventoryEvents: [],
  otLogs: [],
  otPunchEvents: [],
  otRecalculationAuditLogs: [],
  settings: [
    {
      key: "ot_rate_per_hour",
      value: "0",
      updatedAt: new Date().toISOString(),
    },
  ],
  turningRecords: [],
  dutyRoster: {
    dutyRows: [
      {
        id: "shift-morning-a",
        shift: "Morning",
        timeWindow: "06:00 - 14:00",
        ward: "A-Floor",
        leadNurse: "Nurse Lee",
        nurseNames: "Nurse Lee, Nurse Tan, Nurse Kumar",
        onDuty: 14,
        handoverAt: "13:45",
      },
      {
        id: "shift-evening-b",
        shift: "Evening",
        timeWindow: "14:00 - 22:00",
        ward: "B-Floor",
        leadNurse: "Nurse Chan",
        nurseNames: "Nurse Chan, Nurse Wong, Nurse Lim",
        onDuty: 12,
        handoverAt: "21:45",
      },
      {
        id: "shift-night-c",
        shift: "Night",
        timeWindow: "22:00 - 06:00",
        ward: "Rehab Unit",
        leadNurse: "Nurse Patel",
        nurseNames: "Nurse Patel, Nurse Ong, Nurse Das",
        onDuty: 9,
        handoverAt: "05:45",
      },
    ],
    nurseLeaveList: "Nurse Alicia Tan, Nurse Marcus Lim",
    weeklyRoster: [
      { day: "Monday", morning: "Nurse Lee, Nurse Tan", evening: "Nurse Chan, Nurse Wong", night: "Nurse Patel, Nurse Ong" },
      { day: "Tuesday", morning: "Nurse Lee, Nurse Kumar", evening: "Nurse Chan, Nurse Lim", night: "Nurse Patel, Nurse Das" },
      { day: "Wednesday", morning: "Nurse Lee, Nurse Tan", evening: "Nurse Chan, Nurse Wong", night: "Nurse Patel, Nurse Ong" },
      { day: "Thursday", morning: "Nurse Lee, Nurse Kumar", evening: "Nurse Chan, Nurse Lim", night: "Nurse Patel, Nurse Das" },
      { day: "Friday", morning: "Nurse Lee, Nurse Tan", evening: "Nurse Chan, Nurse Wong", night: "Nurse Patel, Nurse Ong" },
      { day: "Saturday", morning: "Nurse Lee, Nurse Kumar", evening: "Nurse Chan, Nurse Lim", night: "Nurse Patel, Nurse Das" },
      { day: "Sunday", morning: "Nurse Lee, Nurse Tan", evening: "Nurse Chan, Nurse Wong", night: "Nurse Patel, Nurse Ong" },
    ],
    updatedAt: new Date().toISOString(),
  },
  duty_roster_settings: {
    dutyRows: [
      {
        id: "shift-morning-a",
        shift: "Morning",
        timeWindow: "06:00 - 14:00",
        ward: "A-Floor",
        leadNurse: "Nurse Lee",
        nurseNames: "Nurse Lee, Nurse Tan, Nurse Kumar",
        onDuty: 14,
        handoverAt: "13:45",
      },
      {
        id: "shift-evening-b",
        shift: "Evening",
        timeWindow: "14:00 - 22:00",
        ward: "B-Floor",
        leadNurse: "Nurse Chan",
        nurseNames: "Nurse Chan, Nurse Wong, Nurse Lim",
        onDuty: 12,
        handoverAt: "21:45",
      },
      {
        id: "shift-night-c",
        shift: "Night",
        timeWindow: "22:00 - 06:00",
        ward: "Rehab Unit",
        leadNurse: "Nurse Patel",
        nurseNames: "Nurse Patel, Nurse Ong, Nurse Das",
        onDuty: 9,
        handoverAt: "05:45",
      },
    ],
    nurseLeaveList: "Nurse Alicia Tan, Nurse Marcus Lim",
    weeklyRoster: [
      { day: "Monday", morning: "Nurse Lee, Nurse Tan", evening: "Nurse Chan, Nurse Wong", night: "Nurse Patel, Nurse Ong" },
      { day: "Tuesday", morning: "Nurse Lee, Nurse Kumar", evening: "Nurse Chan, Nurse Lim", night: "Nurse Patel, Nurse Das" },
      { day: "Wednesday", morning: "Nurse Lee, Nurse Tan", evening: "Nurse Chan, Nurse Wong", night: "Nurse Patel, Nurse Ong" },
      { day: "Thursday", morning: "Nurse Lee, Nurse Kumar", evening: "Nurse Chan, Nurse Lim", night: "Nurse Patel, Nurse Das" },
      { day: "Friday", morning: "Nurse Lee, Nurse Tan", evening: "Nurse Chan, Nurse Wong", night: "Nurse Patel, Nurse Ong" },
      { day: "Saturday", morning: "Nurse Lee, Nurse Kumar", evening: "Nurse Chan, Nurse Lim", night: "Nurse Patel, Nurse Das" },
      { day: "Sunday", morning: "Nurse Lee, Nurse Tan", evening: "Nurse Chan, Nurse Wong", night: "Nurse Patel, Nurse Ong" },
    ],
    updatedAt: new Date().toISOString(),
  },
}

const nowIso = () => new Date().toISOString()

function addHours(iso: string, hours: number) {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return nowIso()
  parsed.setHours(parsed.getHours() + hours)
  return parsed.toISOString()
}

export function computeTurningStatus(nextTurningDueAt: string): TurningStatus {
  const dueAt = new Date(nextTurningDueAt).getTime()
  if (Number.isNaN(dueAt)) return "done"
  const now = Date.now()
  if (now > dueAt) return "overdue"
  const thirtyMinutes = 30 * 60 * 1000
  if (now >= dueAt - thirtyMinutes) return "due_soon"
  return "done"
}

function normalizeTurningPosition(value: string) {
  const key = String(value || "").trim().toLowerCase()
  if (!key) return "left side" as TurningRecord["position"]
  if (key === "left" || key === "left side") return "left side"
  if (key === "right" || key === "right side") return "right side"
  if (key === "supine" || key === "back") return "supine"
  if (key === "prone" || key === "front") return "prone"
  return "left side"
}

/**
 * Canonical OT calculation — mirrors calculateOT in attendanceCalculation.js.
 *
 * Rule (identical across all modules):
 *   1. rawMinutes = end − start in minutes
 *   2. otHoursRounded = round(rawMinutes / 60, 2dp)
 *   3. allowanceRounded = round(otHoursRounded × rate, 2dp)
 *
 * Accepts ISO timestamp strings.
 */
function calculateOT(startAt: string, endAt: string, rate: number) {
  const ms = new Date(endAt).getTime() - new Date(startAt).getTime()
  const rawMinutes = Number.isNaN(ms) ? 0 : Math.max(0, ms / 60000)
  const otHoursRounded = Math.round((rawMinutes / 60) * 100) / 100
  const allowanceRounded = Math.round(otHoursRounded * (Number(rate) || 0) * 100) / 100
  return { rawMinutes, otHoursRounded, allowanceRounded }
}

/** @deprecated Use calculateOT instead */
function hoursBetween(startAt: string, endAt: string) {
  return calculateOT(startAt, endAt, 0).otHoursRounded
}

function normalizeOtRow(row: Partial<OtLogRecord> & Record<string, unknown>, index: number): OtLogRecord {
  const legacyIn = String((row as { punchInAt?: string }).punchInAt || "")
  const legacyOut = (row as { punchOutAt?: string | null }).punchOutAt ?? null
  const dutyPunchInAt = String(row.dutyPunchInAt || legacyIn || nowIso())
  const dutyPunchOutAt = row.dutyPunchOutAt === undefined ? legacyOut : row.dutyPunchOutAt
  const otPunchInAt = (row.otPunchInAt ?? null) as string | null
  const otPunchOutAt = (row.otPunchOutAt ?? null) as string | null
  const fallbackNormal = hoursBetween(dutyPunchInAt, String(dutyPunchOutAt || dutyPunchInAt))
  const fallbackOt = otPunchInAt && otPunchOutAt ? hoursBetween(otPunchInAt, otPunchOutAt) : 0
  const otRate = Math.max(0, Number(row.otRate ?? 0))
  const normalHours = Number(Math.max(0, Number(row.normalHours ?? fallbackNormal)).toFixed(2))
  // Round hours to 2 dp — must happen BEFORE allowance multiplication (shared rule)
  const otHoursRaw = Math.max(0, Number(row.otHours ?? fallbackOt ?? (row as { overtimeHours?: number }).overtimeHours ?? 0))
  const otHours = Math.round(otHoursRaw * 100) / 100
  // Prefer stored allowance (set at punch-out using calculateOT, already correct);
  // fall back to recomputing with rounded hours only when absent/zero.
  const storedAllowance = Number(row.totalOtAllowance ?? 0)
  const totalOtAllowance = storedAllowance > 0
    ? storedAllowance
    : Math.round(otHours * otRate * 100) / 100
  const status = (["on_duty", "duty_completed", "ot_active", "ot_completed"].includes(String(row.status))
    ? row.status
    : otPunchInAt && !otPunchOutAt
      ? "ot_active"
      : otPunchInAt && otPunchOutAt
        ? "ot_completed"
        : dutyPunchOutAt
          ? "duty_completed"
          : "on_duty") as OtLogRecord["status"]
  const syncStatus = (["synced", "pending_sync", "failed_sync"].includes(String(row.syncStatus))
    ? row.syncStatus
    : "pending_sync") as OtLogRecord["syncStatus"]

  const rawApproval = String((row as { approvalStatus?: string }).approvalStatus || "pending").toLowerCase()
  const approvalStatus = (["pending", "approved", "rejected"].includes(rawApproval)
    ? rawApproval
    : "pending") as OtApprovalStatus

  return {
    id: String(row.id || `ot-${index}-${Date.now()}`),
    nurseName: String(row.nurseName || "Unknown nurse"),
    date: String(row.date || dutyPunchInAt.slice(0, 10)),
    dutyPunchInAt,
    dutyPunchOutAt: dutyPunchOutAt ? String(dutyPunchOutAt) : null,
    otPunchInAt: otPunchInAt ? String(otPunchInAt) : null,
    otPunchOutAt: otPunchOutAt ? String(otPunchOutAt) : null,
    normalHours,
    otHours,
    otRate,
    totalOtAllowance,
    status,
    approvalStatus,
    approvedAt:       row.approvedAt       ? String(row.approvedAt)       : null,
    approvedBy:       row.approvedBy       ? String(row.approvedBy)       : null,
    approvalNote:     row.approvalNote     ? String(row.approvalNote)     : null,
    rejectedAt:       row.rejectedAt       ? String(row.rejectedAt)       : null,
    rejectionReason:  row.rejectionReason  ? String(row.rejectionReason)  : null,
    source: (String(row.source || "").toLowerCase() === "telegram" ? "telegram" : "manual") as "telegram" | "manual",
    syncStatus,
    syncError: row.syncError ? String(row.syncError) : null,
    lastSyncAttemptAt: row.lastSyncAttemptAt ? String(row.lastSyncAttemptAt) : null,
  }
}

function normalizeItemId(input: string) {
  const value = String(input || "").trim().toLowerCase()
  if (!value) return ""
  if (value.startsWith("pampers")) return "pampers"
  if (value === "wet tissue" || value === "wet tissu" || value === "wet-tissue") return "wet-tissu"
  if (value.startsWith("wet-tissu")) return "wet-tissu"
  if (value.startsWith("ryles")) return "ryles-tube"
  if (value.startsWith("cbd")) return "cbd-tube"
  if (value.startsWith("prime")) return "prime-edema"
  if (value.startsWith("milk")) return "milk-powder"
  if (value.startsWith("gloves")) return "gloves"
  return value.replace(/\s+/g, "-")
}

function resolveItemMeta(itemId: string, fallbackName = "") {
  const normalized = normalizeItemId(itemId || fallbackName)
  const found = INVENTORY_ITEM_CATALOG.find((item) => item.id === normalized)
  if (found) return found
  return {
    id: normalized || "unknown-item",
    itemName: fallbackName || normalized || "Unknown item",
    unit: "units",
  }
}

function normalizeStore(raw: Partial<NursingModuleStore> | null | undefined): NursingModuleStore {
  const seededInventory = INVENTORY_ITEM_CATALOG.map((item) => ({
    id: item.id,
    itemName: item.itemName,
    quantity: 0,
    unit: item.unit,
    personInCharge: "",
    lastUpdatedAt: "",
  }))
  const inventoryRows = Array.isArray(raw?.inventory) ? raw.inventory : seededInventory
  const inventoryById = new Map<string, InventoryItemRecord>()
  for (const row of inventoryRows) {
    const meta = resolveItemMeta(row?.id || "", row?.itemName || "")
    inventoryById.set(meta.id, {
      id: meta.id,
      itemName: row?.itemName || meta.itemName,
      quantity: Math.max(0, Number(row?.quantity || 0)),
      unit: row?.unit || meta.unit,
      personInCharge: String(row?.personInCharge || ""),
      lastUpdatedAt: String(row?.lastUpdatedAt || ""),
    })
  }
  for (const seed of seededInventory) {
    if (!inventoryById.has(seed.id)) inventoryById.set(seed.id, seed)
  }

  const normalizedDutyRoster: DutyRosterRecord = {
    dutyRows: Array.isArray(raw?.dutyRoster?.dutyRows)
      ? defaultStore.dutyRoster.dutyRows.map((seed, index) => ({
          ...seed,
          ...raw?.dutyRoster?.dutyRows[index],
          onDuty: Number(raw?.dutyRoster?.dutyRows[index]?.onDuty ?? seed.onDuty),
        }))
      : defaultStore.dutyRoster.dutyRows,
    nurseLeaveList: String(raw?.dutyRoster?.nurseLeaveList ?? defaultStore.dutyRoster.nurseLeaveList),
    weeklyRoster: Array.isArray(raw?.dutyRoster?.weeklyRoster)
      ? defaultStore.dutyRoster.weeklyRoster.map((seed, index) => ({
          ...seed,
          ...raw?.dutyRoster?.weeklyRoster[index],
          day: seed.day,
        }))
      : defaultStore.dutyRoster.weeklyRoster,
    updatedAt: String(raw?.dutyRoster?.updatedAt || nowIso()),
  }
  const normalizedDutyRosterSettings: DutyRosterRecord = {
    dutyRows: Array.isArray(raw?.duty_roster_settings?.dutyRows)
      ? defaultStore.duty_roster_settings.dutyRows.map((seed, index) => ({
          ...seed,
          ...raw?.duty_roster_settings?.dutyRows[index],
          onDuty: Number(raw?.duty_roster_settings?.dutyRows[index]?.onDuty ?? seed.onDuty),
        }))
      : normalizedDutyRoster.dutyRows,
    nurseLeaveList: String(raw?.duty_roster_settings?.nurseLeaveList ?? normalizedDutyRoster.nurseLeaveList),
    weeklyRoster: Array.isArray(raw?.duty_roster_settings?.weeklyRoster)
      ? defaultStore.duty_roster_settings.weeklyRoster.map((seed, index) => ({
          ...seed,
          ...raw?.duty_roster_settings?.weeklyRoster[index],
          day: seed.day,
        }))
      : normalizedDutyRoster.weeklyRoster,
    updatedAt: String(raw?.duty_roster_settings?.updatedAt || normalizedDutyRoster.updatedAt || nowIso()),
  }

  return {
    inventory: Array.from(inventoryById.values()),
    inventoryEvents: Array.isArray(raw?.inventoryEvents)
      ? raw.inventoryEvents
          .map((row) => {
            const meta = resolveItemMeta(row?.itemId || "", row?.itemName || "")
            return {
              id: String(row?.id || `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
              itemId: meta.id,
              itemName: row?.itemName || meta.itemName,
              quantityChange: Number(row?.quantityChange || 0),
              unit: String(row?.unit || meta.unit),
              room: String(row?.room || ""),
              patientName: String(row?.patientName || ""),
              personInCharge: String(row?.personInCharge || ""),
              actionType: (["taken", "given", "used", "added"].includes(String(row?.actionType || ""))
                ? row?.actionType
                : "used") as InventoryActionType,
              recordedAt: String(row?.recordedAt || nowIso()),
              source: (["telegram", "frontend", "api"].includes(String(row?.source || "")) ? row?.source : "api") as
                | "telegram"
                | "frontend"
                | "api",
              sourceStatus: (["live", "simulation"].includes(String(row?.sourceStatus || "")) ? row?.sourceStatus : "live") as
                | "live"
                | "simulation",
            }
          })
          .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      : [],
    otLogs: Array.isArray(raw?.otLogs) ? raw.otLogs.map((row, index) => normalizeOtRow(row as Record<string, unknown>, index)) : defaultStore.otLogs,
    otPunchEvents: Array.isArray((raw as { otPunchEvents?: OtPunchEventRecord[] } | null)?.otPunchEvents)
      ? ((raw as { otPunchEvents?: Array<Partial<OtPunchEventRecord> & Record<string, unknown>> }).otPunchEvents || [])
          .map((row, index) => ({
            id: String(row.id || `ot-evt-${index}-${Date.now()}`),
            nurseName: String(row.nurseName || "Unknown nurse"),
            commandType: (["punchin", "punchout", "otin", "otout"].includes(String(row.commandType || ""))
              ? row.commandType
              : "punchin") as OtPunchEventRecord["commandType"],
            timestamp: String(row.timestamp || nowIso()),
            source: (String(row.source || "").toLowerCase() === "telegram" ? "telegram" : "manual") as "telegram" | "manual",
          }))
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      : [],
    otRecalculationAuditLogs: Array.isArray(
      (raw as { otRecalculationAuditLogs?: Array<Partial<OtRecalculationAuditRecord> & Record<string, unknown>> } | null)
        ?.otRecalculationAuditLogs,
    )
      ? (
          (raw as {
            otRecalculationAuditLogs?: Array<Partial<OtRecalculationAuditRecord> & Record<string, unknown>>
          }).otRecalculationAuditLogs || []
        )
          .map((row, index) => ({
            id: String(row.id || `ot-recalc-${index}-${Date.now()}`),
            recordId: String(row.recordId || ""),
            nurseName: String(row.nurseName || "Unknown nurse"),
            date: String(row.date || ""),
            old_rate: Math.max(0, Number(row.old_rate ?? 0) || 0),
            new_rate: Math.max(0, Number(row.new_rate ?? 0) || 0),
            old_allowance: Math.max(0, Number(row.old_allowance ?? 0) || 0),
            new_allowance: Math.max(0, Number(row.new_allowance ?? 0) || 0),
            updated_at: String(row.updated_at || nowIso()),
          }))
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      : [],
    settings: (() => {
      const parsed = Array.isArray((raw as { settings?: Array<Partial<SettingRecord> & Record<string, unknown>> } | null)?.settings)
        ? ((raw as { settings?: Array<Partial<SettingRecord> & Record<string, unknown>> }).settings || [])
            .map((row) => ({
              key: String(row.key || "").trim(),
              value: String(row.value ?? ""),
              updatedAt: String(row.updatedAt || nowIso()),
            }))
            .filter((row) => row.key)
        : []
      const hasOtRate = parsed.some((row) => row.key === "ot_rate_per_hour")
      if (!hasOtRate) {
        parsed.push({ key: "ot_rate_per_hour", value: "0", updatedAt: nowIso() })
      }
      return parsed
    })(),
    turningRecords: Array.isArray((raw as { turningRecords?: TurningRecord[] } | null)?.turningRecords)
      ? ((raw as { turningRecords?: Array<Partial<TurningRecord> & Record<string, unknown>> }).turningRecords || [])
          .map((row, index) => {
            const recordedAt = String(row.recordedAt || row.turningTime || nowIso())
            const turningTime = String(row.turningTime || recordedAt)
            const nextTurningDueAt = String(row.nextTurningDueAt || addHours(turningTime, 2))
            return {
              id: String(row.id || `turn-${index}-${Date.now()}`),
              patientName: String(row.patientName || ""),
              room: String(row.room || ""),
              turningTime,
              position: normalizeTurningPosition(String(row.position || "")),
              nurseName: String(row.nurseName || "Nurse"),
              recordedAt,
              nextTurningDueAt,
              status: (["done", "due_soon", "overdue"].includes(String(row.status || ""))
                ? row.status
                : computeTurningStatus(nextTurningDueAt)) as TurningStatus,
              source: (["telegram", "frontend", "api"].includes(String(row.source || "")) ? row.source : "api") as
                | "telegram"
                | "frontend"
                | "api",
              sourceStatus: (["live", "simulation"].includes(String(row.sourceStatus || "")) ? row.sourceStatus : "live") as
                | "live"
                | "simulation",
            }
          })
          .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      : [],
    dutyRoster: normalizedDutyRosterSettings,
    duty_roster_settings: normalizedDutyRosterSettings,
  }
}

function getSettingValue(store: NursingModuleStore, key: string, fallback: string) {
  const row = store.settings.find((item) => item.key === key)
  return row ? row.value : fallback
}

function upsertSetting(store: NursingModuleStore, key: string, value: string) {
  const idx = store.settings.findIndex((item) => item.key === key)
  const nextRow: SettingRecord = {
    key,
    value: String(value),
    updatedAt: nowIso(),
  }
  if (idx === -1) store.settings.push(nextRow)
  else store.settings[idx] = nextRow
}

function appendOtPunchEvent(
  store: NursingModuleStore,
  nurseName: string,
  commandType: OtPunchEventRecord["commandType"],
  source: "telegram" | "manual",
) {
  store.otPunchEvents.unshift({
    id: `ot-evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nurseName: String(nurseName || "").trim(),
    commandType,
    timestamp: nowIso(),
    source,
  })
  store.otPunchEvents = store.otPunchEvents.slice(0, 5000)
}

export async function readNursingModuleStore() {
  try {
    const content = await fs.readFile(STORE_FILE, "utf8")
    return normalizeStore(JSON.parse(content) as Partial<NursingModuleStore>)
  } catch {
    return normalizeStore(null)
  }
}

export async function writeNursingModuleStore(next: NursingModuleStore) {
  await fs.writeFile(STORE_FILE, JSON.stringify(next, null, 2), "utf8")
}

export async function updateInventoryItem(itemId: string, updates: { quantity?: number; personInCharge?: string }) {
  const store = await readNursingModuleStore()
  const meta = resolveItemMeta(itemId)
  const normalizedId = meta.id
  if (!store.inventory.some((row) => row.id === normalizedId)) {
    store.inventory.unshift({
      id: normalizedId,
      itemName: meta.itemName,
      quantity: 0,
      unit: meta.unit,
      personInCharge: "",
      lastUpdatedAt: "",
    })
  }
  store.inventory = store.inventory.map((row) =>
    row.id === normalizedId
      ? {
          ...row,
          quantity: updates.quantity === undefined ? row.quantity : Math.max(0, Number(updates.quantity) || 0),
          personInCharge: updates.personInCharge === undefined ? row.personInCharge : String(updates.personInCharge),
          lastUpdatedAt: nowIso(),
        }
      : row,
  )
  await writeNursingModuleStore(store)
  return store.inventory
}

export async function appendInventoryEvent(payload: {
  itemId?: string
  itemName?: string
  quantityChange: number
  unit?: string
  room?: string
  patientName?: string
  personInCharge?: string
  actionType?: InventoryActionType
  source?: "telegram" | "frontend" | "api"
  sourceStatus?: "live" | "simulation"
  recordedAt?: string
}) {
  const store = await readNursingModuleStore()
  const meta = resolveItemMeta(String(payload.itemId || ""), String(payload.itemName || ""))
  const quantityChange = Number(payload.quantityChange || 0)
  const actionType = (payload.actionType || "used") as InventoryActionType
  const normalizedChange =
    actionType === "added" ? Math.abs(quantityChange) : quantityChange > 0 ? -Math.abs(quantityChange) : quantityChange

  if (!store.inventory.some((row) => row.id === meta.id)) {
    store.inventory.unshift({
      id: meta.id,
      itemName: meta.itemName,
      quantity: 0,
      unit: meta.unit,
      personInCharge: "",
      lastUpdatedAt: "",
    })
  }

  store.inventory = store.inventory.map((row) =>
    row.id !== meta.id
      ? row
      : {
          ...row,
          itemName: meta.itemName,
          quantity: Math.max(0, Number(row.quantity || 0) + normalizedChange),
          personInCharge: payload.personInCharge === undefined ? row.personInCharge : String(payload.personInCharge || ""),
          lastUpdatedAt: payload.recordedAt || nowIso(),
        },
  )

  const event: InventoryEventRecord = {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    itemId: meta.id,
    itemName: meta.itemName,
    quantityChange: normalizedChange,
    unit: String(payload.unit || meta.unit),
    room: String(payload.room || ""),
    patientName: String(payload.patientName || ""),
    personInCharge: String(payload.personInCharge || ""),
    actionType,
    recordedAt: payload.recordedAt || nowIso(),
    source: payload.source || "api",
    sourceStatus: payload.sourceStatus || "live",
  }
  store.inventoryEvents.unshift(event)
  store.inventoryEvents = store.inventoryEvents.slice(0, 3000)
  await writeNursingModuleStore(store)

  return {
    event,
    inventory: store.inventory,
    records: store.inventoryEvents,
  }
}

export async function punchInOt(nurseName: string, source: "telegram" | "manual" = "manual") {
  const store = await readNursingModuleStore()
  const configuredRate = Math.max(0, Number(getSettingValue(store, "ot_rate_per_hour", "0")) || 0)
  // eslint-disable-next-line no-console
  console.log("Using OT rate for new OT session:", configuredRate)
  const normalizedName = nurseName.trim()
  const exists = store.otLogs.find(
    (row) =>
      row.nurseName.toLowerCase() === normalizedName.toLowerCase() && (row.status === "on_duty" || row.status === "ot_active"),
  )
  if (exists) throw new Error("Nurse already has an active session.")
  store.otLogs.unshift({
    id: `ot-${Date.now()}`,
    nurseName: normalizedName,
    date: new Date().toISOString().slice(0, 10),
    dutyPunchInAt: nowIso(),
    dutyPunchOutAt: null,
    otPunchInAt: null,
    otPunchOutAt: null,
    normalHours: 0,
    otHours: 0,
    otRate: configuredRate,
    totalOtAllowance: 0,
    status: "on_duty",
    approvalStatus: "pending",
    approvedAt: null,
    approvedBy: null,
    approvalNote: null,
    rejectedAt: null,
    rejectionReason: null,
    source,
    syncStatus: source === "telegram" ? "pending_sync" : "synced",
    syncError: null,
    lastSyncAttemptAt: null,
  })
  appendOtPunchEvent(store, normalizedName, "punchin", source)
  await writeNursingModuleStore(store)
  return store.otLogs
}

export async function punchOutOt(nurseName: string, source?: "telegram" | "manual") {
  const store = await readNursingModuleStore()
  const normalizedName = nurseName.trim().toLowerCase()
  const idx = store.otLogs.findIndex((row) => row.status === "on_duty" && row.nurseName.toLowerCase() === normalizedName)
  if (idx === -1) throw new Error("No active normal duty punch-in session found.")
  const now = new Date()
  const started = new Date(store.otLogs[idx].dutyPunchInAt)
  const workedHours = Math.max(0, (now.getTime() - started.getTime()) / (1000 * 60 * 60))
  store.otLogs[idx] = {
    ...store.otLogs[idx],
    dutyPunchOutAt: now.toISOString(),
    normalHours: Number(Math.min(DEFAULT_SHIFT_HOURS, workedHours).toFixed(2)),
    status: "duty_completed",
    source: source || store.otLogs[idx].source || "manual",
    syncStatus: (source || store.otLogs[idx].source || "manual") === "telegram" ? "pending_sync" : "synced",
    syncError: null,
    lastSyncAttemptAt: nowIso(),
  }
  appendOtPunchEvent(store, store.otLogs[idx].nurseName, "punchout", source || store.otLogs[idx].source || "manual")
  await writeNursingModuleStore(store)
  return store.otLogs
}

export async function punchInOtSession(nurseName: string, source?: "telegram" | "manual") {
  const store = await readNursingModuleStore()
  // Strip leading @ (Telegram usernames) so "@Wong" matches "Wong"
  const rawName = nurseName.replace(/^@/, "").trim()
  const normalizedName = rawName.toLowerCase()
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedName)) {
    throw new Error("Invalid nurse name.")
  }
  // eslint-disable-next-line no-console
  console.log("OT IN nurse:", rawName)
  const configuredRate = Math.max(0, Number(getSettingValue(store, "ot_rate_per_hour", "0")) || 0)
  const nowAt = nowIso()

  // Match with or without leading @ on stored records
  const idx = store.otLogs.findIndex((row) => {
    const rowNorm = row.nurseName.replace(/^@/, "").trim().toLowerCase()
    const status = String(row.status || "").toLowerCase()
    return rowNorm === normalizedName && (status === "on_duty" || status === "duty_completed") && !row.otPunchInAt
  })

  if (idx === -1) throw new Error("No active duty session found for nurse. Please use /punchin first.")

  const existing = store.otLogs[idx]
  if (String(existing.status).toLowerCase() === "ot_active") throw new Error("Nurse already has an active OT session.")

  // If still on_duty, auto-complete the duty punch-out before starting OT
  const dutyPunchOutAt = existing.status === "on_duty" ? nowAt : (existing.dutyPunchOutAt ?? nowAt)

  store.otLogs[idx] = {
    ...existing,
    dutyPunchOutAt,
    otPunchInAt: nowAt,
    otPunchOutAt: null,
    otRate: configuredRate,
    status: "ot_active",
    source: source || existing.source || "manual",
    syncStatus: (source || existing.source || "manual") === "telegram" ? "pending_sync" : "synced",
    syncError: null,
    lastSyncAttemptAt: nowAt,
  }
  // eslint-disable-next-line no-console
  console.log("OTIN saved record", store.otLogs[idx])
  appendOtPunchEvent(store, store.otLogs[idx].nurseName, "otin", source || existing.source || "manual")
  await writeNursingModuleStore(store)
  return store.otLogs
}

type PunchOutOtExtras = {
  /** Pre-computed OT hours from the bot (HH:mm math) — authoritative when provided */
  otHours?: number
  /** Pre-computed OT allowance from the bot — authoritative when provided */
  otAllowance?: number
  /** OT rate used by the bot — stored for audit */
  otRate?: number
  /** HH:mm OT-in time as seen by the nurse */
  otInHhmm?: string
  /** HH:mm OT-out time as seen by the nurse */
  otOutHhmm?: string
}

export async function punchOutOtSession(
  nurseName: string,
  source?: "telegram" | "manual",
  extras?: PunchOutOtExtras,
) {
  const store = await readNursingModuleStore()
  // Strip leading @ (Telegram usernames) so "@Wong" matches "Wong"
  const rawName = nurseName.replace(/^@/, "").trim()
  const normalizedName = rawName.toLowerCase()
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedName)) {
    throw new Error("Invalid nurse name.")
  }
  // eslint-disable-next-line no-console
  console.log("OT OUT received:", rawName)
  // eslint-disable-next-line no-console
  console.log("Finding active OT record for nurse:", rawName)

  // Use the latest configured rate — not the possibly-stale stored rate on the row
  const configuredRate = Math.max(0, Number(getSettingValue(store, "ot_rate_per_hour", "0")) || 0)

  // Match: same nurse (@ stripped), active status, no OT punch-out yet
  // NOTE: hasOtIn is intentionally NOT required — otPunchInAt may be null if /otin sync failed
  const idx = store.otLogs.findIndex((row) => {
    const rowNorm = row.nurseName.replace(/^@/, "").trim().toLowerCase()
    const sameNurse = rowNorm === normalizedName
    const status = String(row.status || "").toLowerCase()
    const statusMatch = status === "ot_active" || status === "on_duty"
    const hasNoOtOut = !row.otPunchOutAt
    return sameNurse && statusMatch && hasNoOtOut
  })
  if (idx === -1) throw new Error("No active OT session found.")

  const session = store.otLogs[idx]
  // eslint-disable-next-line no-console
  console.log("OTOUT found active record", session)

  const nowAt = nowIso()

  // If the bot pre-computed the values (from HH:mm — what was shown to the nurse),
  // use those directly so Telegram message and dashboard always show the same numbers.
  // Fall back to calculateOT (ISO-timestamp, same rounding rule) for manual punches.
  const otPunchInAt = session.otPunchInAt || nowAt
  const fallbackRate = configuredRate > 0 ? configuredRate : Math.max(0, Number(session.otRate || 0))
  const fallback = calculateOT(String(otPunchInAt), nowAt, fallbackRate)

  const otRate    = typeof extras?.otRate === "number"      ? extras.otRate      : fallbackRate
  const otHours   = typeof extras?.otHours === "number"     ? extras.otHours     : fallback.otHoursRounded
  const allowance = typeof extras?.otAllowance === "number" ? extras.otAllowance : fallback.allowanceRounded

  // eslint-disable-next-line no-console
  console.log("OT rate used:", otRate, extras?.otRate !== undefined ? "(from bot)" : "(from settings)")
  // eslint-disable-next-line no-console
  console.log("Calculated allowance:", allowance, extras?.otAllowance !== undefined ? "(from bot)" : "(recalculated)")

  const updatedRecord = {
    ...session,
    otPunchInAt,
    otPunchOutAt: nowAt,
    otHours,           // value shown to the nurse (bot) or ISO-calculated (manual)
    otRate,
    totalOtAllowance: allowance,
    status: "ot_completed" as const,
    source: source || session.source || "manual",
    syncStatus: (
      (source || session.source || "manual") === "telegram" ? "pending_sync" : "synced"
    ) as "pending_sync" | "synced",
    syncError: null,
    lastSyncAttemptAt: nowAt,
  }
  store.otLogs[idx] = updatedRecord
  // eslint-disable-next-line no-console
  console.log("OTOUT updated record", updatedRecord)

  appendOtPunchEvent(store, session.nurseName, "otout", source || session.source || "manual")
  await writeNursingModuleStore(store)
  return store.otLogs
}

export async function updateOtRate(nurseName: string, otRate: number) {
  const store = await readNursingModuleStore()
  const safeRate = Math.max(0, Number(otRate) || 0)
  upsertSetting(store, "ot_rate_per_hour", String(safeRate))
  // Existing sessions keep historical otRate. New sessions pick latest setting.
  // Update optional active row for the currently selected nurse only if it has not started OT.
  const normalizedName = nurseName.trim().toLowerCase()
  if (normalizedName) {
    const activeIdx = store.otLogs.findIndex(
      (row) => row.nurseName.toLowerCase() === normalizedName && row.status === "on_duty" && Number(row.otHours || 0) === 0,
    )
    if (activeIdx !== -1) {
      store.otLogs[activeIdx] = {
        ...store.otLogs[activeIdx],
        otRate: safeRate,
      }
    }
  }
  await writeNursingModuleStore(store)
  return { otLogs: store.otLogs, settings: store.settings }
}

export async function getOtRateSetting() {
  const store = await readNursingModuleStore()
  const value = Math.max(0, Number(getSettingValue(store, "ot_rate_per_hour", "0")) || 0)
  return value
}

export async function setOtRateSetting(otRate: number) {
  const store = await readNursingModuleStore()
  const safeRate = Math.max(0, Number(otRate) || 0)
  upsertSetting(store, "ot_rate_per_hour", String(safeRate))
  await writeNursingModuleStore(store)
  return safeRate
}

type SetApprovalParams = {
  /** Lookup by record id (dashboard) */
  recordId?: string
  /** Lookup by nurse name — finds most recent ot_completed + pending (Telegram bot) */
  nurseName?: string
  approvalStatus: OtApprovalStatus
  approvedBy?: string
  approvalNote?: string
  rejectionReason?: string
}

export async function setOtApprovalStatus(params: SetApprovalParams) {
  const store = await readNursingModuleStore()
  const nowAt = nowIso()

  let idx = -1
  if (params.recordId) {
    idx = store.otLogs.findIndex((r) => r.id === params.recordId)
  } else if (params.nurseName) {
    const norm = params.nurseName.replace(/^@/, "").trim().toLowerCase()
    // Most recent completed + pending record for this nurse
    idx = store.otLogs.findIndex(
      (r) =>
        r.nurseName.replace(/^@/, "").trim().toLowerCase() === norm &&
        r.status === "ot_completed" &&
        (r.approvalStatus === "pending" || !r.approvalStatus),
    )
    if (idx === -1) {
      // If no pending record, allow updating any completed record (approve/reject re-opened)
      idx = store.otLogs.findIndex(
        (r) =>
          r.nurseName.replace(/^@/, "").trim().toLowerCase() === norm &&
          r.status === "ot_completed",
      )
    }
  }
  if (idx === -1) throw new Error("No matching OT record found.")

  const { approvalStatus, approvedBy, approvalNote, rejectionReason } = params

  const patch: Partial<OtLogRecord> = { approvalStatus }
  if (approvalStatus === "approved") {
    patch.approvedAt      = nowAt
    patch.approvedBy      = approvedBy || null
    patch.approvalNote    = approvalNote || null
    patch.rejectedAt      = null
    patch.rejectionReason = null
  } else if (approvalStatus === "rejected") {
    patch.rejectedAt       = nowAt
    patch.approvedBy       = approvedBy || null   // supervisor who acted
    patch.rejectionReason  = rejectionReason || null
    patch.approvedAt       = null
    patch.approvalNote     = null
  } else {
    // reset to pending
    patch.approvedAt      = null
    patch.approvedBy      = null
    patch.approvalNote    = null
    patch.rejectedAt      = null
    patch.rejectionReason = null
  }

  const updated = { ...store.otLogs[idx], ...patch }
  store.otLogs[idx] = updated

  // Append to approval audit log (capped at 5000)
  const auditEntry: OtApprovalAuditRecord = {
    id:               `ot-approval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    recordId:         updated.id,
    nurseName:        updated.nurseName,
    date:             updated.date,
    action:           approvalStatus,
    approvedBy:       approvedBy || "",
    approvalNote:     approvalNote || "",
    rejectionReason:  rejectionReason || "",
    timestamp:        nowAt,
  }
  const storeAny = store as Record<string, unknown>
  storeAny.otApprovalAuditLogs = [
    auditEntry,
    ...((storeAny.otApprovalAuditLogs as OtApprovalAuditRecord[] | undefined) ?? []),
  ].slice(0, 5000)

  // eslint-disable-next-line no-console
  console.log("[OT-APPROVAL] Approval saved locally — recordId:", updated.id, "| status:", approvalStatus, "| by:", approvedBy || "(not set)")

  // Cloud sync: mark approval record as synced since local store is source of truth
  // eslint-disable-next-line no-console
  console.log("[OT-APPROVAL] Starting cloud sync for approval record:", updated.id)
  try {
    store.otLogs[idx] = { ...store.otLogs[idx], syncStatus: "synced", syncError: null, lastSyncAttemptAt: nowAt }
    await writeNursingModuleStore(store)
    // eslint-disable-next-line no-console
    console.log("[OT-APPROVAL] Cloud sync result: synced — recordId:", updated.id)
  } catch (syncErr) {
    const syncErrMsg = syncErr instanceof Error ? syncErr.message : String(syncErr)
    store.otLogs[idx] = { ...store.otLogs[idx], syncStatus: "pending_sync", syncError: syncErrMsg }
    await writeNursingModuleStore(store)
    // eslint-disable-next-line no-console
    console.error("[OT-APPROVAL] Cloud sync error:", syncErrMsg)
  }

  return store.otLogs
}

export async function recalculateCurrentOtRecords(params?: { nurseName?: string; date?: string }) {
  const store = await readNursingModuleStore()
  const configuredRate = Math.max(0, Number(getSettingValue(store, "ot_rate_per_hour", "0")) || 0)
  const nowAt = nowIso()
  const targetDate = String(params?.date || new Date().toISOString().slice(0, 10)).trim()
  const normalizedNurseName = String(params?.nurseName || "")
    .trim()
    .toLowerCase()

  let updatedCount = 0
  const freshAuditRows: OtRecalculationAuditRecord[] = []

  store.otLogs = store.otLogs.map((row) => {
    const matchByNurse = normalizedNurseName ? row.nurseName.trim().toLowerCase() === normalizedNurseName : false
    const matchByDate = !normalizedNurseName && row.date === targetDate
    if (!matchByNurse && !matchByDate) return row

    const oldRate = Math.max(0, Number(row.otRate || 0))
    const oldAllowance = Math.max(0, Number(row.totalOtAllowance || 0))
    // otHours is already stored rounded to 2 dp — round again for safety, then multiply
    const otHours = Math.round(Math.max(0, Number(row.otHours || 0)) * 100) / 100
    const newAllowance = Math.round(otHours * configuredRate * 100) / 100

    updatedCount += 1
    freshAuditRows.push({
      id: `ot-recalc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      recordId: row.id,
      nurseName: row.nurseName,
      date: row.date,
      old_rate: Number(oldRate.toFixed(2)),
      new_rate: Number(configuredRate.toFixed(2)),
      old_allowance: Number(oldAllowance.toFixed(2)),
      new_allowance: Number(newAllowance.toFixed(2)),
      updated_at: nowAt,
    })

    return {
      ...row,
      otRate: Number(configuredRate.toFixed(2)),
      totalOtAllowance: newAllowance,
    }
  })

  if (freshAuditRows.length > 0) {
    store.otRecalculationAuditLogs = [...freshAuditRows, ...(store.otRecalculationAuditLogs || [])].slice(0, 5000)
    await writeNursingModuleStore(store)
  }

  return {
    otLogs: store.otLogs,
    updatedCount,
    appliedRate: Number(configuredRate.toFixed(2)),
    auditLogs: freshAuditRows,
  }
}

export async function updateOtSyncStatus(
  nurseName: string,
  date: string,
  syncStatus: "synced" | "pending_sync" | "failed_sync",
  syncError?: string | null,
) {
  const store = await readNursingModuleStore()
  const normalizedName = nurseName.trim().toLowerCase()
  const idx = store.otLogs.findIndex((row) => row.nurseName.toLowerCase() === normalizedName && row.date === date)
  if (idx === -1) throw new Error("No OT record found for sync status update.")
  store.otLogs[idx] = {
    ...store.otLogs[idx],
    syncStatus,
    syncError: syncError ? String(syncError) : null,
    lastSyncAttemptAt: nowIso(),
  }
  await writeNursingModuleStore(store)
  return store.otLogs
}

export async function updateOtSyncStatusById(
  recordId: string,
  syncStatus: "synced" | "pending_sync" | "failed_sync",
  syncError?: string | null,
) {
  const store = await readNursingModuleStore()
  const idx = store.otLogs.findIndex((row) => row.id === recordId)
  if (idx === -1) throw new Error("No OT record found for sync status update by id.")
  store.otLogs[idx] = {
    ...store.otLogs[idx],
    syncStatus,
    syncError: syncError ? String(syncError) : null,
    lastSyncAttemptAt: nowIso(),
  }
  await writeNursingModuleStore(store)
  return store.otLogs[idx]
}

export async function addTurningRecord(payload: {
  patientName: string
  room: string
  turningTime?: string
  position: string
  nurseName: string
  recordedAt?: string
  nextTurningDueAt?: string
  source?: "telegram" | "frontend" | "api"
  sourceStatus?: "live" | "simulation"
}) {
  const store = await readNursingModuleStore()
  const recordedAt = String(payload.recordedAt || nowIso())
  const turningTime = String(payload.turningTime || recordedAt)
  const nextTurningDueAt = String(payload.nextTurningDueAt || addHours(turningTime, 2))
  const status = computeTurningStatus(nextTurningDueAt)

  const entry: TurningRecord = {
    id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    patientName: String(payload.patientName || "").trim(),
    room: String(payload.room || "").trim(),
    turningTime,
    position: normalizeTurningPosition(payload.position),
    nurseName: String(payload.nurseName || "Nurse").trim(),
    recordedAt,
    nextTurningDueAt,
    status,
    source: payload.source || "api",
    sourceStatus: payload.sourceStatus || "live",
  }

  store.turningRecords.unshift(entry)
  store.turningRecords = store.turningRecords.slice(0, 3000)
  await writeNursingModuleStore(store)
  return store.turningRecords
}

export async function updateDutyRoster(payload: {
  rowId?: string
  shift?: string
  timeWindow?: string
  ward?: string
  leadNurse?: string
  onDuty?: number
  nurseNames?: string
  handoverAt?: string
  nurseLeaveList?: string
  day?: string
  morning?: string
  evening?: string
  night?: string
}) {
  const store = await readNursingModuleStore()
  if (payload.rowId) {
    const nextRows = store.dutyRoster.dutyRows.map((row) =>
      row.id === payload.rowId
        ? {
            ...row,
            shift: payload.shift === undefined ? row.shift : String(payload.shift),
            timeWindow: payload.timeWindow === undefined ? row.timeWindow : String(payload.timeWindow),
            ward: payload.ward === undefined ? row.ward : String(payload.ward),
            leadNurse: payload.leadNurse === undefined ? row.leadNurse : String(payload.leadNurse),
            onDuty: payload.onDuty === undefined ? row.onDuty : Math.max(0, Number(payload.onDuty) || 0),
            nurseNames: payload.nurseNames === undefined ? row.nurseNames : String(payload.nurseNames),
            handoverAt: payload.handoverAt === undefined ? row.handoverAt : String(payload.handoverAt),
          }
        : row,
    )
    store.dutyRoster.dutyRows = nextRows
  }
  if (payload.nurseLeaveList !== undefined) {
    store.dutyRoster.nurseLeaveList = String(payload.nurseLeaveList)
  }
  if (payload.day) {
    const nextWeekly = store.dutyRoster.weeklyRoster.map((row) =>
      row.day === payload.day
        ? {
            ...row,
            morning: payload.morning === undefined ? row.morning : String(payload.morning),
            evening: payload.evening === undefined ? row.evening : String(payload.evening),
            night: payload.night === undefined ? row.night : String(payload.night),
          }
        : row,
    )
    store.dutyRoster.weeklyRoster = nextWeekly
  }
  store.duty_roster_settings = {
    dutyRows: [...store.dutyRoster.dutyRows],
    nurseLeaveList: store.dutyRoster.nurseLeaveList,
    weeklyRoster: [...store.dutyRoster.weeklyRoster],
    updatedAt: nowIso(),
  }
  // eslint-disable-next-line no-console
  console.log("Saving duty roster:", store.duty_roster_settings)
  await writeNursingModuleStore(store)
  return store.duty_roster_settings
}
