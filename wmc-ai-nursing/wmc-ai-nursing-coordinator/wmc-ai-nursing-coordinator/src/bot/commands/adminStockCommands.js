/**
 * Admin Stock Control Commands  (Stage 8)
 *
 * /add_stock    — Add new supply for an item (restock)
 * /adjust_stock — Manually set balance (correction)
 * /set_minimum  — Change minimum alert threshold
 * /set_price    — Change unit price for a category
 *
 * All commands use multi-step workflows via stateManager (workflow = 'admin_stock').
 * They are listed in SELF_HANDLED_WORKFLOWS so the global handler ignores them.
 *
 * Every action logs to Inventory_Audit_Trail.
 */

import { log }                              from '../utils/logger.js'
import { setState, getState, clearState, withSessionLock }   from '../services/stateManager.js'
import { addStock, adjustStock, setMinimumLevel, isSheetConfigured, getStockBalance }
                                             from '../services/inventorySheets.js'
import { updatePrice, getPrices, PRICE_UNITS } from '../services/billingPrices.js'
import { logAuditEvent }                    from '../services/auditTrailService.js'
import { ITEMS }                            from '../../lib/inventoryCalculation.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const D = '─────────────────────────'

const ALL_ITEM_KEYS = Object.keys(ITEMS)   // ['PAMPERS_M','PAMPERS_L', …]
const CATEGORIES    = ['pampers', 'wet', 'milk', 'gloves']

/** Build a numbered item list string for Telegram. */
function buildItemList() {
  return ALL_ITEM_KEYS.map((k, i) => `${i + 1}. ${k} — ${ITEMS[k].name}`).join('\n')
}

/** Resolve an item key from either a number ("3") or a direct key ("PAMPERS_M"). */
function resolveItemKey(input) {
  const trimmed = (input ?? '').trim().toUpperCase()
  if (ALL_ITEM_KEYS.includes(trimmed)) return trimmed
  const n = Number(input)
  if (!isNaN(n) && n >= 1 && n <= ALL_ITEM_KEYS.length) return ALL_ITEM_KEYS[n - 1]
  return null
}

// ── Shared step handler ───────────────────────────────────────────────────────

/**
 * All four workflows share this step handler.
 * The current step is in state.step.
 */
