/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Backups Module                                ║
 * ║                                                              ║
 * ║  Purpose: Scheduled export of Google Sheets data to local   ║
 * ║  JSON snapshots for disaster recovery.                      ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Backup schedule: daily at 2 AM MYT
 *
 * Tabs backed up:
 *   - Sheet1         (master CRM log)
 *   - Memory         (customer memory)
 *   - Pipeline       (lead stages)
 *   - Appointments   (booking history)
 *   - Marketing Leads
 *   - Dashboard
 *   - Patients
 *   - Follow Up Queue
 *   - Campaigns
 *
 * Output format:
 *   backups/snapshots/YYYY-MM-DD/
 *     ├── sheet1.json
 *     ├── memory.json
 *     ├── pipeline.json
 *     ├── appointments.json
 *     └── ...
 *
 * Retention: keep last 30 days, auto-delete older snapshots.
 *
 * TODO:
 *   - Implement exportTab() using Google Sheets API
 *   - Schedule via node-cron at 2 AM MYT
 *   - Add rotation to delete snapshots older than 30 days
 *   - Optionally upload to Google Drive or S3
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const SNAPSHOT_DIR   = path.join(__dirname, "snapshots");
const RETENTION_DAYS = 30;

const TABS_TO_BACKUP = [
  "Sheet1", "Memory", "Pipeline", "Appointments",
  "Marketing Leads", "Dashboard", "Patients",
  "Follow Up Queue", "Campaigns",
];

/**
 * Export one tab to a JSON file.
 *
 * @param {object} sheets  — Google Sheets client
 * @param {string} spreadsheetId
 * @param {string} tabName
 * @param {string} outDir
 */
async function exportTab(sheets, spreadsheetId, tabName, outDir) {
  // TODO: sheets.spreadsheets.values.get → write to outDir/{tabName}.json
  console.log(`[Backups] ⚠️  exportTab(${tabName}) stub`);
}

/**
 * Run a full backup of all tabs.
 */
async function runBackup() {
  const dateStr = new Date().toISOString().slice(0, 10);
  const outDir  = path.join(SNAPSHOT_DIR, dateStr);

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  console.log(`[Backups] Starting backup → ${outDir}`);

  // TODO: Init Google Sheets client
  // TODO: For each tab in TABS_TO_BACKUP, call exportTab()
  console.log(`[Backups] ⚠️  runBackup() stub — wire Google Sheets client`);
}

/**
 * Delete snapshot directories older than RETENTION_DAYS.
 */
function pruneOldSnapshots() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const dirs   = fs.readdirSync(SNAPSHOT_DIR);
  let pruned   = 0;

  for (const dir of dirs) {
    const dirPath = path.join(SNAPSHOT_DIR, dir);
    const stat    = fs.statSync(dirPath);
    if (stat.isDirectory() && stat.mtimeMs < cutoff) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      pruned++;
    }
  }

  if (pruned > 0) console.log(`[Backups] Pruned ${pruned} old snapshot(s)`);
}

module.exports = { runBackup, pruneOldSnapshots, TABS_TO_BACKUP, RETENTION_DAYS };
