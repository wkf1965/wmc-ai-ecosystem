import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { MOCK_COMMAND_CENTER_STATUS } from '../src/modules/commandCenter/commandCenter.service.js'
import { MOCK_FAMILY_COMMUNICATION_QUEUE } from '../src/modules/family/familyCommunicationQueue.service.js'
import { MOCK_HANDOVER_AUTO_GENERATE } from '../src/modules/handover/handoverAutoGenerate.service.js'
import { MOCK_DAILY_FACILITY_REPORT } from '../src/modules/reports/dailyFacilityReport.service.js'

const app = createApp()

test('GET /health', async () => {
  const res = await request(app).get('/health').expect(200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.service, 'wmc-ai-backend')
})

test('GET /api/v1 service catalog', async () => {
  const res = await request(app).get('/api/v1').expect(200)
  assert.equal(res.body.service, 'wmc-ai-backend')
  assert.ok(Array.isArray(res.body.modules))
  assert.ok(res.body.modules.length >= 6)
})

test('GET /api/v1/supervisor/escalation-queue (mock slice when stores cold; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app).get('/api/v1/supervisor/escalation-queue').expect(200)

    assert.ok(Array.isArray(res.body.queue))
    assert.ok(res.body.summary && typeof res.body.summary === 'object')
    assert.ok(['Stable', 'Attention Required', 'Critical'].includes(res.body.systemStatus))
    assert.ok(Number.isFinite(res.body.summary.urgentCases))
    assert.ok(Number.isFinite(res.body.summary.highRiskCases))
    assert.ok(Number.isFinite(res.body.summary.mediumRiskCases))
    assert.ok(Number.isFinite(res.body.summary.totalQueueItems))
    assert.equal(res.body.summary.totalQueueItems, res.body.queue.length)

    const order = ['Urgent', 'High', 'Medium', 'Low']
    let last = -1
    for (const item of res.body.queue) {
      assert.ok(order.includes(item.priority))
      assert.ok(typeof item.patientName === 'string')
      assert.ok(typeof item.issue === 'string')
      assert.ok(typeof item.source === 'string')
      assert.ok(typeof item.recommendedAction === 'string')
      const idx = order.indexOf(item.priority)
      assert.ok(idx >= last, 'queue should sort Urgent-first')
      last = idx
    }

    /** First tests run with cold in-memory coordinators → stable demo trio */
    if (res.body.queue.length === 3) {
      assert.equal(res.body.systemStatus, 'Attention Required')
      assert.equal(res.body.summary.urgentCases, 1)
      assert.equal(res.body.summary.highRiskCases, 1)
      assert.equal(res.body.summary.mediumRiskCases, 1)
      assert.equal(res.body.queue[0].source, 'Doctor Escalation')
      assert.equal(res.body.queue[1].source, 'Pressure Ulcer Risk')
      assert.equal(res.body.queue[2].source, 'Wound Monitoring')
    }
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('GET /api/v1/night-shift/monitor (demo when stores cold; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app).get('/api/v1/night-shift/monitor').expect(200)

    assert.ok(res.body.nightShiftSummary && typeof res.body.nightShiftSummary === 'object')
    assert.ok(Array.isArray(res.body.nightShiftSummary.highRiskPatients))
    assert.ok(Array.isArray(res.body.nightShiftSummary.pendingTasks))
    assert.ok(Array.isArray(res.body.nightShiftSummary.criticalAlerts))
    assert.ok(Number.isFinite(res.body.nightShiftSummary.unacknowledgedAlerts))
    assert.ok(Number.isFinite(res.body.nightShiftSummary.doctorEscalations))
    assert.ok(Array.isArray(res.body.recommendations))
    assert.ok(['Stable', 'Attention Required', 'Critical'].includes(res.body.systemStatus))

    /** Cold coordinators + no incidents / announcements → stable demo Critical trio */
    if (res.body.nightShiftSummary.highRiskPatients.length === 2) {
      assert.deepEqual(res.body.nightShiftSummary.highRiskPatients, ['Ah Chong', 'Mdm Lee'])
      assert.equal(res.body.systemStatus, 'Critical')
      assert.equal(res.body.nightShiftSummary.unacknowledgedAlerts, 2)
      assert.equal(res.body.nightShiftSummary.doctorEscalations, 1)
    }
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('GET /api/v1/command-center/status (facility rollup mock when stores cold; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app).get('/api/v1/command-center/status').expect(200)
    assert.deepEqual(res.body, MOCK_COMMAND_CENTER_STATUS)
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('GET /api/v1/handover/auto-generate (cold mock; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app).get('/api/v1/handover/auto-generate').expect(200)
    assert.deepEqual(res.body, MOCK_HANDOVER_AUTO_GENERATE)
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('GET /api/v1/family/communication-queue (cold mock; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app).get('/api/v1/family/communication-queue').expect(200)
    assert.deepEqual(res.body, MOCK_FAMILY_COMMUNICATION_QUEUE)
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('GET /api/v1/reports/daily-facility (cold mock; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app).get('/api/v1/reports/daily-facility').expect(200)
    assert.deepEqual(res.body, MOCK_DAILY_FACILITY_REPORT)
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('unknown route 404', async () => {
  await request(app).get('/no-such-route').expect(404)
})

test('POST /api/v1/vitals/analyze (rule-based; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app)
      .post('/api/v1/vitals/analyze')
      .set('Content-Type', 'application/json')
      .send({
        patientName: 'Ah Chong',
        bloodPressure: '170/100',
        pulse: 110,
        temperature: 38.5,
        oxygen: 92,
        painScore: 7,
        notes: 'Patient looks weak and restless',
      })
      .expect(200)

    assert.equal(res.body.patientName, 'Ah Chong')
    assert.equal(res.body.alertLevel, 'High')
    assert.deepEqual(res.body.abnormalSigns, [
      'High blood pressure',
      'Fast pulse',
      'Fever',
      'Low oxygen',
      'High pain score',
    ])
    assert.deepEqual(res.body.recommendations, [
      'Inform nurse in charge',
      'Recheck vital signs',
      'Monitor oxygen level',
      'Escalate to doctor if condition continues',
    ])
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('POST /api/v1/wound/assessment + GET /api/v1/wound/assessments (dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const payload = {
      patientId: 'P001',
      patientName: 'Ah Chong',
      nurseName: 'Nurse Mary',
      woundLocation: 'Sacrum',
      redness: true,
      swelling: false,
      discharge: true,
      odor: false,
      painScore: 6,
      woundSize: '3cm x 2cm',
      dressingChanged: true,
      photoUploaded: false,
      notes: 'Redness and mild discharge observed',
    }

    const create = await request(app)
      .post('/api/v1/wound/assessment')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(201)

    assert.equal(create.body.message, 'Wound assessment created successfully')
    assert.equal(create.body.infectionRisk, 'Medium')
    assert.deepEqual(create.body.alerts, [
      'Wound redness noted',
      'Discharge observed',
      'Photo not uploaded',
    ])
    assert.deepEqual(create.body.recommendations, [
      'Monitor wound every shift',
      'Ensure dressing change is documented',
      'Upload wound photo for tracking',
      'Escalate to doctor if discharge worsens',
    ])
    assert.equal(create.body.assessment.patientId, 'P001')
    assert.match(create.body.assessment.id, /^[\da-f-]{36}$/i)

    const list = await request(app).get('/api/v1/wound/assessments').expect(200)
    assert.ok(Array.isArray(list.body.assessments))
    assert.ok(list.body.assessments.length >= 1)
    const newest = list.body.assessments[0]
    assert.equal(newest.id, create.body.assessment.id)
    assert.equal(newest.infectionRisk, 'Medium')
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('POST /api/v1/family/update (rule-based; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app)
      .post('/api/v1/family/update')
      .set('Content-Type', 'application/json')
      .send({
        patientName: 'Ah Chong',
        condition: 'Stroke Rehabilitation',
        mood: 'Calm',
        appetite: 'Good',
        mobility: 'Needs assistance',
        vitalStatus: 'Stable',
        rehabCompleted: true,
        sideTurningCompleted: true,
        notes: 'Patient participated well in therapy today.',
      })
      .expect(200)

    assert.equal(res.body.status, 'Stable')
    assert.equal(
      res.body.familyUpdate,
      'Ah Chong remained stable today. Appetite and mood were good. Rehabilitation exercises were completed and side turning care was provided. Patient participated well in therapy today.',
    )
    assert.equal(res.body.recommendedFamilyAction, 'Continue encouragement and emotional support.')
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('POST /api/v1/emergency/respond (rule-based; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app)
      .post('/api/v1/emergency/respond')
      .set('Content-Type', 'application/json')
      .send({
        patientName: 'Ah Chong',
        eventType: 'Low Oxygen',
        bloodPressure: '85/50',
        pulse: 130,
        temperature: 39.5,
        oxygen: 82,
        consciousness: 'Drowsy',
        breathingDifficulty: true,
        notes: 'Patient appears weak and short of breath',
      })
      .expect(200)

    assert.equal(res.body.patientName, 'Ah Chong')
    assert.equal(res.body.emergencyLevel, 'Critical')
    assert.deepEqual(res.body.detectedEmergencies, [
      'Severe low oxygen',
      'Possible shock',
      'High fever',
      'Breathing difficulty',
    ])
    assert.deepEqual(res.body.immediateActions, [
      'Notify doctor immediately',
      'Prepare oxygen support',
      'Monitor vital signs continuously',
      'Prepare possible hospital transfer',
      'Stay with patient',
    ])
    assert.equal(
      res.body.aiSummary,
      'Critical emergency detected due to severe low oxygen, unstable blood pressure and breathing difficulty.',
    )
    assert.equal(res.body.responseTimePriority, 'Immediate')
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('POST /api/v1/escalation/check (rule-based; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app)
      .post('/api/v1/escalation/check')
      .set('Content-Type', 'application/json')
      .send({
        patientName: 'Ah Chong',
        bloodPressure: '180/110',
        pulse: 120,
        temperature: 39.2,
        oxygen: 89,
        painScore: 8,
        mood: 'Agitated',
        mobility: 'Bedbound',
        woundCondition: 'Redness with discharge',
        notes: 'Patient appears weak and confused',
      })
      .expect(200)

    assert.equal(res.body.patientName, 'Ah Chong')
    assert.equal(res.body.escalationRequired, true)
    assert.equal(res.body.priority, 'Urgent')
    assert.deepEqual(res.body.reasons, [
      'Very high blood pressure',
      'Low oxygen',
      'High fever',
      'Confusion/agitation',
      'Possible wound infection',
    ])
    assert.deepEqual(res.body.recommendedActions, [
      'Notify doctor immediately',
      'Monitor oxygen closely',
      'Repeat vital signs within 15 minutes',
      'Prepare possible hospital transfer',
    ])
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('GET /api/v1/dashboard/summary (dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app).get('/api/v1/dashboard/summary').expect(200)

    assert.ok(Number.isFinite(res.body.totalPatients))
    assert.ok(Array.isArray(res.body.highRiskPatients))
    assert.ok(Array.isArray(res.body.pendingTasks))
    assert.ok(res.body.alerts && typeof res.body.alerts === 'object')
    assert.ok(Number.isFinite(res.body.alerts.fallRisk))
    assert.ok(Number.isFinite(res.body.alerts.pressureUlcerRisk))
    assert.ok(Number.isFinite(res.body.alerts.vitalAlerts))
    assert.ok(Number.isFinite(res.body.alerts.woundAlerts))
    assert.ok(Number.isFinite(res.body.alerts.medicationAlerts))
    assert.ok(Number.isFinite(res.body.alerts.doctorEscalations))
    assert.ok(['Stable', 'Attention Required'].includes(res.body.shiftStatus))
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('GET /api/v1/dashboard (dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app).get('/api/v1/dashboard').expect(200)

    assert.ok(res.body.summary && typeof res.body.summary === 'object')
    assert.ok(Array.isArray(res.body.nursingRecords))
    assert.ok(Array.isArray(res.body.sideTurning))
    assert.ok(res.body.ot && typeof res.body.ot === 'object')
    assert.ok(Number.isFinite(res.body.ot.recordCount))
    assert.ok(Array.isArray(res.body.alerts))
    assert.ok(typeof res.body.fetchedAt === 'string')
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('POST /api/v1/admin/clear-records (dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app).post('/api/v1/admin/clear-records').expect(200)

    assert.equal(res.body.ok, true)
    assert.ok(Array.isArray(res.body.memoryStoresCleared))
    assert.ok(typeof res.body.clearedAt === 'string')
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('POST /api/v1/nursing/parse (dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app)
      .post('/api/v1/nursing/parse')
      .send({
        text: 'Room 2 Ali poor appetite weak mobility turned left',
        nurseName: 'Nurse Test',
        source: 'api',
      })
      .expect(201)

    assert.equal(res.body.ok, true)
    assert.equal(res.body.rawText, 'Room 2 Ali poor appetite weak mobility turned left')
    assert.ok(res.body.parsed)
    assert.equal(res.body.parsed.room, '2')
    assert.ok(Array.isArray(res.body.alerts))
    assert.ok(typeof res.body.confirmationMessage === 'string')
    assert.ok(['rules', 'deepseek', 'openai'].includes(res.body.parser))
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('DELETE /api/v1/admin/reset (dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app).delete('/api/v1/admin/reset').expect(200)

    assert.equal(res.body.ok, true)
    assert.equal(res.body.message, 'Records deleted successfully')
    assert.ok(Array.isArray(res.body.memoryStoresCleared))
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('DELETE /api/v1/admin/reset-patients (dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app).delete('/api/v1/admin/reset-patients').expect(200)

    assert.equal(res.body.ok, true)
    assert.equal(res.body.message, 'Patient records cleared')
    assert.ok(Array.isArray(res.body.categoriesCleared))
    assert.ok(res.body.categoriesCleared.includes('patients'))
    assert.ok(res.body.categoriesCleared.includes('rehabProgress'))
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('GET /api/v1/tasks/queue (dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app).get('/api/v1/tasks/queue').expect(200)

    assert.ok(Array.isArray(res.body.tasks))
    assert.ok(res.body.summary && typeof res.body.summary === 'object')
    assert.ok(Number.isFinite(res.body.summary.urgentTasks))
    assert.ok(Number.isFinite(res.body.summary.highPriorityTasks))
    assert.ok(Number.isFinite(res.body.summary.mediumPriorityTasks))
    assert.ok(Number.isFinite(res.body.summary.totalTasks))
    assert.equal(
      res.body.summary.totalTasks,
      res.body.tasks.length,
      'totalTasks should match queued items',
    )
    for (const t of res.body.tasks) {
      assert.ok(typeof t.priority === 'string')
      assert.ok(typeof t.patientName === 'string')
      assert.ok(typeof t.task === 'string')
      assert.ok(typeof t.dueTime === 'string')
      assert.ok(typeof t.source === 'string')
    }
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('POST /api/v1/reminders/create + GET /api/v1/reminders/list (in-memory; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const create = await request(app)
      .post('/api/v1/reminders/create')
      .set('Content-Type', 'application/json')
      .send({
        patientName: 'Ah Chong',
        reminderType: 'Side Turning',
        task: 'Turn patient to right side',
        dueTime: '12:00',
        assignedTo: 'Nurse Mary',
        priority: 'High',
        repeatEveryHours: 2,
        notes: 'Photo required after turning',
      })
      .expect(201)

    assert.equal(create.body.message, 'Reminder created successfully')
    assert.ok(create.body.reminder && typeof create.body.reminder === 'object')
    assert.match(create.body.reminder.id, /^[\da-f-]{36}$/i)
    assert.equal(create.body.reminder.patientName, 'Ah Chong')
    assert.equal(create.body.reminder.reminderType, 'Side Turning')
    assert.equal(create.body.reminder.task, 'Turn patient to right side')
    assert.equal(create.body.reminder.dueTime, '12:00')
    assert.equal(create.body.reminder.assignedTo, 'Nurse Mary')
    assert.equal(create.body.reminder.priority, 'High')
    assert.equal(create.body.reminder.repeatEveryHours, 2)
    assert.equal(create.body.reminder.notes, 'Photo required after turning')
    assert.equal(create.body.nextReminderTime, '14:00')
    assert.equal(create.body.alert, 'High priority reminder created')

    const list = await request(app).get('/api/v1/reminders/list').expect(200)

    assert.ok(Array.isArray(list.body.reminders))
    assert.ok(list.body.reminders.length >= 1)
    const newest = list.body.reminders[0]
    assert.equal(newest.id, create.body.reminder.id)
    assert.equal(newest.patientName, 'Ah Chong')
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('POST /api/v1/announcements/create + GET /api/v1/announcements/list (in-memory; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const create = await request(app)
      .post('/api/v1/announcements/create')
      .set('Content-Type', 'application/json')
      .send({
        title: 'High Fever Monitoring',
        message: 'Please monitor all fever patients every 2 hours tonight.',
        createdBy: 'Supervisor Jane',
        priority: 'High',
        targetShift: 'Night Shift',
        requiresAcknowledgement: true,
      })
      .expect(201)

    assert.equal(create.body.message, 'Announcement created successfully')
    assert.ok(create.body.announcement && typeof create.body.announcement === 'object')
    assert.match(create.body.announcement.id, /^[\da-f-]{36}$/i)
    assert.equal(create.body.announcement.title, 'High Fever Monitoring')
    assert.equal(
      create.body.announcement.message,
      'Please monitor all fever patients every 2 hours tonight.',
    )
    assert.equal(create.body.announcement.createdBy, 'Supervisor Jane')
    assert.equal(create.body.announcement.priority, 'High')
    assert.equal(create.body.announcement.targetShift, 'Night Shift')
    assert.equal(create.body.announcement.requiresAcknowledgement, true)
    assert.deepEqual(create.body.announcement.acknowledgements, [])
    assert.equal(create.body.alert, 'High priority announcement for Night Shift')

    await request(app)
      .post('/api/v1/announcements/acknowledge')
      .set('Content-Type', 'application/json')
      .send({
        announcementId: create.body.announcement.id,
        acknowledgedBy: 'Nurse Mary',
      })
      .expect(200)

    const list = await request(app).get('/api/v1/announcements/list').expect(200)

    assert.ok(Array.isArray(list.body.announcements))
    assert.ok(list.body.announcements.length >= 1)
    const newest = list.body.announcements[0]
    assert.equal(newest.id, create.body.announcement.id)
    assert.ok(Array.isArray(newest.acknowledgements))
    assert.ok(newest.acknowledgements.length >= 1)
    assert.equal(newest.acknowledgements[0].acknowledgedBy, 'Nurse Mary')
    assert.ok(typeof newest.acknowledgements[0].acknowledgedAt === 'string')
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('POST /api/v1/acknowledgements/confirm + GET /api/v1/acknowledgements/list (in-memory; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const create = await request(app)
      .post('/api/v1/acknowledgements/confirm')
      .set('Content-Type', 'application/json')
      .send({
        nurseName: 'Nurse Mary',
        announcementId: 'ANN-001',
        announcementTitle: 'High Fever Monitoring',
        acknowledged: true,
        acknowledgedAt: '2026-05-19 21:15',
        notes: 'Will monitor fever patients every 2 hours',
      })
      .expect(201)

    assert.equal(create.body.message, 'Acknowledgement recorded successfully')
    assert.equal(create.body.status, 'Confirmed')
    assert.ok(create.body.record && typeof create.body.record === 'object')
    assert.match(create.body.record.id, /^[\da-f-]{36}$/i)
    assert.equal(create.body.record.nurseName, 'Nurse Mary')
    assert.equal(create.body.record.announcementId, 'ANN-001')
    assert.equal(create.body.record.announcementTitle, 'High Fever Monitoring')
    assert.equal(create.body.record.itemType, 'Announcement')
    assert.equal(create.body.record.acknowledged, true)
    assert.equal(create.body.record.acknowledgedAt, '2026-05-19 21:15')
    assert.equal(create.body.record.notes, 'Will monitor fever patients every 2 hours')
    assert.equal(create.body.record.status, 'Confirmed')

    const list = await request(app).get('/api/v1/acknowledgements/list').expect(200)

    assert.ok(Array.isArray(list.body.acknowledgements))
    assert.ok(list.body.acknowledgements.length >= 1)
    assert.equal(list.body.acknowledgements[0].id, create.body.record.id)
    assert.equal(list.body.acknowledgements[0].announcementId, 'ANN-001')
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('POST /api/v1/incidents/report + GET /api/v1/incidents/reports (dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const payload = {
      patientName: 'Ah Chong',
      incidentType: 'Fall',
      incidentTime: '2026-05-19 14:30',
      location: 'Ward A',
      reportedBy: 'Nurse Mary',
      injuryDetected: true,
      injuryDetails: 'Minor bruise on left arm',
      vitalStatus: 'Stable',
      doctorInformed: true,
      familyInformed: false,
      notes: 'Patient attempted to walk without assistance',
    }

    const create = await request(app)
      .post('/api/v1/incidents/report')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(201)

    assert.equal(create.body.message, 'Incident report created successfully')
    assert.equal(create.body.incidentSeverity, 'Medium')
    assert.equal(
      create.body.aiSummary,
      'Patient experienced a fall incident in Ward A. Minor bruise detected on left arm. Doctor has been informed. Family notification still pending.',
    )
    assert.deepEqual(create.body.recommendedActions, [
      'Monitor patient for 24 hours',
      'Complete fall risk reassessment',
      'Inform family members',
      'Increase supervision during transfer',
    ])
    assert.equal(create.body.report.patientName, 'Ah Chong')
    assert.match(create.body.report.id, /^[\da-f-]{36}$/i)

    const list = await request(app).get('/api/v1/incidents/reports').expect(200)
    assert.ok(Array.isArray(list.body.reports))
    assert.ok(list.body.reports.length >= 1)
    assert.ok(list.body.reports.some((r: { id?: string }) => r.id === create.body.report.id))
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('POST /api/v1/risk/bed-exit (rule-based; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app)
      .post('/api/v1/risk/bed-exit')
      .set('Content-Type', 'application/json')
      .send({
        patientName: 'Ah Chong',
        age: 82,
        mobility: 'Walks with assistance',
        confusion: true,
        fallRiskLevel: 'High',
        wanderingRiskLevel: 'High',
        bedExitAttempt: true,
        timeOfAttempt: '02:30',
        nightShift: true,
        notes: 'Patient tried to get out of bed without assistance',
      })
      .expect(200)

    assert.equal(res.body.patientName, 'Ah Chong')
    assert.equal(res.body.bedExitAlertLevel, 'Urgent')
    assert.deepEqual(res.body.alertReasons, [
      'High fall risk',
      'High wandering risk',
      'Confusion',
      'Night bed-exit attempt',
    ])
    assert.deepEqual(res.body.recommendedActions, [
      'Assist patient immediately',
      'Check for injury',
      'Increase night supervision',
      'Activate bed/chair alarm if available',
      'Document incident if patient fell',
    ])
    assert.equal(
      res.body.aiSummary,
      'Ah Chong attempted to leave bed at night without assistance. Due to high fall and wandering risk, urgent nursing attention is required.',
    )
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})

test('POST /api/v1/risk/wandering (rule-based; dev JWT bypass)', async () => {
  const prevEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const res = await request(app)
      .post('/api/v1/risk/wandering')
      .set('Content-Type', 'application/json')
      .send({
        patientName: 'Ah Chong',
        age: 82,
        diagnosis: 'Dementia',
        confusion: true,
        agitation: true,
        nightRestlessness: true,
        historyOfWandering: true,
        mobility: 'Walks with assistance',
        sleepPattern: 'Poor',
        notes: 'Patient attempted to leave room twice last night',
      })
      .expect(200)

    assert.equal(res.body.patientName, 'Ah Chong')
    assert.equal(res.body.wanderingRiskScore, 9)
    assert.equal(res.body.riskLevel, 'High')
    assert.deepEqual(res.body.riskFactors, [
      'Dementia',
      'Confusion',
      'Night restlessness',
      'History of wandering',
      'Agitation',
    ])
    assert.deepEqual(res.body.recommendations, [
      'Increase night supervision',
      'Use bed/chair alarm',
      'Monitor room exit activity',
      'Provide calming reassurance',
    ])
    assert.equal(
      res.body.aiSummary,
      'Patient shows high wandering risk due to dementia, confusion, agitation and previous wandering behavior.',
    )
  } finally {
    process.env.NODE_ENV = prevEnv
  }
})
