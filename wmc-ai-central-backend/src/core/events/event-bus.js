/**
 * WMC AI Event Bus
 *
 * Lightweight in-process pub/sub built on Node's EventEmitter.
 * Singleton — safe to require from any module; all subscribers share one instance.
 *
 * Current backend: Node EventEmitter (synchronous, in-process).
 * Future backend:  Redis Pub/Sub or RabbitMQ (drop-in via adapter pattern).
 *
 * Usage:
 *   const { emitEvent, onEvent } = require('../core/events/event-bus')
 *   const { EVENT_TYPES } = require('../core/events/event-types')
 *
 *   // Emit (fire-and-forget)
 *   emitEvent(EVENT_TYPES.NURSING_RECORD_CREATED, { patientId, nurseName })
 *
 *   // Subscribe
 *   onEvent(EVENT_TYPES.NURSING_RECORD_CREATED, async (payload) => { ... })
 */

const EventEmitter = require('events')
const { EVENT_TYPES } = require('./event-types')

// ---------------------------------------------------------------------------
// Singleton bus
// ---------------------------------------------------------------------------

const g = /** @type {any} */ (global)

/** @type {EventEmitter} */
const bus = g.__wmc_event_bus ?? new EventEmitter()

// Raise the default listener limit to accommodate many subscribers per event.
bus.setMaxListeners(50)

if (process.env.NODE_ENV !== 'production') {
  g.__wmc_event_bus = bus
}

// ---------------------------------------------------------------------------
// In-memory event log — useful for debugging and /events/recent endpoint
// ---------------------------------------------------------------------------

/** @type {Array<{id:string, type:string, payload:any, emittedAt:string}>} */
const EVENT_LOG = []
const EVENT_LOG_MAX = 200
let _seq = 1

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Emit an event to all registered listeners.
 *
 * @param {string} type    - One of EVENT_TYPES
 * @param {Object} payload - Event data (serialisable object)
 * @returns {{ id: string, type: string, emittedAt: string }} envelope
 */
function emitEvent(type, payload = {}) {
  if (!Object.values(EVENT_TYPES).includes(type)) {
    console.warn(`[EventBus] Unknown event type: "${type}" — emit anyway but check event-types.js`)
  }

  const envelope = {
    id:        `evt-${String(_seq++).padStart(6, '0')}`,
    type,
    payload,
    emittedAt: new Date().toISOString(),
  }

  // Log to ring buffer
  EVENT_LOG.unshift(envelope)
  if (EVENT_LOG.length > EVENT_LOG_MAX) EVENT_LOG.pop()

  if (process.env.NODE_ENV !== 'production') {
    const preview = JSON.stringify(payload).slice(0, 80)
    console.info(`[EVENT] ${envelope.emittedAt} | ${type.padEnd(36)} | ${preview}`)
  }

  // Emit synchronously — listeners run in registration order
  bus.emit(type, envelope)

  return envelope
}

/**
 * Register an event listener.
 *
 * @param {string}   type     - One of EVENT_TYPES
 * @param {Function} handler  - async (envelope) => void
 */
function onEvent(type, handler) {
  bus.on(type, async (envelope) => {
    try {
      await handler(envelope)
    } catch (err) {
      console.error(`[EventBus] Error in listener for "${type}":`, err.message)
    }
  })
}

/**
 * One-time listener (fires once then auto-removes).
 */
function onceEvent(type, handler) {
  bus.once(type, async (envelope) => {
    try {
      await handler(envelope)
    } catch (err) {
      console.error(`[EventBus] Error in once-listener for "${type}":`, err.message)
    }
  })
}

/**
 * Remove all listeners for a given event type.
 * Useful for test isolation.
 */
function offEvent(type) {
  bus.removeAllListeners(type)
}

/**
 * Returns a read-only copy of the recent event log.
 * @param {{ limit?: number, type?: string }} [filters]
 */
function getEventLog(filters = {}) {
  let logs = [...EVENT_LOG]
  if (filters.type) logs = logs.filter((e) => e.type === filters.type)
  const limit = filters.limit ? Math.min(Number(filters.limit), EVENT_LOG_MAX) : 50
  return logs.slice(0, limit)
}

/**
 * Returns listener count for a given event type.
 * Useful for startup diagnostics.
 */
function listenerCount(type) {
  return bus.listenerCount(type)
}

module.exports = { emitEvent, onEvent, onceEvent, offEvent, getEventLog, listenerCount, EVENT_TYPES }
