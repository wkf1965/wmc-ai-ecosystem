/**
 * Google Apps Script webhook for WMC AI Nursing dashboard data sync.
 *
 * Room roster (exact tab name):
 *   - **Patientsroom** — columns A–N: room_number, patient_name, gender, age, diagnosis, mobility_status,
 *     appetite_status, fall_risk, turning_required, rehab_required, ot_required, family_contact, status, notes
 *   (read_table logical name: `patientsroom` → physical tab **Patientsroom**)
 *   - room_status — upserted per Telegram message (room_number key)
 *   - room_module_nursing_notes — append-only canonical nursing log (timestamp, room_number, patient_name, …)
 *
 * Telegram routing tabs still use TELEGRAM_HEADER_ROW on nursing_notes and category sheets.
 * Deploy as a Web App and use the URL as GOOGLE_SHEET_WEBHOOK_URL.
 *
 * Expected JSON payload:
 * {
 *   table: 'patientsroom' | 'nursing_notes' | ...
 *   payload: { ... }
 * }
 *
 * Telegram nursing row → payload.targets (whitelist). Ensures all routing tabs exist,
 * then appends to nursing_notes first and every other requested category tab.
 * Header row per sheet: Time, Room, Patient Name, Category, Risk Level, Risk Score, Suggested Action, Original Message, Source
 */

function resolveSheetForTelegram(ss, sheetName) {
  const name = String(sheetName || '').trim()
  let sheet = name ? ss.getSheetByName(name) : null
  if (!sheet) {
    sheet = ss.getSheetByName('Sheet1')
  }
  if (!sheet) {
    const sheets = ss.getSheets()
    sheet = sheets.length > 0 ? sheets[0] : null
  }
  return sheet
}

/**
 * Canonical Telegram routing tabs — auto-created if missing on each Telegram POST.
 * Must stay aligned with Node telegramSheetRouting.mjs (TELEGRAM_ROUTE_SHEETS).
 */
const TELEGRAM_ROUTING_SHEET_NAMES = [
  'nursing_notes',
  'risk_alerts',
  'ai_risks',
  'fall_risk',
  'nutrition',
  'infection',
  'rehab_tracking',
  'doctor_review',
  'medication',
  'medication_notes',
  'family_updates',
  'shift_handover',
  'ot_report',
  'turning_schedule',
]

function isTelegramRoutingTab(name) {
  const n = String(name || '').trim()
  for (let i = 0; i < TELEGRAM_ROUTING_SHEET_NAMES.length; i++) {
    if (TELEGRAM_ROUTING_SHEET_NAMES[i] === n) return true
  }
  return false
}

/** Create any missing routing sheet so the workbook always has the full tab set. */
function ensureTelegramRoutingSheetsExist(ss) {
  for (let i = 0; i < TELEGRAM_ROUTING_SHEET_NAMES.length; i++) {
    const nm = TELEGRAM_ROUTING_SHEET_NAMES[i]
    if (!ss.getSheetByName(nm)) {
      ss.insertSheet(nm)
    }
  }
}

/**
 * nursing_notes first, then other targets in TELEGRAM_ROUTING_SHEET_NAMES order (stable, predictable).
 */
function orderTelegramAppendTargets(targets) {
  const requested = targets.slice()
  const out = []
  if (requested.indexOf('nursing_notes') !== -1) {
    out.push('nursing_notes')
  }
  for (let i = 0; i < TELEGRAM_ROUTING_SHEET_NAMES.length; i++) {
    const nm = TELEGRAM_ROUTING_SHEET_NAMES[i]
    if (nm === 'nursing_notes') continue
    if (requested.indexOf(nm) !== -1) out.push(nm)
  }
  return out
}

const TELEGRAM_HEADER_ROW = [
  'Time',
  'Room',
  'Patient Name',
  'Nurse Name',
  'Category',
  'Risk Level',
  'Risk Score',
  'Suggested Action',
  'Symptoms',
  'Original Message',
  'Source',
]