async function handleAdminStockStep(bot, msg) {
  const chatId = msg.chat.id
  const text   = (msg.text ?? '').trim()
  const state  = getState(msg)
  if (!state || state.workflow !== 'admin_stock') return

  const { command } = state

  // ── /add_stock steps ──────────────────────────────────────────────────────
  if (command === 'add_stock') {
    if (state.step === 'item') {
      const key = resolveItemKey(text)
      if (!key) {
        await bot.sendMessage(chatId, `❌ Invalid item. Reply with a number (1–${ALL_ITEM_KEYS.length}) or an exact key like PAMPERS_M.`)
        return
      }
      setState(msg, { ...state, step: 'qty', item_key: key })
      await bot.sendMessage(chatId, `📦 Item: *${ITEMS[key].name}*\n\nHow many units to add? (e.g. 50)`, { parse_mode: 'Markdown' })
      return
    }
    if (state.step === 'qty') {
      const qty = Number(text)
      if (isNaN(qty) || qty <= 0) {
        await bot.sendMessage(chatId, '❌ Please enter a valid number greater than 0.')
        return
      }
      setState(msg, { ...state, step: 'remarks', qty })
      await bot.sendMessage(chatId, `🔢 Qty: *${qty}*\n\nRemarks? (e.g. "Delivery from supplier") or type *-* to skip`, { parse_mode: 'Markdown' })
      return
    }
    if (state.step === 'remarks') {
      const remarks = text === '-' ? `Stock added: +${state.qty}` : text
      clearState(msg)
      try {
        let result = { balance: 0, opening_stock: 0 }
        if (isSheetConfigured()) {
          result = await addStock(state.item_key, state.qty)
        }

        logAuditEvent({
          timestamp:   new Date().toISOString(),
          action_type: 'STOCK_ADD',
          nurse_name:  msg.from?.first_name ?? msg.from?.username ?? '',
          telegram_username: msg.from?.username ?? '',
          item_key:    state.item_key,
          qty:         state.qty,
          before_stock: Math.max(0, (result.balance ?? 0) - state.qty),
          after_stock:  result.balance ?? 0,
          source:      'telegram',
          remarks,
        }).catch(() => {})

        const itemName = ITEMS[state.item_key]?.name ?? state.item_key
        await bot.sendMessage(chatId, [
          `✅ *Stock Added*`,
          D,
          `📦 Item: ${itemName}`,
          `➕ Qty Added: *${state.qty}*`,
          `📊 New Balance: *${result.balance ?? 'N/A'}*`,
          `📝 Remarks: ${remarks}`,
          D,
          isSheetConfigured() ? '✔️ Saved to Google Sheet' : '⚠️ Demo mode — not saved to Sheet',
        ].join('\n'), { parse_mode: 'Markdown' })
        log.info(`[admin-stock] /add_stock — ${state.item_key} +${state.qty} → balance:${result.balance}`)
      } catch (err) {
        log.error('[admin-stock] add_stock error:', err.message)
        await bot.sendMessage(chatId, `⚠️ Failed to add stock.\n${err.message}`)
      }
      return
    }
  }

  // ── /adjust_stock steps ───────────────────────────────────────────────────
  if (command === 'adjust_stock') {
    if (state.step === 'item') {
      const key = resolveItemKey(text)
      if (!key) {
        await bot.sendMessage(chatId, `❌ Invalid item. Reply with a number (1–${ALL_ITEM_KEYS.length}) or a key like PAMPERS_M.`)
        return
      }
      // Fetch current balance for context
      let currentBalance = '?'
      if (isSheetConfigured()) {
        const rows = await getStockBalance().catch(() => [])
        currentBalance = rows.find((r) => r.item_key === key)?.balance ?? '?'
      }
      setState(msg, { ...state, step: 'new_balance', item_key: key, before: currentBalance })
      await bot.sendMessage(
        chatId,
        `📦 Item: *${ITEMS[key].name}*\nCurrent balance: *${currentBalance}*\n\nSet new balance to: (e.g. 80)`,
        { parse_mode: 'Markdown' }
      )
      return
    }
    if (state.step === 'new_balance') {
      const nb = Number(text)
      if (isNaN(nb) || nb < 0) {
        await bot.sendMessage(chatId, '❌ Please enter a valid number (0 or more).')
        return
      }
      setState(msg, { ...state, step: 'reason', new_balance: nb })
      await bot.sendMessage(chatId, `📊 New balance: *${nb}*\n\nReason for adjustment? (or type *-* to skip)`, { parse_mode: 'Markdown' })
      return
    }
    if (state.step === 'reason') {
      const reason = text === '-' ? 'Manual stock adjustment' : text
      clearState(msg)
      try {
        let result = { balance: state.new_balance }
        if (isSheetConfigured()) {
          result = await adjustStock(state.item_key, state.new_balance)
        }

        logAuditEvent({
          timestamp:   new Date().toISOString(),
          action_type: 'STOCK_ADJUSTMENT',
          nurse_name:  msg.from?.first_name ?? msg.from?.username ?? '',
          telegram_username: msg.from?.username ?? '',
          item_key:    state.item_key,
          qty:         state.new_balance - (Number(state.before) || 0),
          before_stock: Number(state.before) || 0,
          after_stock:  result.balance,
          source:      'telegram',
          remarks:     reason,
        }).catch(() => {})

        const itemName = ITEMS[state.item_key]?.name ?? state.item_key
        await bot.sendMessage(chatId, [
          `✅ *Stock Adjusted*`,
          D,
          `📦 Item: ${itemName}`,
          `📊 Before: ${state.before} → After: *${result.balance}*`,
          `📝 Reason: ${reason}`,
          D,
          isSheetConfigured() ? '✔️ Saved to Google Sheet' : '⚠️ Demo mode — not saved to Sheet',
        ].join('\n'), { parse_mode: 'Markdown' })
        log.info(`[admin-stock] /adjust_stock — ${state.item_key}: ${state.before} → ${result.balance}`)
      } catch (err) {
        log.error('[admin-stock] adjust_stock error:', err.message)
        await bot.sendMessage(chatId, `⚠️ Failed to adjust stock.\n${err.message}`)
      }
      return
    }
  }

  // ── /set_minimum steps ────────────────────────────────────────────────────
  if (command === 'set_minimum') {
    if (state.step === 'item') {
      const key = resolveItemKey(text)
      if (!key) {
        await bot.sendMessage(chatId, `❌ Invalid item. Reply with a number (1–${ALL_ITEM_KEYS.length}) or a key like PAMPERS_M.`)
        return
      }
      setState(msg, { ...state, step: 'min_level', item_key: key })
      await bot.sendMessage(
        chatId,
        `📦 Item: *${ITEMS[key].name}*\n\nEnter new minimum stock level: (e.g. 20)`,
        { parse_mode: 'Markdown' }
      )
      return
    }
    if (state.step === 'min_level') {
      const ml = Number(text)
      if (isNaN(ml) || ml < 0) {
        await bot.sendMessage(chatId, '❌ Please enter a valid number (0 or more).')
        return
      }
      clearState(msg)
      try {
        let result = { minimum_level: ml }
        if (isSheetConfigured()) {
          result = await setMinimumLevel(state.item_key, ml)
        }

        logAuditEvent({
          timestamp:   new Date().toISOString(),
          action_type: 'STOCK_ADJUSTMENT',
          nurse_name:  msg.from?.first_name ?? msg.from?.username ?? '',
          telegram_username: msg.from?.username ?? '',
          item_key:    state.item_key,
          qty:         0,
          before_stock: 0,
          after_stock:  0,
          source:      'telegram',
          remarks:     `Minimum level set to ${ml}`,
        }).catch(() => {})

        const itemName = ITEMS[state.item_key]?.name ?? state.item_key
        await bot.sendMessage(chatId, [
          `✅ *Minimum Level Updated*`,
          D,
          `📦 Item: ${itemName}`,
          `⚠️ New Minimum: *${result.minimum_level}*`,
          `💡 Alert will trigger when balance ≤ ${result.minimum_level}`,
          D,
          isSheetConfigured() ? '✔️ Saved to Google Sheet' : '⚠️ Demo mode — not saved to Sheet',
        ].join('\n'), { parse_mode: 'Markdown' })
        log.info(`[admin-stock] /set_minimum — ${state.item_key}: min=${result.minimum_level}`)
      } catch (err) {
        log.error('[admin-stock] set_minimum error:', err.message)
        await bot.sendMessage(chatId, `⚠️ Failed to update minimum.\n${err.message}`)
      }
      return
    }
  }

  // ── /set_price steps ──────────────────────────────────────────────────────
  if (command === 'set_price') {
    if (state.step === 'category') {
      const cat = text.toLowerCase().trim()
      if (!CATEGORIES.includes(cat)) {
        await bot.sendMessage(chatId, `❌ Invalid category. Reply with one of:\n${CATEGORIES.join(' | ')}`)
        return
      }
      const prices     = getPrices()
      const currentPrc = prices[cat] ?? 0
      setState(msg, { ...state, step: 'price', category: cat, before_price: currentPrc })
      await bot.sendMessage(
        chatId,
        `💰 Category: *${cat}*\nCurrent price: *RM${currentPrc.toFixed(2)}*\n\nEnter new unit price in RM: (e.g. 2.50)`,
        { parse_mode: 'Markdown' }
      )
      return
    }
    if (state.step === 'price') {
      const price = Number(text)
      if (isNaN(price) || price < 0) {
        await bot.sendMessage(chatId, '❌ Please enter a valid price (e.g. 2.50).')
        return
      }
      clearState(msg)
      const updated  = updatePrice(state.category, price)
      const newPrice = updated[state.category] ?? price

      logAuditEvent({
        timestamp:   new Date().toISOString(),
        action_type: 'PRICE_UPDATE',
        nurse_name:  msg.from?.first_name ?? msg.from?.username ?? '',
        telegram_username: msg.from?.username ?? '',
        item_key:    state.category,
        qty:         0,
        before_stock: 0,
        after_stock:  0,
        source:      'telegram',
        remarks:     `${state.category} price: RM${(state.before_price ?? 0).toFixed(2)} → RM${newPrice.toFixed(2)}`,
      }).catch(() => {})

      const unit = PRICE_UNITS[state.category] ?? 'unit'
      await bot.sendMessage(chatId, [
        `✅ *Price Updated*`,
        D,
        `🏷️ Category: ${state.category}`,
        `💰 Before: RM${(state.before_price ?? 0).toFixed(2)} / ${unit}`,
        `💰 After:  *RM${newPrice.toFixed(2)} / ${unit}*`,
        D,
        `_Price saved for next billing generation_`,
      ].join('\n'), { parse_mode: 'Markdown' })
      log.info(`[admin-stock] /set_price — ${state.category}: RM${newPrice}`)
      return
    }
  }
}

