/**
 * NLP Router tests — run: npm run test:nlp-router
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { routeNlpMessage, NLP_LOW_CONFIDENCE_REPLY } from './nlpRouter.js'

test('Room 2 Ali poor appetite routes to nursing without active workflow', async () => {
  const result = await routeNlpMessage({
    text: 'Room 2 Ali poor appetite',
    chatId: 1,
    nurseName: 'Siti',
    bot: null,
    clearWorkflowOnNursing: false,
  })

  assert.equal(result.handled, true)
  assert.equal(result.route, 'nursing')
  assert.equal(result.intent.category, 'nursing_record')
  assert.match(result.reply ?? '', /Nursing Record Saved/)
  assert.match(result.reply ?? '', /Room: 2/)
  assert.match(result.reply ?? '', /Patient: Ali/)
  assert.match(result.reply ?? '', /Appetite: Poor/)
})

test('low confidence nursing text returns fallback prompt', async () => {
  const result = await routeNlpMessage({
    text: 'poor appetite today',
    chatId: 2,
    nurseName: 'Siti',
    bot: null,
  })

  assert.equal(result.handled, true)
  assert.equal(result.reply, NLP_LOW_CONFIDENCE_REPLY)
})

test('inventory text routes to inventory category', async () => {
  const result = await routeNlpMessage({
    text: 'Pampers 1 piece room 3 Ahmad',
    chatId: 3,
    nurseName: 'Siti',
    bot: null,
  })

  assert.equal(result.handled, false)
  assert.equal(result.intent.category, 'inventory')
})
