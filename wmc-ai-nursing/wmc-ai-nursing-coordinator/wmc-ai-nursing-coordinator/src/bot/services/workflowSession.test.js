/**
 * Workflow session smoke test — admit flow through 8 steps.
 * Run: node --test src/bot/services/workflowSession.test.js
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, unlinkSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const DATA_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../data/workflowSessions.json')

function makeMsg(chatId, userId, text) {
  return {
    chat: { id: chatId },
    from: { id: userId, username: 'nurse1', first_name: 'Nurse' },
    text,
  }
}

test('admit workflow persists across 8 steps per chatId+userId', async () => {
  if (existsSync(DATA_FILE)) unlinkSync(DATA_FILE)

  const {
    getState,
    setState,
    nextStep,
    setAwaitingConfirmation,
    clearState,
    getSessionKey,
    withSessionLock,
  } = await import('./stateManager.js')

  const msg = makeMsg(-100123, 42, 'John Doe')
  const key = getSessionKey(msg)

  setState(msg, 'admit', 0, {}, { chatId: '-100123', userId: '42', username: 'nurse1', firstName: 'Nurse' })
  assert.equal(getState(msg)?.workflow, 'admit')
  assert.equal(getState(msg)?.step, 0)

  const answers = ['John Doe', '72', 'male', '12', 'Stroke', 'Dr Lim', 'today', 'none']
  for (let i = 0; i < answers.length; i += 1) {
    await withSessionLock(msg, async () => {
      const state = getState(msg)
      assert.ok(state, `session missing at step ${i}`)
      assert.equal(state.workflow, 'admit')
      assert.equal(state.step, i)
      nextStep(msg, { [`field${i}`]: answers[i] })
    })
  }

  const finalState = getState(msg)
  assert.equal(finalState.step, 8)
  setAwaitingConfirmation(msg)
  assert.equal(getState(msg)?.awaitingConfirmation, true)

  clearState(msg, 'test complete')
  assert.equal(getState(msg), null)

  // Different user in same group chat must not share session
  const otherUser = makeMsg(-100123, 99, 'hello')
  assert.equal(getState(otherUser), null)
  assert.notEqual(getSessionKey(otherUser), key)
})

test.after(() => {
  if (existsSync(DATA_FILE)) unlinkSync(DATA_FILE)
})