function getOrCreateTelegramSheet(ss, tabName) {
  const name = String(tabName || '').trim()
  if (!isTelegramRoutingTab(name)) return null
  let sheet = ss.getSheetByName(name)
  if (!sheet) {
    sheet = ss.insertSheet(name)
  }
  return sheet
}

function appendTelegramStructuredRow(sheet, payload) {
  const cols = TELEGRAM_HEADER_ROW
  const categoryVal =
    payload.categories !== undefined && payload.categories !== null
      ? payload.categories
      : payload.category !== undefined && payload.category !== null
        ? payload.category
        : ''

  const rowValues = [
    new Date(),
    String(payload.room ?? ''),
    String(payload.patientName ?? ''),
    String(payload.nurseName ?? ''),
    String(categoryVal),
    String(payload.riskLevel ?? ''),
    String(payload.riskScore ?? ''),
    String(payload.suggestedAction ?? ''),
    String(payload.symptoms ?? ''),
    String(payload.originalMessage ?? ''),
    String(payload.source || 'telegram'),
  ]

  const lastRow = sheet.getLastRow()
  let needsHeaders = lastRow < 1

  if (!needsHeaders) {
    const width = Math.max(cols.length, sheet.getLastColumn())
    const firstRow = sheet.getRange(1, 1, 1, Math.max(width, cols.length)).getValues()[0]
    const allBlank = firstRow.every(function (cell) {
      return String(cell).trim() === ''
    })
    needsHeaders = allBlank
  }

  if (needsHeaders) {
    sheet.getRange(1, 1, 1, cols.length).setValues([cols])
  }

  const nextRow = sheet.getLastRow() + 1
  sheet.getRange(nextRow, 1, 1, cols.length).setValues([rowValues])

  return {
    count: 1,
    headers: cols.slice(),
    row: rowValues,
  }
}

/** Room Module — upsert one row per room_number (aligned with Node telegram payload). */
const ROOM_STATUS_HEADERS = [
  'room_number',
  'patient_name',
  'current_status',
  'latest_note',
  'risk_level',
  'last_updated',
]

/** Canonical nursing log for Room Module (does not replace legacy telegram routing tabs). */
const ROOM_MODULE_NURSING_HEADERS = [
  'timestamp',
  'room_number',
  'patient_name',
  'nurse_name',
  'message',
  'category',
  'risk_level',
  'action',
  'source',
]

function ensureRoomModuleSheet_(ss, tabName, headers) {
  var sh = ss.getSheetByName(tabName)
  if (!sh) sh = ss.insertSheet(tabName)
  var a1 = String(sh.getRange(1, 1).getValue() || '')
    .trim()
    .toLowerCase()
  if (a1 !== String(headers[0] || '')
    .trim()
    .toLowerCase()) {
    sh.clear()
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
  }
  return sh
}

function upsertRoomStatusFromTelegram_(ss, payload) {
  var roomNum = String(payload.room ?? '')
    .trim()
  if (!roomNum) return { skipped: true }

  var sh = ensureRoomModuleSheet_(ss, 'room_status', ROOM_STATUS_HEADERS)
  var patientName = String(payload.patientName ?? '')
  var latestNote = String(payload.originalMessage ?? '')
  var riskLevel = String(payload.riskLevel ?? '')
  var ts = payload.timestamp ? String(payload.timestamp) : new Date().toISOString()
  var currentStatus = String(payload.symptoms ?? '')
    .trim()
  if (!currentStatus) currentStatus = latestNote.slice(0, 240)

  var rowVals = [roomNum, patientName, currentStatus, latestNote, riskLevel, ts]

  var lastRow = sh.getLastRow()
  var found = -1
  for (var r = 2; r <= lastRow; r++) {
    var cell = String(sh.getRange(r, 1).getValue())
      .trim()
    if (cell === roomNum) {
      found = r
      break
    }
  }
  if (found > 0) {
    sh.getRange(found, 1, 1, ROOM_STATUS_HEADERS.length).setValues([rowVals])
  } else {
    sh.appendRow(rowVals)
  }
  return { ok: true }
}