// ── Command entry-points ──────────────────────────────────────────────────────

async function startAddStock(bot, msg) {
  const chatId = msg.chat.id
  clearState(msg)
  setState(msg, { workflow: 'admin_stock', command: 'add_stock', step: 'item' })
  await bot.sendMessage(chatId, [
    `📦 *Add Stock — Restock Entry*`,
    D,
    `Which item? Reply with number or key:`,
    '',
    buildItemList(),
  ].join('\n'), { parse_mode: 'Markdown' })
}

async function startAdjustStock(bot, msg) {
  const chatId = msg.chat.id
  clearState(msg)
  setState(msg, { workflow: 'admin_stock', command: 'adjust_stock', step: 'item' })
  await bot.sendMessage(chatId, [
    `🔧 *Adjust Stock — Manual Correction*`,
    D,
    `Which item? Reply with number or key:`,
    '',
    buildItemList(),
  ].join('\n'), { parse_mode: 'Markdown' })
}

async function startSetMinimum(bot, msg) {
  const chatId = msg.chat.id
  clearState(msg)
  setState(msg, { workflow: 'admin_stock', command: 'set_minimum', step: 'item' })
  await bot.sendMessage(chatId, [
    `⚠️ *Set Minimum Level*`,
    D,
    `Which item? Reply with number or key:`,
    '',
    buildItemList(),
  ].join('\n'), { parse_mode: 'Markdown' })
}

