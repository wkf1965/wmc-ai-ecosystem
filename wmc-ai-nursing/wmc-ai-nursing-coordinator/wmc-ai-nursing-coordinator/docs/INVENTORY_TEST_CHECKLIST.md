# WMC AI Nursing — Inventory System Test Checklist

**System:** WMC AI Nursing Coordinator  
**Module:** Inventory Management (Stages 2–9)  
**Test Patients:** Ali (Room 2) · Mary (Room 5) · Tan Ah Kow (Room 7)  
**Test Nurses:** Nurse Aina · Nurse Mei · Nurse Siti

> **Before testing:** Ensure both servers are running:
> ```bash
> npm run dev        # Frontend — http://localhost:3000
> npm run telegram   # Backend  — http://localhost:3001
> ```

---

## 0. Pre-flight Health Check

| # | Test | Expected | Pass |
|---|------|----------|------|
| 0.1 | `GET http://localhost:3001/api/inventory/health` | `"inventory": "ok"` in JSON | ☐ |
| 0.2 | Check `googleSheets` field | `"connected"` or `"fallback (demo mode)"` | ☐ |
| 0.3 | Open `http://localhost:3000/inventory` | Dashboard loads without error | ☐ |
| 0.4 | Open `http://localhost:3000/inventory-mobile` | Mobile page loads | ☐ |

### Seed Test Data
```bash
curl -X POST http://localhost:3001/api/inventory/seed-test-data
```
Expected: `{ "ok": true, "saved": 14, "patients": [...], "nurses": [...] }`

---

## 1. Telegram Command Tests

### 1.1 Pampers Workflow
| # | Action | Expected Reply | Pass |
|---|--------|----------------|------|
| 1.1.1 | Send `/pampers` | Bot asks: Patient name | ☐ |
| 1.1.2 | Reply: `Ali` | Bot asks: Room | ☐ |
| 1.1.3 | Reply: `2` | Bot asks: Size (M/L/XL) | ☐ |
| 1.1.4 | Reply: `M` | Bot asks: Qty | ☐ |
| 1.1.5 | Reply: `3` | Bot asks: Remarks | ☐ |
| 1.1.6 | Reply: `-` (skip) | Confirmation: `✅ Inventory Recorded … Patient: Ali … Item: Pampers … Qty: 3 pcs` | ☐ |
| 1.1.7 | Verify in dashboard | New entry in Overview → Activity Log | ☐ |

### 1.2 Wet Tissue Workflow
| # | Action | Expected Reply | Pass |
|---|--------|----------------|------|
| 1.2.1 | Send `/wet` | Bot asks: Patient name | ☐ |
| 1.2.2 | Reply: `Mary` → `5` → Qty `2` → Remarks `-` | `✅ Inventory Recorded … Wet Tissue ×2 packs` | ☐ |

### 1.3 Milk Workflow
| # | Action | Expected | Pass |
|---|--------|----------|------|
| 1.3.1 | Send `/milk` → `Tan Ah Kow` → `7` → `Full Cream` → `3` → `-` | Confirmation with milk details | ☐ |

### 1.4 Gloves Workflow
| # | Action | Expected | Pass |
|---|--------|----------|------|
| 1.4.1 | Send `/gloves` → `M` → `10` → `Ward use` | Confirmation, no patient required | ☐ |

### 1.5 Stock Check
| # | Command | Expected | Pass |
|---|---------|----------|------|
| 1.5.1 | `/stock` | All items listed with current balance | ☐ |
| 1.5.2 | `/usage` | Today's usage totals | ☐ |
| 1.5.3 | `/daily_usage` | 📊 Daily report with all categories | ☐ |
| 1.5.4 | `/monthly_usage` | Monthly summary for current month | ☐ |
| 1.5.5 | `/low_stock` | Items below minimum level | ☐ |
| 1.5.6 | `/abnormal_usage` | Abnormal usage flagged if any | ☐ |

### 1.6 Billing Command
| # | Command | Expected | Pass |
|---|---------|----------|------|
| 1.6.1 | `/billing Ali` | 💰 Billing summary for Ali | ☐ |
| 1.6.2 | `/billing Mary 2026-05` | Billing for Mary, May 2026 | ☐ |