function appendRoomModuleNursingNote_(ss, payload) {
  var sh = ensureRoomModuleSheet_(ss, 'room_module_nursing_notes', ROOM_MODULE_NURSING_HEADERS)
  var cat =
    payload.categories !== undefined && payload.categories !== null
      ? payload.categories
      : payload.category !== undefined && payload.category !== null
        ? payload.category
        : ''
  var rowVals = [
    payload.timestamp ? String(payload.timestamp) : new Date().toISOString(),
    String(payload.room ?? ''),
    String(payload.patientName ?? ''),
    String(payload.nurseName ?? ''),
    String(payload.originalMessage ?? ''),
    String(cat),
    String(payload.riskLevel ?? ''),
    String(payload.suggestedAction ?? ''),
    String(payload.source || 'telegram'),
  ]
  sh.appendRow(rowVals)
  return { ok: true }
}

const SHEET_TABLES = [
  'patientsroom',
  'nursing_notes',
  'vital_signs',
  'medications',
  'ai_risks',
  'risk_alerts',
  'escalations',
  'shift_handover',
  'doctor_review',
  'rehab_sessions',
  'rehab_tracking',
  'nutrition',
  'fall_risk',
  'infection',
  'medication',
  'medication_notes',
  'ot_report',
  'turning_schedule',
  'family_updates',
  'room_status',
  'room_module_nursing_notes',
]

const SCRIPT_PROPS = PropertiesService.getScriptProperties()

/** Normalize header token for column matching (BOM/spacing/case/underscores). */
function flattenSheetHeaderKey_(h) {
  return String(h || '')
    .replace(/^\uFEFF/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]/g, '')
}

/** Resolve header cell to a non-empty key so data columns are never dropped when a header cell is blank. */
function headerCellKey_(raw, colIndex0) {
  var s = String(raw == null ? '' : raw)
    .replace(/^\uFEFF/g, '')
    .trim()
  if (s) return s
  return '__col_' + String(colIndex0 + 1)
}

/**
 * Row 1 = headers (dynamic width = max row length). Maps each row by header name.
 * Blank header cells become __col_N so values under them are still returned (e.g. patient_name in column B).
 */
