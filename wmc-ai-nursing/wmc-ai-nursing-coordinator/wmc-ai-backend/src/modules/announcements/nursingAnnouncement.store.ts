import type { AnnouncementAcknowledgement, NursingAnnouncementRecord } from './nursingAnnouncement.types.js'

const rows: NursingAnnouncementRecord[] = []

export const nursingAnnouncementMemoryStore = {
  append(record: NursingAnnouncementRecord): NursingAnnouncementRecord {
    rows.push(record)
    return record
  },

  clear(): void {
    rows.length = 0
  },

  list(): NursingAnnouncementRecord[] {
    return [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },

  findById(id: string): NursingAnnouncementRecord | undefined {
    return rows.find((r) => r.id === id)
  },

  addAcknowledgement(id: string, ack: AnnouncementAcknowledgement): NursingAnnouncementRecord | undefined {
    const row = rows.find((r) => r.id === id)
    if (!row) return undefined
    row.acknowledgements.push(ack)
    return row
  },
}
