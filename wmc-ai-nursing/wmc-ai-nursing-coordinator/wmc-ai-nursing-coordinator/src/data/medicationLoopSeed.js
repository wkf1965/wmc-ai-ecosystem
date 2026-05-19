/** Simulation seed for Medication Loop — aligns with demo roster in Medication Tracking. */

export const MED_LOOP_ROOM_MAP = {
  p1: '302A',
  p2: '318C',
  p3: '214B',
  p4: '221D',
  p5: '305A',
}

export const MED_LOOP_HIGH_RISK_TOKENS = [
  'insulin',
  'warfarin',
  'heparin',
  'enoxaparin',
  'morphine',
  'oxycodone',
  'fentanyl',
  'clopidogrel',
  'prednisone',
  'tramadol',
]

export function medLoopHighRisk(name) {
  const t = String(name || '').toLowerCase()
  return MED_LOOP_HIGH_RISK_TOKENS.some((k) => t.includes(k))
}

export const MED_LOOP_SEED_BY_PATIENT = {
  p1: [
    { medicationName: 'Furosemide', dosage: '20 mg', frequency: 'PO once daily', timeDue: '08:00', nurseInCharge: 'R.N. Patel' },
    { medicationName: 'Lisinopril', dosage: '10 mg', frequency: 'PO every morning', timeDue: '09:00', nurseInCharge: 'R.N. Patel' },
  ],
  p2: [
    { medicationName: 'Enoxaparin', dosage: '40 mg', frequency: 'SC at 21:00', timeDue: '21:00', nurseInCharge: 'LPN Santos' },
    { medicationName: 'Acetaminophen', dosage: '650 mg', frequency: 'PRN pain', timeDue: '10:00', nurseInCharge: 'LPN Santos' },
  ],
  p3: [
    { medicationName: 'Carbidopa-Levodopa', dosage: '25/100 mg', frequency: 'PO TID', timeDue: '07:30', nurseInCharge: 'R.N. Kim' },
    { medicationName: 'Levothyroxine', dosage: '50 mcg', frequency: 'PO every morning', timeDue: '07:00', nurseInCharge: 'R.N. Kim' },
  ],
  p4: [
    { medicationName: 'Prednisone', dosage: '10 mg', frequency: 'PO daily', timeDue: '07:45', nurseInCharge: 'R.N. Nguyen' },
    { medicationName: 'Insulin lispro', dosage: 'per sliding scale', frequency: 'TID', timeDue: '18:00', nurseInCharge: 'R.N. Nguyen' },
  ],
  p5: [
    { medicationName: 'Sertraline', dosage: '50 mg', frequency: 'PO every morning', timeDue: '08:15', nurseInCharge: 'LPN Santos' },
    { medicationName: 'Tramadol', dosage: '50 mg', frequency: 'PO q6h PRN', timeDue: '20:00', nurseInCharge: 'LPN Santos' },
  ],
}
