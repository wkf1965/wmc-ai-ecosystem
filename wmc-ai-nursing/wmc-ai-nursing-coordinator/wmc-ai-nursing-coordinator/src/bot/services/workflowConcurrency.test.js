import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, unlinkSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  hasProcessedMessage,
  markMessageProcessed,
  acquireWorkflowLock,
  releaseWorkflowLock,
  workflowLocks,
} from './workflowConcurrency.js'

const DATA_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../data/workflowSessions.json')

function makeMsg(chatId, userId, messageId, text) {
  return {
    chat: { id: chatId },
    from: { id: userId, username: 'nurse1', first_name: 'Nurse' },
    message_id: messageId,
    text,
  }
}

test('duplicate message ids are ignored', () => {
  const msg = makeMsg(-100, 42, 9001, 'Lee si ming')
  assert.equal(hasProcessedMessage(msg), false)
  markMessageProcessed(msg)
  assert.equal(hasProcessedMessage(msg), true)
})

test('workflow lock prevents overlapping handlers', async () => {
  const key = '-100:42'
  assert.equal(acquireWorkflowLock(key), true)
  assert.equal(acquireWorkflowLock(key), false)
  releaseWorkflowLock(key)
  assert.equal(workflowLocks.has(key), false)
})

test('admit workflow advances one step per message only', async () => {
  if (existsSync(DATA_FILE)) unlinkSync(DATA_FILE)

  const {
    getState,
    setState,
    setAwaitingReply,
    beginProcessing,
    finishProcessing,
    nextStep,
    getSessionKey,
  } = await import('./stateManager.js')

  const msg1 = makeMsg(-100123, 42, 1, 'Lee si ming')
  const msg2 = makeMsg(-100123, 42, 2, '45')

  setState(msg1, 'admit', 0, {}, {})
  setAwaitingReply(msg1, true)

  assert.equal(beginProcessing(msg1), true)
  nextStep(msg1, { patientName: 'Lee si ming' })
  setAwaitingReply(msg1, true)
  finishProcessing(msg1, { lastProcessedMessageId: 1 })

  const afterOne = getState(msg1)
  assert.equal(afterOne.step, 1)
  assert.equal(afterOne.awaitingReply, true)
  assert.equal(afterOne.data.patientName, 'Lee si ming')

  setAwaitingReply(msg2, true)
  assert.equal(beginProcessing(msg2), true)
  nextStep(msg2, { age: '45' })
  setAwaitingReply(msg2, true)
  finishProcessing(msg2, { lastProcessedMessageId: 2 })

  const afterTwo = getState(msg2)
  assert.equal(afterTwo.step, 2)
  assert.equal(afterTwo.data.age, '45')
  assert.notEqual(getSessionKey(msg1), getSessionKey(makeMsg(-100123, 99, 3, 'other')))
})

test.after(() => {
  if (existsSync(DATA_FILE)) unlinkSync(DATA_FILE)
})
