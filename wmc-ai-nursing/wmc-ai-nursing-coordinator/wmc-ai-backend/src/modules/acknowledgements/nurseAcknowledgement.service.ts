import type {
  NurseAcknowledgementConfirmBody,
} from './nurseAcknowledgement.validation.js'
import type { NurseAcknowledgementRecord, NurseAcknowledgementStatus } from './nurseAcknowledgement.types.js'

export function acknowledgementStatus(body: NurseAcknowledgementConfirmBody): NurseAcknowledgementStatus {
  return body.acknowledged ? 'Confirmed' : 'Pending'
}

export function buildAcknowledgementRecord(
  body: NurseAcknowledgementConfirmBody,
  id: string,
  createdAt: string,
): NurseAcknowledgementRecord {
  const status = acknowledgementStatus(body)
  return {
    id,
    nurseName: body.nurseName.trim(),
    announcementId: body.announcementId.trim(),
    announcementTitle: body.announcementTitle.trim(),
    itemType: body.itemType,
    acknowledged: body.acknowledged,
    acknowledgedAt: body.acknowledgedAt.trim(),
    notes: body.notes?.trim() ?? '',
    status,
    createdAt,
  }
}
