/**
 * Session reset tests — run: npm run test:session
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  setState,
  getState,
  finishInventorySession,
  clearState,
} from './stateManager.js'

function fakeMsg(chatId = 999001, userId = 111) {
  return {
    chat: { id: chatId },
    from: { id: userId, first_name: 'TestNurse' },
  }
}

test('finishInventorySession clears step, flow, and pendingInventory', () => {
  const msg = fakeMsg()
  setState(msg, {
    workflow: 'inventory',
    flow: 'inventory',
    pendingInventory: 'milk',
    subtype: 'milk',
    step: 2,
    answers: { patient_name: 'Ali' },
  })

  assert.ok(getState(msg))
  finishInventorySession(msg, 'inventory complete')
  assert.equal(getState(msg), null)
})

test('clearState allows nursing notes after inventory workflow', () => {
  const msg = fakeMsg(999002, 112)
  setState(msg, {
    workflow: 'inventory',
    flow: 'inventory',
    pendingInventory: 'pampers',
    step: 1,
    answers: {},
  })

  clearState(msg, 'cancelled')
  assert.equal(getState(msg), null)
})
