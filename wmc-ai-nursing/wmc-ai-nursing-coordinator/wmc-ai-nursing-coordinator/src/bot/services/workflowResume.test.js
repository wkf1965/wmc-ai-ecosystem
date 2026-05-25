import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, unlinkSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { VITALS_WORKFLOW } from '../workflows/vitalsWorkflow.js'
import { registerWorkflowMap, prepareSessionForResume, shouldShowCommandWarning, markCommandWarningShown } from './workflowResume.js'

const DATA_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../data/workflowSessions.json')

registerWorkflowMap({ vitals: VITALS_WORKFLOW })

function makeMsg(chatId, userId, messageId, text) {
  return {
    chat: { id: chatId },
    from: { id: userId, username: 'nurse1', first_name: 'Nurse' },
    message_id: messageId,
    text,
  }
}

test('workflow resumes after command interruption leaves awaitingReply false', async () => {
  if (existsSync(DATA_FILE)) unlinkSync(DATA_FILE)

  const { setState, setAwaitingReply, getState } = await import('./stateManager.js')

  const msg = makeMsg(-100, 42, 1, 'Ali')
  setState(msg, 'vitals', 0, {}, {})
  setAwaitingReply(msg, true)

  const stuck = getState(msg)
  stuck.awaitingReply = false
  stuck.processing = false

  const restored = prepareSessionForResume(msg)
  assert.equal(restored.awaitingReply, true)
  assert.equal(restored.processing, false)
  assert.equal(restored.step, 0)
})

test('command warning shows only once per step', async () => {
  if (existsSync(DATA_FILE)) unlinkSync(DATA_FILE)

  const { setState } = await import('./stateManager.js')
  const msg = makeMsg(-100, 42, 1, '/turning')

  setState(msg, 'vitals', 1, { patientName: 'Ali' }, {})
  assert.equal(shouldShowCommandWarning(msg), true)
  markCommandWarningShown(msg)
  assert.equal(shouldShowCommandWarning(msg), false)
})

test.after(() => {
  if (existsSync(DATA_FILE)) unlinkSync(DATA_FILE)
})
