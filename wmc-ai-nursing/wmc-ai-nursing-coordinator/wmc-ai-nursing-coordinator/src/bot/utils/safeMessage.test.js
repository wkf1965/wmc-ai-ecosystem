import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml } from './safeMessage.js'
import { ADMIT_WORKFLOW } from '../workflows/admitWorkflow.js'
import { VITALS_WORKFLOW } from '../workflows/vitalsWorkflow.js'
import { TURNING_WORKFLOW } from '../workflows/turningWorkflow.js'

test('escapeHtml handles names and symbols used in nursing input', () => {
  assert.equal(escapeHtml('Lee si ming'), 'Lee si ming')
  assert.equal(escapeHtml('Room_2'), 'Room_2')
  assert.equal(escapeHtml('[test] (A&B) <note>'), '[test] (A&amp;B) &lt;note&gt;')
  assert.equal(escapeHtml('45'), '45')
})

test('workflow summaries escape patient input safely', () => {
  const data = {
    patientName: 'Lee_si [ming] <test>',
    age: '45',
    gender: 'male',
    room: 'Room_2',
    diagnosis: 'CVA & HTN',
    doctor: 'Dr. O_Brien',
    admissionDate: 'today',
    remark: '-',
  }

  const summary = ADMIT_WORKFLOW.buildSummary(data)
  assert.match(summary, /Lee_si \[ming\] &lt;test&gt;/)
  assert.doesNotMatch(summary, /\*Please confirm/)
  assert.match(summary, /<b>yes<\/b>/)
})

test('vitals and turning summaries escape unsafe characters', () => {
  const vitals = VITALS_WORKFLOW.buildSummary({
    patientName: 'Ali*Bin_Ahmad',
    room: '2A',
    bp: '120/80',
    pulse: '88',
    temperature: '37.1',
    spo2: '98',
    bloodSugar: '5.5',
    remark: '[stable]',
  })
  assert.match(vitals, /Ali\*Bin_Ahmad/)

  const turning = TURNING_WORKFLOW.buildSummary({
    patientName: 'Lee si ming',
    room: 'Room 2',
    time: 'now',
    position: 'left_side',
    skinCondition: 'redness (stage_1)',
    remark: '-',
  })
  assert.match(turning, /Lee si ming/)
  assert.match(turning, /redness \(stage_1\)/)
})
