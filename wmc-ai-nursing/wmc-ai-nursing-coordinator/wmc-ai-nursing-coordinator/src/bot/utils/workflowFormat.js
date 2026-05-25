/**
 * Shared HTML formatting for nursing workflow summaries.
 */

import { escapeHtml } from './safeMessage.js'

export const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━━'

export function htmlConfirmHeader(title) {
  return `📋 <b>${escapeHtml(title)}</b>`
}

export function htmlField(label, value) {
  return `${label} ${escapeHtml(value)}`
}

export function htmlConfirmFooter() {
  return 'Reply <b>yes</b> to save  |  <b>no</b> to cancel'
}

export function htmlWarning(text) {
  return `\n⚠️ <b>${escapeHtml(text)}</b>`
}

export function htmlCritical(text) {
  return `\n🚨 <b>${escapeHtml(text)}</b>`
}

export function htmlWorkflowIntro(workflow, total) {
  return [
    `${workflow.icon} <b>${escapeHtml(workflow.title)}</b>`,
    DIVIDER,
    `${total} questions — answer one at a time.`,
    'Send /cancel at any time to stop.',
  ].join('\n')
}

export function htmlWorkflowQuestion(stepNumber, total, question) {
  return `<b>(${stepNumber}/${total})</b> ${question}`
}