### 1.7 Audit Command
| # | Command | Expected | Pass |
|---|---------|----------|------|
| 1.7.1 | `/audit Ali` | Latest records for patient Ali | ☐ |
| 1.7.2 | `/audit Nurse Aina` | Records by Nurse Aina + suspicious usage check | ☐ |
| 1.7.3 | `/audit pampers` | All pampers transactions | ☐ |
| 1.7.4 | `/audit` (no arg) | Usage guide shown | ☐ |

### 1.8 Admin Stock Commands
| # | Command | Expected | Pass |
|---|---------|----------|------|
| 1.8.1 | `/add_stock` → `1` (PAMPERS_M) → `50` → `-` | `✅ Stock Added … Qty Added: 50` | ☐ |
| 1.8.2 | `/adjust_stock` → `1` → `80` → `Count correction` | `✅ Stock Adjusted` with before/after | ☐ |
| 1.8.3 | `/set_minimum` → `1` → `25` | `✅ Minimum Level Updated: 25` | ☐ |
| 1.8.4 | `/set_price` → `pampers` → `2.50` | `✅ Price Updated RM2.00 → RM2.50` | ☐ |

---

## 2. NLP Message Tests

> Send these messages directly in the Telegram chat (no command prefix).

| # | Message | Expected | Pass |
|---|---------|----------|------|
| 2.1 | `Room 2 Ali pampers 3` | Auto-save: `✅ Inventory Recorded … Pampers ×3` | ☐ |
| 2.2 | `wet tissue 2 Mary Room 5` | Auto-save: Wet Tissue ×2 for Mary | ☐ |
| 2.3 | `Nurse Aina gave Tan Ah Kow pampers M size 4` | Auto-save with Nurse Aina as recorder | ☐ |
| 2.4 | `gloves M 10` | Auto-save gloves (no patient) | ☐ |
| 2.5 | `milk 3 Ali room 2` | Auto-save milk for Ali | ☐ |
| 2.6 | Unrecognised text: `hello` | No error; falls back to "no active workflow" message | ☐ |

---

## 3. Backend API Tests

> Run with both Google Sheet configured and in fallback (demo) mode.

### 3.1 Basic Inventory APIs
```bash
# Health check
GET  http://localhost:3001/api/inventory/health

# Logs
GET  http://localhost:3001/api/inventory/logs
GET  http://localhost:3001/api/inventory/logs?date=2026-05-22
GET  http://localhost:3001/api/inventory/logs?month=2026-05

# Stock balance
GET  http://localhost:3001/api/inventory/stock

# Alerts
GET  http://localhost:3001/api/inventory/alerts

# Patient usage
GET  http://localhost:3001/api/inventory/patient-usage?month=2026-05

# Nurse usage
GET  http://localhost:3001/api/inventory/nurse-usage?month=2026-05

# Add record
POST http://localhost:3001/api/inventory/add
Body: { "item_key":"PAMPERS_M","qty":3,"patient_name":"Ali","room":"2","nurse_name":"Nurse Aina","source":"api-test" }
```

### 3.2 Report APIs
```bash
GET  http://localhost:3001/api/inventory/report/daily
GET  http://localhost:3001/api/inventory/report/monthly-patient?month=2026-05
GET  http://localhost:3001/api/inventory/report/monthly-nurse?month=2026-05
GET  http://localhost:3001/api/inventory/report/low-stock
GET  http://localhost:3001/api/inventory/report/abnormal?date=2026-05-22
```

### 3.3 Billing APIs
```bash
GET  http://localhost:3001/api/inventory/billing?month=2026-05
POST http://localhost:3001/api/inventory/billing/generate
     Body: { "month":"2026-05" }
POST http://localhost:3001/api/inventory/billing/update-price
     Body: { "category":"pampers","unit_price":2.50 }
POST http://localhost:3001/api/inventory/billing/mark-paid
     Body: { "month":"2026-05","patient_name":"Ali","status":"Paid" }
GET  http://localhost:3001/api/inventory/billing/prices
```

