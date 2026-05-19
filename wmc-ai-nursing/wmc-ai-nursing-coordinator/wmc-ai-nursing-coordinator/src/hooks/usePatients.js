import { useContext } from 'react'
import { PatientsContext } from '../context/patientsContext.js'

export function usePatients() {
  const ctx = useContext(PatientsContext)
  if (!ctx) {
    throw new Error('usePatients must be used within PatientsProvider')
  }
  return ctx
}
