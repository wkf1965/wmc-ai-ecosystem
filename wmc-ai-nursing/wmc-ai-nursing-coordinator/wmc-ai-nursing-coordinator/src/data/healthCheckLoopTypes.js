/** Health monitoring loop definitions — simulation / education only. */

export const HEALTH_LOOP_FREQUENCIES = [
  { id: '1h', label: 'Every 1 hour', minutes: 60 },
  { id: '2h', label: 'Every 2 hours', minutes: 120 },
  { id: '4h', label: 'Every 4 hours', minutes: 240 },
  { id: 'shift', label: 'Every shift', minutes: 480 },
  { id: 'daily', label: 'Daily', minutes: 1440 },
]

export const HEALTH_LOOP_FREQUENCY_MAP = Object.fromEntries(HEALTH_LOOP_FREQUENCIES.map((f) => [f.id, f]))

/** Default cadence per check for seeded simulation */
export const DEFAULT_FREQUENCY_BY_CHECK_ID = {
  bp: '4h',
  pulse: '2h',
  temp: '2h',
  spo2: '1h',
  glucose: '4h',
  weight: 'daily',
  pain: 'shift',
  mental: 'shift',
  urine: 'shift',
  bowel: 'daily',
  sleep: 'daily',
  appetite: 'shift',
}

export const HEALTH_CHECK_LOOP_TYPES = [
  { id: 'bp', label: 'Blood pressure', normalRange: '90–139 / 60–89 mmHg', unitHint: 'e.g. 128/82' },
  { id: 'pulse', label: 'Pulse', normalRange: '60–100 bpm', unitHint: 'e.g. 78' },
  { id: 'temp', label: 'Temperature', normalRange: '36.1–37.2 °C (oral)', unitHint: 'e.g. 36.8' },
  { id: 'spo2', label: 'Oxygen saturation', normalRange: '95–100% (room air)', unitHint: 'e.g. 97' },
  { id: 'glucose', label: 'Blood glucose', normalRange: '70–140 mg/dL (non-fasting demo)', unitHint: 'e.g. 118' },
  { id: 'weight', label: 'Weight', normalRange: 'Within ±2 kg of baseline / shift', unitHint: 'e.g. 72.4 kg' },
  { id: 'pain', label: 'Pain score', normalRange: '0–3 /10', unitHint: '0–10' },
  { id: 'mental', label: 'Mental status', normalRange: 'AO ×4, baseline behaviour', unitHint: 'e.g. AOx4, calm' },
  { id: 'urine', label: 'Urine output', normalRange: '≥30 mL/hr avg (context-dependent)', unitHint: 'e.g. 40 mL/hr' },
  { id: 'bowel', label: 'Bowel movement', normalRange: 'Pattern per care plan', unitHint: 'e.g. Soft BM ×1' },
  { id: 'sleep', label: 'Sleep monitoring', normalRange: '≥6 h restorative (demo)', unitHint: 'e.g. 6.5 h' },
  { id: 'appetite', label: 'Appetite monitoring', normalRange: '≥50% meals (demo)', unitHint: 'e.g. 75% lunch' },
]

export const HEALTH_CHECK_TYPE_MAP = Object.fromEntries(HEALTH_CHECK_LOOP_TYPES.map((t) => [t.id, t]))