### 3.4 Audit Trail APIs
```bash
GET  http://localhost:3001/api/inventory/audit
GET  http://localhost:3001/api/inventory/audit?nurse=Aina&date=2026-05-22
GET  http://localhost:3001/api/inventory/audit?patient=Ali
GET  http://localhost:3001/api/inventory/audit/by-nurse?name=Aina&date=2026-05-22
GET  http://localhost:3001/api/inventory/audit/by-patient?name=Ali&month=2026-05
GET  http://localhost:3001/api/inventory/audit/by-item?item_key=pampers
```

### 3.5 Admin Stock Control APIs
```bash
POST http://localhost:3001/api/inventory/stock/add
     Body: { "item_key":"PAMPERS_M","qty":50,"remarks":"Delivery from supplier" }

POST http://localhost:3001/api/inventory/stock/adjust
     Body: { "item_key":"WET_TISSUE","new_balance":35,"reason":"Count correction" }

POST http://localhost:3001/api/inventory/stock/set-minimum
     Body: { "item_key":"PAMPERS_M","minimum_level":25 }

POST http://localhost:3001/api/inventory/price/set
     Body: { "category":"pampers","unit_price":2.50 }
```

### 3.6 Seed & Health
```bash
POST http://localhost:3001/api/inventory/seed-test-data
GET  http://localhost:3001/api/inventory/health
```

| # | Test | Expected | Pass |
|---|------|----------|------|
| 3.1 | All GET endpoints return `{ ok: true, ... }` | Status 200 | ☐ |
| 3.2 | POST `/add` with valid body | Returns `{ ok: true, saved: true }` | ☐ |
| 3.3 | POST with missing fields | Returns `{ ok: false, error: "..." }` | ☐ |
| 3.4 | GET endpoints without Sheet configured | Returns `source: "demo"` not an error | ☐ |
| 3.5 | POST `/seed-test-data` | Returns saved count ≥ 14 | ☐ |

---

## 4. Google Sheet Integration Tests

| # | Test | How to Verify | Pass |
|---|------|---------------|------|
| 4.1 | After `/pampers` bot command | New row in `Inventory_Logs` tab | ☐ |
| 4.2 | After `/pampers` bot command | `Stock_Balance` balance decrements | ☐ |
| 4.3 | If balance < minimum | New row in `Low_Stock_Alerts` tab | ☐ |
| 4.4 | Patient month totals | `Patient_Usage` tab shows correct month | ☐ |
| 4.5 | Nurse month totals | `Nurse_Usage` tab shows correct month | ☐ |
| 4.6 | After `/billing generate` | `Inventory_Billing` tab upserted | ☐ |
| 4.7 | After `/mark-paid` | `billing_status` = `Paid` in Sheet | ☐ |
| 4.8 | After any inventory save | New row in `Inventory_Audit_Trail` | ☐ |
| 4.9 | After `/add_stock` | `Stock_Balance.opening_stock` increases | ☐ |
| 4.10 | After `/set_minimum` | `Stock_Balance.minimum_level` updates | ☐ |

---

## 5. Dashboard Tests

Open `http://localhost:3000/inventory` and test each tab:

### 5.1 Overview Tab
| # | Test | Expected | Pass |
|---|------|----------|------|
| 5.1.1 | Page loads | KPI cards visible, no blank screen | ☐ |
| 5.1.2 | Data source badge | Shows `sheets` (or `demo`) | ☐ |
| 5.1.3 | Stock cards | All 9 items shown with progress bar | ☐ |
| 5.1.4 | Low stock card | Red badge if any item below minimum | ☐ |
| 5.1.5 | Activity log | Latest 50 records with timestamps | ☐ |
| 5.1.6 | Search box | Filters logs by patient / nurse / item | ☐ |
| 5.1.7 | Add record form | Submits and reloads activity log | ☐ |
| 5.1.8 | Refresh button | Spins and reloads all data | ☐ |

### 5.2 Reports Tab
| # | Test | Expected | Pass |
|---|------|----------|------|
| 5.2.1 | Select "Daily Usage" → Run Report | Table with item totals | ☐ |
| 5.2.2 | Select "Monthly Patient Usage" → Run Report | Table per patient | ☐ |
| 5.2.3 | Select "Monthly Nurse Usage" → Run Report | Table per nurse | ☐ |
| 5.2.4 | Select "Low Stock" → Run Report | Items at/below minimum | ☐ |
| 5.2.5 | Select "Abnormal Usage" → Run Report | Flagged patients if any | ☐ |
| 5.2.6 | Export CSV button | Downloads CSV file | ☐ |

