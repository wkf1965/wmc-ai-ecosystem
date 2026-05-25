/**
 * Workflow resume helpers — restore pending step after interruption.
 */

import { getState, getSessionKey, setAwaitingReply, patchSession } from './stateManager.js'

/** @type {Record<string, object>} */
const WORKFLOW_MAP = {}

export function registerWorkflowMap(map) {
  Object.assign(WORKFLOW_MAP, map)
}

/**
 * Normalize session so text answers can continue after command interruption.
 * @returns {object|null}
 */
export function prepareSessionForResume(msg) {
  const key = getSessionKey(msg)
  const state = getState(msg)
  if (!state?.workflow) return null

  let changed = false
  const patch = { ...state }

  if (patch.processing) {
    patch.processing = false
    changed = true
    console.log('[workflow] restored', key, patch.workflow, 'cleared stuck processing flag')
  }

  const isNursingWorkflow = typeof patch.workflow === 'string' && WORKFLOW_MAP[patch.workflow]
  const shouldAcceptAnswers = patch.awaitingConfirmation || isNursingWorkflow

  if (shouldAcceptAnswers && patch.awaitingReply !== true) {
    patch.awaitingReply = true
    changed = true
    console.log(
      '[workflow] restored',
      key,
      patch.workflow,
      'step',
      patch.step + 1,
      'awaitingReply enabled',
    )
  }

  if (changed) {
    setAwaitingReply(msg, true)
  }

  return getState(msg)
}

export function getPendingStepInfo(state) {
  if (!state?.workflow) return null
  const workflow = WORKFLOW_MAP[state.workflow]
  if (!workflow) return null

  if (state.awaitingConfirmation) {
    return {
      workflow,
      stepNumber: workflow.steps.length,
      total: workflow.steps.length,
      field: 'confirmation',
      question: 'Reply yes to save or no to cancel.',
    }
  }

  const step = workflow.steps[state.step]
  if (!step) return null

  return {
    workflow,
    stepNumber: state.step + 1,
    total: workflow.steps.length,
    field: step.key,
    question: step.question,
  }
}

/**
 * Show command-block warning at most once per workflow step.
 */
export function shouldShowCommandWarning(msg) {
  const state = getState(msg)
  if (!state) return false
  const warnKey = `${state.workflow}:${state.step}:${state.sessionGeneration ?? 0}`
  if (state.lastCommandWarnKey === warnKey) return false
  return true
}

export function markCommandWarningShown(msg) {
  const state = getState(msg)
  if (!state) return
  const key = getSessionKey(msg)
  const warnKey = `${state.workflow}:${state.step}:${state.sessionGeneration ?? 0}`
  patchSession(msg, { lastCommandWarnKey: warnKey })
  console.log('[workflow] command warning shown', key, 'step', state.step + 1)
}

export function buildStatusMessage(state) {
  const pending = getPendingStepInfo(state)
  if (!pending) return 'No active workflow.'

  const { workflow, stepNumber, total, field, question } = pending
  const answered = Object.keys(state.data ?? {}).length

  return [
    `📋 <b>Active workflow:</b> ${workflow.title}`,
    `📍 <b>Step:</b> ${stepNumber}/${total}`,
    `📝 <b>Expected field:</b> ${field}`,
    `✅ <b>Answers collected:</b> ${answered}`,
    '',
    state.awaitingConfirmation
      ? '⏳ Waiting for confirmation (yes/no).'
      : `❓ <b>Current question:</b> ${question}`,
    '',
    'Send your answer, or /cancel to stop.',
  ].join('\n')
}