async function startSetPrice(bot, msg) {
  const chatId = msg.chat.id
  clearState(msg)
  setState(msg, { workflow: 'admin_stock', command: 'set_price', step: 'category' })
  const prices = getPrices()
  const lines  = CATEGORIES.map((c) => `• ${c}: RM${prices[c]?.toFixed(2) ?? '0.00'} / ${PRICE_UNITS[c] ?? 'unit'}`)
  await bot.sendMessage(chatId, [
    `💰 *Set Item Price*`,
    D,
    `Current prices:`,
    ...lines,
    '',
    `Which category? Reply with: pampers | wet | milk | gloves`,
  ].join('\n'), { parse_mode: 'Markdown' })
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerAdminStockCommands(bot) {
  bot.onText(/^\/add_stock\b/i,    (msg) => startAddStock(bot, msg))
  bot.onText(/^\/adjust_stock\b/i, (msg) => startAdjustStock(bot, msg))
  bot.onText(/^\/set_minimum\b/i,  (msg) => startSetMinimum(bot, msg))
  bot.onText(/^\/set_price\b/i,    (msg) => startSetPrice(bot, msg))

  // Step handler — registered BEFORE the global handler
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return
    const state = getState(msg)
    if (state?.workflow === 'admin_stock') {
      await withSessionLock(msg, () => handleAdminStockStep(bot, msg))
    }
  })

  log.info('[bot] admin stock commands registered')
}
