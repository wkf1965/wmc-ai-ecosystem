/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Database Module                               ║
 * ║                                                              ║
 * ║  Purpose: Abstracts data storage behind a unified adapter   ║
 * ║  interface so the CRM can switch backends without           ║
 * ║  changing business logic.                                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Storage backends (planned in order of complexity):
 *
 *   ✅ Phase 1 — Google Sheets (current)
 *      Simple, visible, shareable. No SQL required.
 *      Files: sheetsMemory.js, sheetsPipeline.js, etc.
 *
 *   🔲 Phase 2 — SQLite (local, no server required)
 *      Good for local persistence + complex queries.
 *      File: database/sqlite.adapter.js
 *
 *   🔲 Phase 3 — PostgreSQL (production-ready)
 *      For multi-user, multi-clinic deployments.
 *      File: database/postgres.adapter.js
 *
 *   🔲 Phase 4 — Hybrid (Sheets as UI + DB as source of truth)
 *      Sheets become a read-only view layer.
 *      DB is authoritative. Sync runs every N minutes.
 *
 * Adapter interface (all adapters must implement):
 *   findByPhone(phone)           → object | null
 *   upsert(phone, data)          → void
 *   append(table, data)          → void
 *   queryAll(table, filter?)     → object[]
 *
 * TODO:
 *   - Create GoogleSheetsAdapter implementing the above interface
 *   - Create SQLiteAdapter
 *   - Export a single `db` object based on DATABASE_BACKEND env var
 */

"use strict";

const BACKEND = process.env.DATABASE_BACKEND || "sheets";

// ── Stub adapter (interface reference) ───────────────────────────────────────

const SheetsAdapter = {
  async findByPhone(table, phone) {
    console.log(`[DB:sheets] findByPhone(${table}, ${phone}) — stub`);
    return null;
  },
  async upsert(table, phone, data) {
    console.log(`[DB:sheets] upsert(${table}, ${phone}) — stub`);
  },
  async append(table, data) {
    console.log(`[DB:sheets] append(${table}) — stub`);
  },
  async queryAll(table, filter) {
    console.log(`[DB:sheets] queryAll(${table}) — stub`);
    return [];
  },
};

const adapters = {
  sheets: SheetsAdapter,
  // sqlite:   require('./sqlite.adapter'),   // TODO
  // postgres: require('./postgres.adapter'), // TODO
};

const db = adapters[BACKEND] || SheetsAdapter;

console.log(`[Database] Using adapter: ${BACKEND}`);

module.exports = { db, BACKEND };
