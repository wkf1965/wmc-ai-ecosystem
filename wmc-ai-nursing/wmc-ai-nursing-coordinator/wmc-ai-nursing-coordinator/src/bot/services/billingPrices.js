/**
 * Billing Price Manager
 *
 * Stores unit prices per item category in
 * src/bot/data/billingPrices.json (auto-created on first write).
 *
 * Prices are keyed by category: pampers | wet | milk | gloves
 *
 * Default prices (RM):
 *   pampers → 2.00  (per pcs)
 *   wet     → 5.00  (per pack)
 *   milk    → 80.00 (per unit / tin)
 *   gloves  → 0.50  (per pcs)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

const DATA_DIR   = join(__dirname, '../data')
const PRICES_FILE = join(DATA_DIR, 'billingPrices.json')

/** Default unit prices in RM. */
export const DEFAULT_PRICES = {
  pampers: 2.00,
  wet:     5.00,
  milk:    80.00,
  gloves:  0.50,
}

export const PRICE_UNITS = {
  pampers: 'per pcs',
  wet:     'per pack',
  milk:    'per unit',
  gloves:  'per pcs',
}

/** Read persisted prices, merged over defaults. */
export function getPrices() {
  try {
    if (!existsSync(PRICES_FILE)) return { ...DEFAULT_PRICES }
    const stored = JSON.parse(readFileSync(PRICES_FILE, 'utf-8'))
    return { ...DEFAULT_PRICES, ...stored }
  } catch {
    return { ...DEFAULT_PRICES }
  }
}

/**
 * Update the price for one category and persist.
 *
 * @param {string} category   'pampers' | 'wet' | 'milk' | 'gloves'
 * @param {number} price      unit price in RM
 * @returns {object}          full prices map after update
 */
export function updatePrice(category, price) {
  const prices = getPrices()
  prices[category] = Math.round(Number(price) * 100) / 100   // 2 decimals
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(PRICES_FILE, JSON.stringify(prices, null, 2))
  } catch (e) {
    console.warn('[billing-prices] could not persist prices:', e.message)
  }
  return prices
}

/** Compute the total amount for a given category and qty. */
export function computeAmount(category, qty) {
  const prices = getPrices()
  return Math.round(Number(qty) * (prices[category] ?? 0) * 100) / 100
}
