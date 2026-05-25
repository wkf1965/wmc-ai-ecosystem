/**
 * Intent classifier tests — run: npm run test:intent
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyTelegramIntent,
  hasNursingKeywords,
  hasInventoryKeywords,
  isClearInventoryMessage,
} from './telegramIntentClassifier.js'
import { parseNlpInventory, shouldRejectInventoryParse } from './inventoryCalculation.js'

test('Room 2 Ali poor appetite => nursing_record', () => {
  const intent = classifyTelegramIntent('Room 2 Ali poor appetite')
  assert.equal(intent.category, 'nursing_record')
  assert.equal(intent.room, '2')
  assert.equal(intent.patient_name, 'Ali')
  assert.equal(intent.appetite, 'poor')
  assert.equal(shouldRejectInventoryParse('Room 2 Ali poor appetite'), true)
  const inv = parseNlpInventory('Room 2 Ali poor appetite')
  assert.equal(inv.itemKey, null)
})

test('Room 2 patient Ali poor appetite => nursing_record with structured fields', () => {
  const intent = classifyTelegramIntent('Room 2 patient Ali poor appetite')
  assert.equal(intent.category, 'nursing_record')
  assert.equal(intent.room, '2')
  assert.equal(intent.patient_name, 'Ali')
  assert.equal(intent.appetite, 'poor')
})

test('Room 2 Ali turned left => side_turning', () => {
  const intent = classifyTelegramIntent('Room 2 Ali turned left')
  assert.equal(intent.category, 'side_turning')
  assert.equal(intent.room, '2')
  assert.equal(intent.patient_name, 'Ali')
  assert.equal(intent.turning, 'left')
})

test('Milk powder 2 scoops room 2 Ali => inventory', () => {
  const intent = classifyTelegramIntent('Milk powder 2 scoops room 2 Ali')
  assert.equal(intent.category, 'inventory')
  assert.ok(hasInventoryKeywords('Milk powder 2 scoops room 2 Ali'))
  assert.ok(isClearInventoryMessage('Milk powder 2 scoops room 2 Ali'))
  const inv = parseNlpInventory('Milk powder 2 scoops room 2 Ali')
  assert.ok(inv.itemKey?.startsWith('MILK'))
  assert.equal(inv.qty, 2)
  assert.equal(inv.room, '2')
})

test('Pampers 1 piece room 3 Ahmad => inventory', () => {
  const intent = classifyTelegramIntent('Pampers 1 piece room 3 Ahmad')
  assert.equal(intent.category, 'inventory')
  const inv = parseNlpInventory('Pampers 1 piece room 3 Ahmad')
  assert.ok(inv.itemKey?.startsWith('PAMPERS'))
  assert.equal(inv.qty, 1)
  assert.equal(inv.room, '3')
})

test('nursing keywords without inventory items are not classified as inventory', () => {
  assert.ok(hasNursingKeywords('Room 2 patient Ali poor appetite'))
  assert.equal(hasInventoryKeywords('Room 2 patient Ali poor appetite'), false)
  assert.equal(classifyTelegramIntent('Room 2 patient Ali poor appetite').category, 'nursing_record')
})

test('unknown free text is not inventory', () => {
  assert.equal(classifyTelegramIntent('hello nurse').category, 'unknown')
})