function readSheetTableAsObjects(sheet) {
  const range = sheet.getDataRange()
  const values = range.getValues()
  if (!values || values.length === 0) {
    return { headers: [], rows: [] }
  }
  var width = 0
  for (var wi = 0; wi < values.length; wi++) {
    width = Math.max(width, values[wi].length)
  }
  var headerCells = values[0] || []
  var headers = []
  var seen = {}
  for (var hc = 0; hc < width; hc++) {
    var rawHead = hc < headerCells.length ? headerCells[hc] : ''
    var key = headerCellKey_(rawHead, hc)
    var baseKey = key
    var dup = 2
    while (seen[key]) {
      key = baseKey + '_' + String(dup)
      dup++
    }
    seen[key] = true
    headers.push(key)
  }
  var rows = []
  var tz = Session.getScriptTimeZone()
  for (var r = 1; r < values.length; r++) {
    var obj = {}
    var empty = true
    var rowVals = values[r]
    for (var c = 0; c < width; c++) {
      var colKey = headers[c]
      var cell = c < rowVals.length ? rowVals[c] : null
      var strVal
      if (cell instanceof Date) {
        strVal = Utilities.formatDate(cell, tz, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
      } else if (cell === null || cell === undefined) {
        strVal = ''
      } else {
        strVal = String(cell)
      }
      obj[colKey] = strVal
      if (String(strVal).trim()) empty = false
    }
    if (!empty) rows.push(obj)
  }
  return { headers: headers, rows: rows }
}

/**
 * Patientsroom read_table: ensure room_number, patient_name, and room are always in JSON.
 */
function normalizePatientsroomReadRows_(rows, headers) {
  var roomKey = null
  var nameKey = null
  var hi
  for (hi = 0; hi < headers.length; hi++) {
    var hdr = headers[hi]
    var f = flattenSheetHeaderKey_(hdr)
    if ((f === 'roomnumber' || f === 'room') && roomKey == null) roomKey = hdr
    if ((f === 'patientname' || f === 'patientsname') && nameKey == null) nameKey = hdr
  }
  if (roomKey == null && headers.length > 0) roomKey = headers[0]
  if (nameKey == null && headers.length > 1) nameKey = headers[1]

  var out = []
  for (var ri = 0; ri < rows.length; ri++) {
    var row = rows[ri]
    var canonical = {}
    var k
    for (k in row) {
      if (Object.prototype.hasOwnProperty.call(row, k)) canonical[k] = row[k]
    }
    var rn =
      roomKey != null && Object.prototype.hasOwnProperty.call(row, roomKey)
        ? String(row[roomKey] || '').trim()
        : ''
    var pn =
      nameKey != null && Object.prototype.hasOwnProperty.call(row, nameKey)
        ? String(row[nameKey] || '').trim()
        : ''
    canonical.room_number = rn
    canonical.patient_name = pn
    canonical.room = rn
    Logger.log('Roster row returned: ' + JSON.stringify({ room: canonical.room, patient_name: canonical.patient_name }))
    out.push(canonical)
  }
  return out
}

/**
 * Shared read_table implementation for POST JSON and GET query (?action=read_table&sheet=Patientsroom).
 * @param {string} tableLower — e.g. patientsroom
 * @param {string} [sheetIdOverride] — optional spreadsheet id from request
 * @returns {{ httpStatus: number, payload: object }}
 */
function readTableResult_(tableLower, sheetIdOverride) {
  var table = String(tableLower || '')
    .trim()
    .toLowerCase()
  if (!SHEET_TABLES.includes(table)) {
    return {
      httpStatus: 400,
      payload: {
        ok: false,
        error: `Unsupported table "${tableLower}". Allowed: ${SHEET_TABLES.join(', ')}`,
      },
    }
  }
  var targetId =
    String(sheetIdOverride || '').trim() ||
    SCRIPT_PROPS.getProperty('GOOGLE_SHEET_ID') ||
    SCRIPT_PROPS.getProperty('SHEET_ID')
  if (!targetId) {
    return {
      httpStatus: 400,
      payload: {
        ok: false,
        error: 'Missing Google Sheet ID. Set GOOGLE_SHEET_ID in script properties.',
      },
    }
  }
  var ss = SpreadsheetApp.openById(targetId)
  var sheet = resolveSheetTableForRead_(ss, table)
  if (!sheet) {
    var tabHint =
      table === 'patientsroom'
        ? 'Add a tab named exactly Patientsroom with headers room_number and patient_name.'
        : 'Create the sheet tab or fix the table name.'
    return {
      httpStatus: 404,
      payload: {
        ok: false,
        error: 'Sheet tab not found. ' + tabHint,
        table: table,
        rows: [],
        headers: [],
      },
    }
  }
  var data = readSheetTableAsObjects(sheet)
  var rowsOut = data.rows
  var headersOut = data.headers
  if (table === 'patientsroom') {
    rowsOut = normalizePatientsroomReadRows_(data.rows, data.headers)
    headersOut = rowsOut.length > 0 ? Object.keys(rowsOut[0]) : ['room_number', 'patient_name', 'room']
  }
  return {
    httpStatus: 200,
    payload: {
      ok: true,
      table: table,
      rows: rowsOut,
      headers: headersOut,
    },
  }
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {}
    var action = String(params.action || '').trim().toLowerCase()
    if (action === 'read_table') {
      var sheetTab = String(params.sheet || '').trim()
      if (sheetTab !== 'Patientsroom') {
        return createJsonResponse(
          {
            ok: false,
            error:
              'read_table GET requires sheet=Patientsroom (exact Google Sheet tab name). Example: ?action=read_table&sheet=Patientsroom',
          },
          400,
        )
      }
      var rrGet = readTableResult_('patientsroom', params.sheetId)
      return createJsonResponse(rrGet.payload, rrGet.httpStatus)
    }
    return createJsonResponse({
      ok: true,
      message: 'WMC AI Nursing Google Sheet webhook is active.',
      tables: SHEET_TABLES,
      health: 'ready',
    })
  } catch (error) {
    return createJsonResponse(
      {
        ok: false,
        error: error && error.message ? error.message : String(error),
      },
      500,
    )
  }
}

