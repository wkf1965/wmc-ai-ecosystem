# WMC AI Nursing Coordinator

A production-ready nursing home operations system built with React + Vite (frontend) and Node.js + Express (backend/Telegram webhook server).

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — see comments inside for each variable
```

### 3. Run the frontend (React dashboard)

```bash
npm run dev
# Opens http://localhost:3000
```

### 4. Run the Telegram webhook backend

```bash
npm run telegram
# Starts Express server on http://localhost:3001
# Serves /api/inventory/*, /api/attendance/*, and Telegram webhook
```

> Both servers must be running for the dashboard to read live data.  
> The Vite dev server automatically proxies `/api/inventory/*` and `/api/attendance/*` to port 3001.

---

## Inventory Management System

> **Complete test checklist:** [`docs/INVENTORY_TEST_CHECKLIST.md`](./docs/INVENTORY_TEST_CHECKLIST.md)

### System Overview

| Feature | Stage | Status |
|---|---|---|
| Telegram bot commands (pampers/wet/milk/gloves) | Stage 2 | ✅ |
| NLP free-text mode | Stage 2 | ✅ |
| Google Sheets integration (5 tabs) | Stage 3 | ✅ |
| Telegram step-by-step workflows | Stage 4 | ✅ |
| Reports (daily/monthly/abnormal) | Stage 5 | ✅ |
| Family billing | Stage 6 | ✅ |
| Staff audit trail | Stage 7 | ✅ |
| Mobile UI + Admin stock control | Stage 8 | ✅ |
| Health check + seed data | Stage 9 | ✅ |

### Pages & Routes

| Page | URL | Who Uses It |
|---|---|---|
| Inventory Dashboard | `/inventory` | Admin / Supervisor |
| Mobile Quick Entry | `/inventory-mobile` | Nurses (phone) |
| Pampers / Consumables | `/pampers` | Nurses |

### Dashboard Tabs

The `/inventory` page has **5 tabs**:

| Tab | Contents |
|---|---|
| **Overview** | Live stock KPIs, progress bars, activity log, add record form |
| **Reports** | Daily usage, monthly patient/nurse, low stock, abnormal — with CSV export |
| **Billing** | Monthly patient billing, prices, paid/unpaid status |
| **Audit Trail** | Every inventory action with before/after stock, search, suspicious flag |
| **Admin** | Add stock, adjust stock, set minimum level, set price |

---

## How to Use the Inventory System

### Nurse Telegram Workflow

**Step-by-step log (structured):**
```
1. Send: /pampers
2. Bot asks: Patient name  → Reply: Ali
3. Bot asks: Room          → Reply: 2
4. Bot asks: Size          → Reply: M
5. Bot asks: Qty           → Reply: 3
6. Bot asks: Remarks       → Reply: - (skip)
7. Bot confirms: ✅ Inventory Recorded
                 Patient: Ali  Room: 2
                 Item: Pampers  Size: M  Qty: 3 pcs
```

**NLP quick-entry (no command needed):**
```
Room 2 Ali pampers 3
wet tissue 2 Mary Room 5
Nurse Aina gave Tan Ah Kow pampers M size 4
```

**Via mobile browser (phones):**
```
1. Open http://localhost:3000/inventory-mobile
2. Tap item type (Pampers / Wet / Milk / Gloves)
3. Select size and fill in patient/room
4. Adjust qty with +/− stepper
5. Tap "Submit"
```

---

### Admin Dashboard Workflow

**Daily checklist:**
```
1. Open http://localhost:3000/inventory
2. Overview tab → check Low Stock alerts (red badges)
3. Reports tab → Daily Usage report → verify totals
4. If any item low → Admin tab → Add Stock → enter delivery qty
5. Audit Trail tab → search by nurse → spot-check unusual entries
```

**Adding new stock after delivery:**
```
Admin tab → Add Stock
  Item:     PAMPERS_M
  Qty:      100
  Remarks:  Delivery from supplier 22/05/2026
→ Stock Balance updated, audit logged automatically
```

**Setting item prices:**
```
Admin tab → Set Item Price
  Category: pampers
  Price:    RM2.50
→ All future billing uses this price
```

---

### Monthly Billing Workflow

```
1. End of month: Open /inventory → Billing tab
2. Click "Generate Billing" (month: 2026-05)
3. Review: per-patient itemised charges appear
4. Check totals: Qty × Unit Price = Total Amount
5. Click "Mark Paid" once family settles
6. Export CSV for accounts department
```

**Via Telegram:**
```
/billing Ali
→ 💰 Billing Summary
  Patient: Ali    Month: May 2026
  Pampers:    120 × RM2.00 = RM240.00
  Wet Tissue:  10 × RM5.00 = RM50.00
  Total: RM290.00   Status: Unpaid
```

---

### Audit Trail Workflow

**Reviewing a nurse's activity:**
```
Audit Trail tab
→ Search by Nurse: Aina
→ Click Search
→ All of Nurse Aina's transactions today appear
→ If total pampers ≥ 30 in last 8 h → ⚠️ Suspicious Usage banner shown
```

**Via Telegram:**
```
/audit Nurse Aina    → Last 10 records + suspicious check
/audit Ali           → Records for patient Ali
/audit pampers       → All pampers transactions today
```

---

### Low Stock Workflow

**Alert fires when:**
- Balance ≤ minimum level (default: Pampers M=20, Wet=10, Milk=50, Gloves=50)

**System actions (automatic):**
1. `Low_Stock_Alerts` tab in Google Sheet — new row added
2. Dashboard — red stock card + "Low Stock!" KPI badge
3. Telegram — `⚠️ Low Stock Alert` appended to next `/pampers` confirmation

**Resolution:**
```
/add_stock → PAMPERS_M → 50 → Delivery
→ balance increases above minimum
→ Low_Stock_Alerts row auto-resolved to "Resolved"
→ Dashboard alert clears on next refresh
```

---

### Telegram Bot Commands Reference

#### Nurse Commands
| Command | Description |
|---|---|
| `/pampers` | Log pampers (step-by-step) |
| `/wet` | Log wet tissue |
| `/milk` | Log milk powder |
| `/gloves` | Log gloves |
| `/stock` | Current stock balance |
| `/usage` | Today's usage summary |
| `/daily_usage` | Daily report |
| `/monthly_usage` | Monthly report |
| `/low_stock` | Low stock report |
| `/abnormal_usage` | Abnormal usage detection |
| `/billing [patient]` | Patient billing summary |
| `/audit [search]` | Audit trail search |

#### Admin Commands
| Command | Description |
|---|---|
| `/add_stock` | Add new stock (delivery) |
| `/adjust_stock` | Correct stock balance |
| `/set_minimum` | Change minimum alert level |
| `/set_price` | Update unit price for billing |

---

### Backend API (port 3001)

#### Core
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/inventory/health` | System health check |
| `GET` | `/api/inventory/logs` | Usage logs (`?date=`, `?month=`) |
| `GET` | `/api/inventory/stock` | Stock balance for all items |
| `GET` | `/api/inventory/alerts` | Active low stock alerts |
| `GET` | `/api/inventory/patient-usage` | Monthly patient totals |
| `GET` | `/api/inventory/nurse-usage` | Monthly nurse totals |
| `POST` | `/api/inventory/add` | Add usage record |

#### Reports
| Method | Endpoint |
|---|---|
| `GET` | `/api/inventory/report/daily` |
| `GET` | `/api/inventory/report/monthly-patient` |
| `GET` | `/api/inventory/report/monthly-nurse` |
| `GET` | `/api/inventory/report/low-stock` |
| `GET` | `/api/inventory/report/abnormal` |

#### Billing
| Method | Endpoint |
|---|---|
| `GET` | `/api/inventory/billing` |
| `POST` | `/api/inventory/billing/generate` |
| `POST` | `/api/inventory/billing/update-price` |
| `POST` | `/api/inventory/billing/mark-paid` |
| `GET` | `/api/inventory/billing/prices` |

#### Audit Trail
| Method | Endpoint |
|---|---|
| `GET` | `/api/inventory/audit` |
| `GET` | `/api/inventory/audit/by-nurse` |
| `GET` | `/api/inventory/audit/by-patient` |
| `GET` | `/api/inventory/audit/by-item` |

#### Admin Stock Control
| Method | Endpoint |
|---|---|
| `POST` | `/api/inventory/stock/add` |
| `POST` | `/api/inventory/stock/adjust` |
| `POST` | `/api/inventory/stock/set-minimum` |
| `POST` | `/api/inventory/price/set` |

#### Testing
| Method | Endpoint |
|---|---|
| `POST` | `/api/inventory/seed-test-data` |

> **Demo mode:** If `GOOGLE_SHEET_ID` is not set, all GET endpoints return built-in demo data automatically. The dashboard works fully without any Sheet setup.

---

### Google Sheets Setup

**Required tabs (row 1 = column headers):**

| Tab | Columns |
|---|---|
| `Inventory_Logs` | timestamp, nurse_name, telegram_username, patient_name, room, item_key, size, qty, remarks |
| `Stock_Balance` | item_key, item_name, opening_stock, used, balance, minimum_level |
| `Patient_Usage` | patient_name, month, pampers_total, wet_tissue_total, milk_total, gloves_total, total_qty |
| `Nurse_Usage` | nurse_name, month, total_items_taken, pampers, wet_tissue, milk |
| `Low_Stock_Alerts` | timestamp, item_key, item_name, balance, minimum_level, deficit, status |
| `Inventory_Billing` | month, patient_name, room, item_category, total_qty, unit_price, total_amount, billing_status, remarks |
| `Inventory_Audit_Trail` | timestamp, action_type, nurse_name, telegram_username, patient_name, room, item, qty, before_stock, after_stock, source, remarks |

**Environment variables (`.env`):**
```env
GOOGLE_SHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
```

**Setup steps:**
1. Create a Google Cloud project → enable **Google Sheets API**
2. Create a **service account** → download JSON key
3. Create a spreadsheet → share with service account email
4. Add the 7 tabs above with headers in row 1
5. Add env vars to `.env`
6. Restart `npm run telegram`

---

### Telegram Bot Setup

1. Create a bot via [@BotFather](https://t.me/BotFather), get the token.
2. Add to `.env`:

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_MODE=live
TELEGRAM_CHAT_ID=your_group_chat_id
```

3. For webhook mode (production):

```env
TELEGRAM_WEBHOOK_URL=https://YOUR_DOMAIN/api/integrations/telegram/webhook
```

   Local testing with ngrok:

```bash
ngrok http 3001
# Copy the https URL to TELEGRAM_WEBHOOK_URL
npm run telegram
```

4. Or polling mode (development):

```bash
npm run bot
```

---

## Other Modules

| Module | Route | Telegram |
|---|---|---|
| Side Turning | `/side-turning` | `/turn_left`, `/turn_right`, `/turn_supine`, `/turn_done`, `/turn_status` |
| Attendance & OT | `/attendance-dashboard` | `/punchin`, `/punchout`, `/ot_in`, `/ot_out`, `/attendance`, `/ot_report` |
| Overtime Payroll | `/overtime` | `/ot_payroll`, `/ot_check` |
| Patients | `/patients` | `/admit` |
| Shift Handover | `/handover` | `/handover` |

---

## Project Structure

```
src/
├── api/               # Frontend API clients (fetch wrappers)
│   └── inventoryApi.js
├── bot/
│   ├── commands/      # Telegram command handlers
│   ├── services/      # Google Sheets read/write services
│   ├── state/         # In-memory state (punch map, side turning)
│   ├── utils/         # Logger, message builder, command menu
│   └── workflows/     # Multi-step workflow definitions
├── db/                # localStorage data layers (frontend)
├── lib/               # Pure calculation / logic functions
├── pages/             # React pages (one per route)
├── components/        # Reusable UI components
└── telegramWebhookServer.js   # Express server (port 3001)
```

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
