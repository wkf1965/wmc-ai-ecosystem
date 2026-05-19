/** Recurring care loop definitions — simulation only. */

export const CARE_LOOP_TYPES = [
  { id: 'side_turning', label: 'Side turning', intervalMinutes: 120 },
  { id: 'med_round', label: 'Medication round', intervalMinutes: 240 },
  { id: 'vitals', label: 'Vital signs check', intervalMinutes: 240 },
  { id: 'hydration', label: 'Hydration check', intervalMinutes: 180 },
  { id: 'meal_intake', label: 'Meal intake check', intervalMinutes: 360 },
  { id: 'wound', label: 'Wound check', intervalMinutes: 720 },
  { id: 'toileting', label: 'Toileting round', intervalMinutes: 120 },
  { id: 'fall_risk', label: 'Fall risk round', intervalMinutes: 480 },
  { id: 'night_obs', label: 'Night observation round', intervalMinutes: 240 },
]

export const CARE_LOOP_TYPE_MAP = Object.fromEntries(CARE_LOOP_TYPES.map((t) => [t.id, t]))