/** Official room roster tab (exact name: Patientsroom). Use read_table `patientsroom` only. */
/** Tab name must be exactly **Patientsroom** (Google Sheets name match). */
function resolvePatientsroomTabSheet_(ss) {
  return ss.getSheetByName('Patientsroom') || null
}

function resolveSheetTableForRead_(ss, logicalTableLower) {
  var t = String(logicalTableLower || '').trim().toLowerCase()
  if (t === 'patientsroom') return resolvePatientsroomTabSheet_(ss)
  return ss.getSheetByName(t)
}

function doPost(e) {
  try {
    const request = parseRequestBody(e)
    if (!request.ok) {
      return createJsonResponse({ ok: false, error: request.error }, 400)
    }

    const payload = request.payload
    if (payload.action === 'ping' || payload.table === 'connection_test') {
      return createJsonResponse({
        ok: true,
        action: 'ping',
        message: 'Google Sheet webhook reachable.',
      })
    }

    if (payload.action === 'read_table') {
      const table = String(payload.table || '')
        .trim()
        .toLowerCase()
      const rrPost = readTableResult_(table, payload.sheetId)
      return createJsonResponse(rrPost.payload, rrPost.httpStatus)
    }

    /** Flat JSON from telegramGoogleSheetSync.mjs — targets[] + structured fields */
    if (payload.source === 'telegram') {
      const targetId =
        payload.sheetId ||
        SCRIPT_PROPS.getProperty('GOOGLE_SHEET_ID') ||
        SCRIPT_PROPS.getProperty('SHEET_ID')
      if (!targetId) {
        return createJsonResponse(
          {
            ok: false,
            error: 'Missing Google Sheet ID. Set GOOGLE_SHEET_ID in script properties.',
          },
          400,
        )
      }

      var targets = []
      if (Array.isArray(payload.targets) && payload.targets.length > 0) {
        for (var ti = 0; ti < payload.targets.length; ti++) {
          var cand = String(payload.targets[ti] || '').trim()
          if (isTelegramRoutingTab(cand)) targets.push(cand)
        }
      } else {
        var legacy = String(payload.sheetName || 'nursing_notes').trim()
        targets = isTelegramRoutingTab(legacy) ? [legacy] : ['nursing_notes']
      }

      if (targets.indexOf('nursing_notes') === -1) {
        targets.push('nursing_notes')
      }

      var uniqTargets = []
      var seenTab = {}
      for (var ui = 0; ui < targets.length; ui++) {
        var tabName = targets[ui]
        if (!seenTab[tabName]) {
          seenTab[tabName] = true
          uniqTargets.push(tabName)
        }
      }
      targets = orderTelegramAppendTargets(uniqTargets)

      const ss = SpreadsheetApp.openById(targetId)
      ensureTelegramRoutingSheetsExist(ss)

      var sheetsWritten = []
      var appendedTotal = 0
      for (var si = 0; si < targets.length; si++) {
        var t = targets[si]
        var sh = getOrCreateTelegramSheet(ss, t)
        if (!sh) continue
        appendTelegramStructuredRow(sh, payload)
        sheetsWritten.push(sh.getName())
        appendedTotal++
      }

      try {
        upsertRoomStatusFromTelegram_(ss, payload)
        appendRoomModuleNursingNote_(ss, payload)
      } catch (eRoom) {
        Logger.log('Room module Sheets update failed: ' + eRoom)
      }

      if (sheetsWritten.length === 0) {
        return createJsonResponse(
          {
            success: false,
            ok: false,
            telegram: true,
            error: 'No valid telegram sheet tabs resolved',
          },
          500,
        )
      }

      return createJsonResponse({
        success: true,
        ok: true,
        telegram: true,
        sheetsWritten: sheetsWritten,
        targetsUsed: targets.slice(),
        columns: TELEGRAM_HEADER_ROW,
        appended: appendedTotal,
        appendedAt: new Date().toISOString(),
      })
    }

    const table = String(payload.table || '')
      .trim()
      .toLowerCase()

    if (!SHEET_TABLES.includes(table)) {
      return createJsonResponse(
        {
          ok: false,
          error: `Unsupported table "${payload.table}". Allowed: ${SHEET_TABLES.join(', ')}`,
        },
        400,
      )
    }

    const records = toArray(payload.rows)
      .concat(payload.payload ? [payload.payload] : [])
      .filter(Boolean)

    if (records.length === 0) {
      return createJsonResponse({
        ok: false,
        error: 'Missing payload: provide either { rows: [...] } or { payload: {...} }',
      }, 400)
    }

    const sheet = resolveSheet(payload.sheetId, table)
    const spreadsheet = sheet.getParent()
    let appended
    if (table === 'patientsroom') {
      appended = upsertPatientsroomRows_(sheet, records)
    } else {
      appended = appendRowsToSheet(sheet, records)
    }

    return createJsonResponse({
      ok: true,
      table,
      spreadsheetId: spreadsheet.getId(),
      appended: appended.count,
      inserted: appended.inserted != null ? appended.inserted : appended.count,
      updated: appended.updated != null ? appended.updated : 0,
      rows: appended.rows,
      headers: appended.headers,
      appendedAt: new Date().toISOString(),
    })
  } catch (error) {
    return createJsonResponse(
      {
        ok: false,
        error: error && error.message ? error.message : String(error),
      },
      500,
    )
  }
}

