export const NURSING_NOTES_STORAGE_KEY = 'wmc_nursing_notes_v1'

export const NOTE_SHIFT_OPTIONS = ['Day', 'Evening', 'Night']

export function emptyNursingNoteForm() {
  return {
    patientId: '',
    date: new Date().toISOString().slice(0, 10),
    shift: 'Day',
    author: '',
    appetite: '',
    sleep: '',
    painScore: '0',
    mood: '',
    bloodPressure: '',
    bloodSugar: '',
    urination: '',
    bowelMovement: '',
    skinCondition: '',
    abnormalEvents: '',
    nurseRemarks: '',
  }
}

export function noteToForm(note) {
  if (!note) return emptyNursingNoteForm()
  return {
    patientId: note.patientId ?? '',
    date: note.date ?? '',
    shift: note.shift ?? 'Day',
    author: note.author ?? '',
    appetite: note.appetite ?? '',
    sleep: note.sleep ?? '',
    painScore: String(note.painScore ?? 0),
    mood: note.mood ?? '',
    bloodPressure: note.bloodPressure ?? '',
    bloodSugar: note.bloodSugar ?? '',
    urination: note.urination ?? '',
    bowelMovement: note.bowelMovement ?? '',
    skinCondition: note.skinCondition ?? '',
    abnormalEvents: note.abnormalEvents ?? '',
    nurseRemarks: note.nurseRemarks ?? '',
  }
}

export function formToNursingNotePayload(form, patientNameSnapshot) {
  const pain = parseInt(String(form.painScore), 10)
  return {
    patientId: String(form.patientId || '').trim(),
    patientNameSnapshot: String(patientNameSnapshot || '').trim(),
    date: form.date || '',
    shift: form.shift || 'Day',
    author: String(form.author || '').trim(),
    appetite: String(form.appetite || '').trim(),
    sleep: String(form.sleep || '').trim(),
    painScore: Number.isFinite(pain) ? Math.min(10, Math.max(0, pain)) : 0,
    mood: String(form.mood || '').trim(),
    bloodPressure: String(form.bloodPressure || '').trim(),
    bloodSugar: String(form.bloodSugar || '').trim(),
    urination: String(form.urination || '').trim(),
    bowelMovement: String(form.bowelMovement || '').trim(),
    skinCondition: String(form.skinCondition || '').trim(),
    abnormalEvents: String(form.abnormalEvents || '').trim(),
    nurseRemarks: String(form.nurseRemarks || '').trim(),
  }
}
