import { useCallback, useMemo, useState } from 'react'
import { NursingNotesContext } from './nursingNotesContext.js'
import { deleteNursingNote, getAllNursingNotes } from '../db/nursingNoteStorage.js'
import { saveNursingNote } from '../lib/googleSheetSync.js'

export function NursingNotesProvider({ children }) {
  const [notes, setNotes] = useState(() => getAllNursingNotes())

  const refresh = useCallback(() => {
    setNotes(getAllNursingNotes())
  }, [])

  const addNote = useCallback(
    async (payload) => {
      const created = await saveNursingNote(payload)
      refresh()
      return created
    },
    [refresh],
  )

  const removeNote = useCallback(
    (id) => {
      const ok = deleteNursingNote(id)
      refresh()
      return ok
    },
    [refresh],
  )

  const value = useMemo(
    () => ({
      notes,
      refresh,
      addNote,
      removeNote,
    }),
    [notes, refresh, addNote, removeNote],
  )

  return <NursingNotesContext.Provider value={value}>{children}</NursingNotesContext.Provider>
}