/** Patientsroom tab — canonical headers when row 1 is empty (matches spreadsheet columns A–N). */
const PATIENTSROOM_CANONICAL_HEADERS = [
  'room_number',
  'patient_name',
  'gender',
  'age',
  'diagnosis',
  'mobility_status',
  'appetite_status',
  'fall_risk',
  'turning_required',
  'rehab_required',
  'ot_required',
  'family_contact',
  'status',
  'notes',
]

var PATIENTSROOM_PAYLOAD_SKIP = {
  id: true,
  googleSheetSyncStatus: true,
  googleSheetSyncMessage: true,
  googleSheetSyncUpdatedAt: true,
  googleSheetSyncPatientRisk: true,
  createdAt: true,
  updatedAt: true,
  receivedAt: true,
}

function headerFlatForPatientsroom_(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '')
}

function ensurePatientsroomHeaders_(sheet) {
  var vals = sheet.getDataRange().getValues()
  var row0 = vals.length > 0 ? vals[0] : []
  var hasHeader = row0.some(function (cell) {
    return String(cell || '').trim()
  })
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, PATIENTSROOM_CANONICAL_HEADERS.length).setValues([PATIENTSROOM_CANONICAL_HEADERS])
    return PATIENTSROOM_CANONICAL_HEADERS.slice()
  }
  return row0.map(function (x) {
    return String(x).trim()
  })
}

function findPatientsroomRoomColumnIndex_(headers) {
  var aliases = ['roomnumber', 'room']
  for (var c = 0; c < headers.length; c++) {
    var hf = headerFlatForPatientsroom_(headers[c])
    if (aliases.indexOf(hf) !== -1) return c
  }
  return 0
}

function normalizePatientsroomRoomToken_(room) {
  return String(room || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
}

function columnPayloadKeyMatch_(payload, header) {
  var hfHead = headerFlatForPatientsroom_(header)
  var keys = Object.keys(payload)
  var i
  for (i = 0; i < keys.length; i++) {
    if (headerFlatForPatientsroom_(keys[i]) === hfHead) return keys[i]
  }
  var headAliases = {
    patientsname: ['patientname', 'fullname'],
    patientname: ['patientsname', 'fullname'],
    roomnumber: ['room'],
    room: ['roomnumber'],
  }
  var extras = headAliases[hfHead]
  if (extras) {
    for (var e = 0; e < extras.length; e++) {
      for (i = 0; i < keys.length; i++) {
        if (headerFlatForPatientsroom_(keys[i]) === extras[e]) return keys[i]
      }
    }
  }
  return null
}

function mergeExtraPatientsroomHeaders_(headers, payload) {
  var next = headers.slice()
  var changed = false
  var keys = Object.keys(payload)
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i]
    if (PATIENTSROOM_PAYLOAD_SKIP[k]) continue
    var hfKey = headerFlatForPatientsroom_(k)
    if (!hfKey) continue
    var found = false
    for (var h = 0; h < next.length; h++) {
      if (headerFlatForPatientsroom_(next[h]) === hfKey) {
        found = true
        break
      }
    }
    if (!found) {
      next.push(k)
      changed = true
    }
  }
  return { headers: next, changed: changed }
}