### 5.3 Billing Tab
| # | Test | Expected | Pass |
|---|------|----------|------|
| 5.3.1 | Click "Generate Billing" | Billing rows appear | ☐ |
| 5.3.2 | Filter by patient "Ali" | Shows only Ali's rows | ☐ |
| 5.3.3 | Click "Mark Paid" | Status changes to Paid | ☐ |
| 5.3.4 | Update price for pampers to RM2.50 | Price saved | ☐ |
| 5.3.5 | Export CSV | Downloads billing CSV | ☐ |

### 5.4 Audit Trail Tab
| # | Test | Expected | Pass |
|---|------|----------|------|
| 5.4.1 | Tab loads | Table with recent audit records | ☐ |
| 5.4.2 | Search nurse "Aina" → Search | Only Aina's records shown | ☐ |
| 5.4.3 | Search patient "Ali" | Only Ali's records | ☐ |
| 5.4.4 | Search item "pampers" | Only pampers transactions | ☐ |
| 5.4.5 | Date filter today → Search | Only today's records | ☐ |
| 5.4.6 | Action badge colours | GIVE_TO_PATIENT=teal, TAKE_ITEM=blue, etc. | ☐ |
| 5.4.7 | Export CSV | Downloads audit CSV | ☐ |
| 5.4.8 | Suspicious usage banner | Shows if nurse exceeded threshold | ☐ |

### 5.5 Admin Tab
| # | Test | Expected | Pass |
|---|------|----------|------|
| 5.5.1 | "Open →" mobile link | Navigates to `/inventory-mobile` | ☐ |
| 5.5.2 | Add Stock form: select PAMPERS_M, qty 50 | Success message + new balance | ☐ |
| 5.5.3 | Adjust Stock: PAMPERS_M → 80 | Balance set confirmation | ☐ |
| 5.5.4 | Set Minimum: PAMPERS_M → 25 | Minimum updated | ☐ |
| 5.5.5 | Set Price: pampers → 2.50 | Price updated | ☐ |
| 5.5.6 | "View Full Audit Trail" button | Switches to Audit tab | ☐ |

---

## 6. Mobile UI Tests

Open `http://localhost:3000/inventory-mobile` (or resize browser to mobile width).

| # | Test | Expected | Pass |
|---|------|----------|------|
| 6.1 | Page loads on mobile | No overflow, clean layout | ☐ |
| 6.2 | Tap "Pampers" button | Blue highlight, form appears | ☐ |
| 6.3 | Tap "M" size | Selected state shown | ☐ |
| 6.4 | Tap "+" qty button | Count increases | ☐ |
| 6.5 | Tap "−" at qty 1 | Stays at 1 (minimum) | ☐ |
| 6.6 | Fill Patient: Ali, Room: 2 | Fields accept input | ☐ |
| 6.7 | Fill Nurse Name | Name persists after reload (localStorage) | ☐ |
| 6.8 | Tap "Submit — Pampers ×3" | Toast success, form resets | ☐ |
| 6.9 | Recent entries section | New entry appears after submit | ☐ |
| 6.10 | Low stock alert banner | Visible if any item low | ☐ |
| 6.11 | Dismiss alert ✕ | Alert disappears | ☐ |
| 6.12 | Back button "←" | Returns to `/inventory` | ☐ |

---

## 7. Low Stock Alert Tests

| # | Test | How to Trigger | Expected | Pass |
|---|------|----------------|----------|------|
| 7.1 | Telegram alert | Set balance below minimum via `/adjust_stock` | Telegram message `⚠️ Low Stock Alert: Pampers M remaining only X` after next `/pampers` | ☐ |
| 7.2 | Dashboard badge | Stock falls below minimum | Red KPI badge "Low Stock!" | ☐ |
| 7.3 | Overview card | Red progress bar + alert | Stock card turns red | ☐ |
| 7.4 | Report endpoint | `GET /api/inventory/report/low-stock` | Returns item in `alerts` array | ☐ |
| 7.5 | Alert auto-resolves | Run `/add_stock` to push above minimum | `Low_Stock_Alerts` row updated to `Resolved` | ☐ |
| 7.6 | Mobile UI banner | Low stock item selected | Yellow banner shows `⚠️ Below minimum` inside form | ☐ |

