import { useContext } from 'react'
import { NursingNotesContext } from '../context/nursingNotesContext.js'

export function useNursingNotes() {
  const ctx = useContext(NursingNotesContext)
  if (!ctx) {
    throw new Error('useNursingNotes must be used within NursingNotesProvider')
  }
  return ctx
}