function patientsroomPayloadFromRecord_(raw) {
  var n = normalizeRecord(raw)
  var out = {}
  Object.keys(n).forEach(function (k) {
    if (PATIENTSROOM_PAYLOAD_SKIP[k]) return
    out[k] = n[k]
  })
  if (out.room_number == null && n.room != null && String(n.room).trim()) out.room_number = String(n.room).trim()
  if (out.patient_name == null && n.fullName) out.patient_name = String(n.fullName).trim()
  if (out.patient_name == null && out.patients_name != null && String(out.patients_name).trim()) {
    out.patient_name = String(out.patients_name).trim()
  }
  if (out.mobility_status == null && n.mobilityStatus) out.mobility_status = String(n.mobilityStatus).trim()
  if (out.appetite_status == null && n.feedingStatus) out.appetite_status = String(n.feedingStatus).trim()
  if (out.family_contact == null && n.familyContact) out.family_contact = String(n.familyContact).trim()
  return out
}

function pickRoomFromPatientsroomPayload_(payload, headers, roomCol) {
  var rk = columnPayloadKeyMatch_(payload, headers[roomCol])
  if (rk != null && String(payload[rk]).trim()) return String(payload[rk]).trim()
  if (payload.room_number != null && String(payload.room_number).trim()) return String(payload.room_number).trim()
  if (payload.room != null && String(payload.room).trim()) return String(payload.room).trim()
  return ''
}

function mergePatientsroomDataRow_(headers, existingCells, payload, isUpdate) {
  var row = []
  var i
  if (existingCells && existingCells.length) {
    row = existingCells.slice()
  } else {
    for (i = 0; i < headers.length; i++) row.push('')
  }
  while (row.length < headers.length) row.push('')
  for (var c = 0; c < headers.length; c++) {
    var matchKey = columnPayloadKeyMatch_(payload, headers[c])
    if (matchKey !== null) {
      var val = payload[matchKey]
      if (val === undefined || val === null) continue
      var s = String(val)
      if (!isUpdate || s.trim() !== '') {
        row[c] = s
      }
    }
  }
  return row
}

/**
 * Upsert by normalized room token (room_number column). Inserts new row when room not found.
 * @returns {{ count: number, inserted: number, updated: number, rows: object[], headers: string[] }}
 */
function upsertPatientsroomRows_(sheet, rows) {
  var headers = ensurePatientsroomHeaders_(sheet)
  var inserted = 0
  var updated = 0
  var outRows = []

  for (var ri = 0; ri < rows.length; ri++) {
    var payload = patientsroomPayloadFromRecord_(rows[ri])
    var extra = mergeExtraPatientsroomHeaders_(headers, payload)
    if (extra.changed) {
      sheet.getRange(1, 1, 1, extra.headers.length).setValues([extra.headers])
      headers = extra.headers
    }

    var roomCol = findPatientsroomRoomColumnIndex_(headers)
    var roomRaw = pickRoomFromPatientsroomPayload_(payload, headers, roomCol)
    if (!String(roomRaw).trim()) {
      throw new Error('Patientsroom upsert requires room_number (or room).')
    }

    var vals = sheet.getDataRange().getValues()
    var targetTok = normalizePatientsroomRoomToken_(roomRaw)
    var foundSheetRow = -1
    for (var r = 1; r < vals.length; r++) {
      var cellRoom = vals[r][roomCol]
      if (normalizePatientsroomRoomToken_(cellRoom) === targetTok) {
        foundSheetRow = r + 1
        break
      }
    }

    var existingCells = null
    if (foundSheetRow > 0) {
      existingCells = sheet.getRange(foundSheetRow, 1, foundSheetRow, headers.length).getValues()[0]
    }

    var merged = mergePatientsroomDataRow_(headers, existingCells, payload, foundSheetRow > 0)
    while (merged.length < headers.length) merged.push('')

    if (foundSheetRow > 0) {
      sheet.getRange(foundSheetRow, 1, foundSheetRow, headers.length).setValues([merged])
      updated++
    } else {
      sheet.appendRow(merged)
      inserted++
    }
    outRows.push(payload)
  }

  return {
    count: rows.length,
    inserted: inserted,
    updated: updated,
    rows: outRows,
    headers: headers,
  }
}

