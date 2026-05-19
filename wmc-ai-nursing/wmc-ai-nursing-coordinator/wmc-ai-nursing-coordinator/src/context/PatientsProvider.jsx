import { useCallback, useMemo, useState } from 'react'
import { PatientsContext } from './patientsContext.js'
import { deletePatient, getAllPatients } from '../db/patientStorage.js'
import { savePatient as savePatientToGoogleSheet } from '../lib/googleSheetSync.js'

export function PatientsProvider({ children }) {
  const [patients, setPatients] = useState(() => getAllPatients())

  const refresh = useCallback(() => {
    setPatients(getAllPatients())
  }, [])

  const addPatient = useCallback(
    async (payload) => {
      const created = await savePatientToGoogleSheet(payload)
      refresh()
      return created
    },
    [refresh],
  )

  const savePatient = useCallback(
    async (id, payload) => {
      const updated = await savePatientToGoogleSheet({ ...payload, id })
      refresh()
      return updated
    },
    [refresh],
  )

  const removePatient = useCallback(
    (id) => {
      const ok = deletePatient(id)
      refresh()
      return ok
    },
    [refresh],
  )

  const getById = useCallback((id) => patients.find((p) => p.id === id) ?? null, [patients])

  const value = useMemo(
    () => ({
      patients,
      refresh,
      addPatient,
      savePatient,
      removePatient,
      getById,
    }),
    [patients, refresh, addPatient, savePatient, removePatient, getById],
  )

  return <PatientsContext.Provider value={value}>{children}</PatientsContext.Provider>
}
