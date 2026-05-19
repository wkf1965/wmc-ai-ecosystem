import type { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { computeNurseShiftOt } from './nurseShift.service.js'
import type { NurseShiftOtRecord } from './nurseShift.types.js'
import { nurseShiftOtMemoryStore } from './nurseShift.store.js'
import { nurseShiftOtCalculateSchema } from './nurseShift.validation.js'

function nowIso(): string {
  return new Date().toISOString()
}

export const nurseShiftController = {
  async calculateOt(req: Request, res: Response): Promise<void> {
    const body = nurseShiftOtCalculateSchema.parse(req.body)

    let computed
    try {
      computed = computeNurseShiftOt(body)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid shift times'
      res.status(400).json({ error: 'Bad Request', message: msg })
      return
    }

    const row: NurseShiftOtRecord = {
      id: uuid(),
      nurseName: body.nurseName.trim(),
      shiftDate: body.shiftDate.trim(),
      shiftStart: body.shiftStart.trim(),
      shiftEnd: body.shiftEnd.trim(),
      actualClockIn: body.actualClockIn.trim(),
      actualClockOut: body.actualClockOut.trim(),
      breakMinutes: body.breakMinutes,
      notes: body.notes ?? '',
      regularHours: computed.regularHours,
      overtimeHours: computed.overtimeHours,
      lateMinutes: computed.lateMinutes,
      earlyClockInMinutes: computed.earlyClockInMinutes,
      createdAt: nowIso(),
      ...(req.auth?.sub ? { recordedByUserId: req.auth.sub } : {}),
    }

    nurseShiftOtMemoryStore.append(row)

    res.status(201).json({
      nurseName: row.nurseName,
      regularHours: row.regularHours,
      overtimeHours: row.overtimeHours,
      lateMinutes: row.lateMinutes,
      earlyClockInMinutes: row.earlyClockInMinutes,
      message: 'OT calculated successfully',
      record: row,
    })
  },

  async list(_req: Request, res: Response): Promise<void> {
    res.json({ records: nurseShiftOtMemoryStore.list() })
  },
}