function appendRowsToSheet(sheet, rows) {
  const existingData = sheet.getDataRange().getValues()
  let headers = existingData.length > 0 ? existingData[0].map(String) : []

  const normalizedRows = rows.map(normalizeRecord)
  const allKeys = headers.slice()
  normalizedRows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!allKeys.includes(key)) {
        allKeys.push(key)
      }
    })
  })

  if (allKeys.length === 0) {
    throw new Error('No valid fields in payload.')
  }

  if (headers.length === 0) {
    sheet.getRange(1, 1, 1, allKeys.length).setValues([allKeys])
  } else if (allKeys.length > headers.length) {
    sheet.getRange(1, 1, 1, allKeys.length).setValues([allKeys])
  } else {
    headers = allKeys.slice()
  }

  const dataRows = normalizedRows.map((row) => allKeys.map((key) => row[key]))
  if (dataRows.length > 0) {
    const startRow = sheet.getLastRow() + 1
    sheet.getRange(startRow, 1, dataRows.length, allKeys.length).setValues(dataRows)
  }

  return {
    count: dataRows.length,
    rows: normalizedRows,
    headers: allKeys,
  }
}

function resolveSheet(sheetId, table) {
  const targetId = sheetId || SCRIPT_PROPS.getProperty('GOOGLE_SHEET_ID') || SCRIPT_PROPS.getProperty('SHEET_ID')
  if (!targetId) {
    throw new Error('Missing Google Sheet ID. Set GOOGLE_SHEET_ID in script properties or include sheetId in payload.')
  }

  const spreadsheet = SpreadsheetApp.openById(targetId)
  let sheet
  if (table === 'nursing_notes') {
    sheet = resolveSheetForTelegram(spreadsheet, table)
  } else if (table === 'patientsroom') {
    sheet = resolvePatientsroomTabSheet_(spreadsheet)
    if (!sheet) {
      throw new Error(
        'Sheet tab "Patientsroom" not found. Create it manually with headers room_number and patient_name (tab is never auto-created).',
      )
    }
  } else {
    sheet = spreadsheet.getSheetByName(table)
  }
  if (!sheet) {
    sheet = spreadsheet.insertSheet(table)
  }

  return sheet
}

function parseRequestBody(e) {
  if (!e || !e.postData) {
    return { ok: false, error: 'No POST body provided.' }
  }

  try {
    const body = (e.postData.contents || '').trim()
    if (!body) {
      return { ok: false, error: 'Empty POST payload.' }
    }
    const parsed = JSON.parse(body)
    return { ok: true, payload: parsed }
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? `Invalid JSON: ${error.message}` : 'Invalid JSON payload.',
    }
  }
}

function toArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const normalized = {}
  Object.keys(raw).forEach((key) => {
    const value = raw[key]
    if (value === undefined || value === null) {
      return
    }
    normalized[key] = typeof value === 'object' ? JSON.stringify(value) : String(value)
  })

  if (!Object.prototype.hasOwnProperty.call(normalized, 'receivedAt')) {
    normalized.receivedAt = new Date().toISOString()
  }

  return normalized
}

function createJsonResponse(payload, statusCode = 200) {
  const outputPayload = {
    status: statusCode,
    ...payload,
  }
  const output = ContentService.createTextOutput(JSON.stringify(outputPayload))
  output.setMimeType(ContentService.MimeType.JSON)
  return output
}