---

## 8. Billing Tests

| # | Test | Expected | Pass |
|---|------|----------|------|
| 8.1 | Generate billing for Ali, May 2026 | Itemised charges: Pampers + Wet Tissue + Milk | ☐ |
| 8.2 | Total amount correct | `Total = Qty × Unit_Price` for each item | ☐ |
| 8.3 | Default prices applied | Pampers RM2.00, Wet RM5.00, Milk RM80.00, Gloves RM0.50 | ☐ |
| 8.4 | Mark Ali as Paid | Status = Paid in Sheet + dashboard | ☐ |
| 8.5 | Re-generate billing | Existing Paid row preserved (not reset to Unpaid) | ☐ |
| 8.6 | `/billing Ali` Telegram | Summary matches dashboard | ☐ |

---

## 9. Audit Trail Tests

| # | Test | Expected | Pass |
|---|------|----------|------|
| 9.1 | After any `/pampers` save | New row in `Inventory_Audit_Trail` with `GIVE_TO_PATIENT` | ☐ |
| 9.2 | Gloves save (no patient) | `TAKE_ITEM` action type | ☐ |
| 9.3 | After `/billing generate` | `BILLING_GENERATED` row | ☐ |
| 9.4 | After `/mark-paid` | `MARK_PAID` row | ☐ |
| 9.5 | After `/set_price` | `PRICE_UPDATE` row | ☐ |
| 9.6 | After `/add_stock` | `STOCK_ADD` row | ☐ |
| 9.7 | After `/adjust_stock` | `STOCK_ADJUSTMENT` row | ☐ |
| 9.8 | `/audit Nurse Aina` suspicious check | ⚠️ shown if ≥30 pampers in 8h | ☐ |
| 9.9 | Before/after stock values accurate | `before = after + qty` | ☐ |

---

## 10. Integration / Edge Case Tests

| # | Test | Expected | Pass |
|---|------|----------|------|
| 10.1 | Telegram + dashboard both show same log | Consistent data source | ☐ |
| 10.2 | API unavailable (stop `npm run telegram`) | Dashboard falls back to demo data, no crash | ☐ |
| 10.3 | Google Sheet not configured | All APIs return `source: "demo"` | ☐ |
| 10.4 | Invalid item key in POST `/add` | `{ ok: false, error: "..." }` | ☐ |
| 10.5 | `/billing` for patient with no logs | "No billing data found" message | ☐ |
| 10.6 | `/audit` with no match | "No records found" in reply | ☐ |
| 10.7 | NLP with unknown item | "Could not identify item" fallback | ☐ |
| 10.8 | Qty of 0 in POST `/stock/add` | `{ ok: false, error: "qty must be > 0" }` | ☐ |
| 10.9 | Other modules still work | `/turn_left`, `/punchin`, `/handover` unaffected | ☐ |

---

## Quick Test Script (cURL)

```bash
# 1. Health
curl http://localhost:3001/api/inventory/health

# 2. Seed data
curl -X POST http://localhost:3001/api/inventory/seed-test-data

# 3. Stock
curl http://localhost:3001/api/inventory/stock

# 4. Add record
curl -X POST http://localhost:3001/api/inventory/add \
  -H "Content-Type: application/json" \
  -d '{"item_key":"PAMPERS_M","qty":3,"patient_name":"Ali","room":"2","nurse_name":"Nurse Aina","source":"test"}'

# 5. Audit trail
curl "http://localhost:3001/api/inventory/audit?patient=Ali"

# 6. Billing
curl -X POST http://localhost:3001/api/inventory/billing/generate \
  -H "Content-Type: application/json" \
  -d '{"month":"2026-05"}'

# 7. Low stock report
curl http://localhost:3001/api/inventory/report/low-stock
```

---

*Last updated: Stage 9 — May 2026*
