/**
 * Provisions the "Dashboard" tab in the live Google Sheet via Sheets API v4
 * (same service account as webhook append). Safe for Sheet1 append flow.
 *
 * Run from repo root: node scripts/provision-dashboard.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const DATA_TAB = process.env.GOOGLE_SHEET_TAB || "Sheet1";
const DASH_TAB = "Dashboard";

function trimEnv(s) {
  if (s == null) return "";
  return String(s)
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function parseSpreadsheetId(raw) {
  const t = trimEnv(raw);
  if (!t) return "";
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : t;
}

function resolveKeyFile() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw) return null;
  const p = trimEnv(raw);
  return path.isAbsolute(p) ? p : path.join(__dirname, "..", p.replace(/^\.\//, ""));
}

/** @param {number} sheetId @param {number} r0 @param {number} c0 @param {number} r1 @param {number} c1 */
function grid(sheetId, r0, c0, r1, c1) {
  return {
    sheetId,
    startRowIndex: r0,
    endRowIndex: r1,
    startColumnIndex: c0,
    endColumnIndex: c1,
  };
}

/** @param {string} userEntered */
function cellStr(userEntered) {
  return { userEnteredValue: { stringValue: userEntered } };
}

/** @param {string} formula leading = */
function cellFormula(formula) {
  return { userEnteredValue: { formulaValue: formula } };
}

async function main() {
  const spreadsheetId = parseSpreadsheetId(process.env.GOOGLE_SHEET_ID || "");
  if (!spreadsheetId) {
    console.error("Missing GOOGLE_SHEET_ID in .env");
    process.exit(1);
  }
  const keyFile = resolveKeyFile();
  if (!keyFile || !fs.existsSync(keyFile)) {
    console.error("Missing GOOGLE_APPLICATION_CREDENTIALS file:", keyFile);
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  const list = meta.data.sheets || [];
  const dataSh = list.find((s) => s.properties?.title === DATA_TAB);
  if (!dataSh) throw new Error(`Data sheet "${DATA_TAB}" not found in spreadsheet`);
  const dataSheetId = /** @type {number} */ (dataSh.properties.sheetId);

  const cfMeta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title),conditionalFormats)",
  });
  const dataSheetMeta = (cfMeta.data.sheets || []).find(
    (s) => s.properties?.title === DATA_TAB,
  );
  const cfCleanup = [];
  const existingCf = dataSheetMeta?.conditionalFormats || [];
  for (let i = existingCf.length - 1; i >= 0; i--) {
    const rule = existingCf[i];
    const ranges = rule.ranges || [];
    const onlyColF = ranges.every(
      (r) =>
        r.sheetId === dataSheetId &&
        r.startColumnIndex === 5 &&
        r.endColumnIndex === 6,
    );
    if (onlyColF && ranges.length > 0) {
      cfCleanup.push({
        deleteConditionalFormatRule: { sheetId: dataSheetId, index: i },
      });
    }
  }
  const phase1 = [];
  const existingDash = list.find((s) => s.properties?.title === DASH_TAB);
  if (existingDash?.properties?.sheetId != null) {
    phase1.push({ deleteSheet: { sheetId: existingDash.properties.sheetId } });
  }
  phase1.push({
    addSheet: {
      properties: {
        title: DASH_TAB,
        gridProperties: { rowCount: 220, columnCount: 20 },
        tabColor: { red: 0.04, green: 0.34, blue: 0.82 },
      },
    },
  });

  const b1 = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: phase1 },
  });
  const dashSheetId = b1.data.replies?.find((r) => r.addSheet)?.addSheet?.properties
    ?.sheetId;
  if (dashSheetId == null) throw new Error("addSheet reply missing sheetId");

  const S = `'${DATA_TAB}'!`;

  const phase2 = [
    {
      mergeCells: {
        range: grid(dashSheetId, 0, 0, 1, 10),
        mergeType: "MERGE_ALL",
      },
    },
    {
      mergeCells: {
        range: grid(dashSheetId, 1, 0, 2, 10),
        mergeType: "MERGE_ALL",
      },
    },
    {
      updateCells: {
        range: grid(dashSheetId, 0, 0, 1, 1),
        fields: "userEnteredValue",
        rows: [
          {
            values: [
              cellStr("Wong Medical Centre · AI CRM Analytics"),
            ],
          },
        ],
      },
    },
    {
      updateCells: {
        range: grid(dashSheetId, 1, 0, 2, 1),
        fields: "userEnteredValue",
        rows: [
          {
            values: [
              cellStr(
                `Live metrics from ${DATA_TAB} · Provisioned ${new Date().toISOString()}`,
              ),
            ],
          },
        ],
      },
    },
    {
      updateCells: {
        range: grid(dashSheetId, 3, 0, 4, 2),
        fields: "userEnteredValue",
        rows: [
          {
            values: [cellStr("KPI"), cellStr("Value")],
          },
        ],
      },
    },
    {
      updateCells: {
        range: grid(dashSheetId, 4, 0, 11, 2),
        fields: "userEnteredValue",
        rows: [
          { values: [cellStr("Total Leads"), cellFormula(`=COUNTIFS(${S}A2:A,"<>")`)] },
          { values: [cellStr("Hot Leads"), cellFormula(`=COUNTIF(${S}F2:F,"Hot Lead")`)] },
          { values: [cellStr("Warm Leads"), cellFormula(`=COUNTIF(${S}F2:F,"Warm Lead")`)] },
          { values: [cellStr("Cold Leads"), cellFormula(`=COUNTIF(${S}F2:F,"Cold Lead")`)] },
          {
            values: [
              cellStr("Today's Leads"),
              cellFormula(
                `=COUNTIFS(${S}A2:A,">="&TEXT(TODAY(),"yyyy-mm-dd"),${S}A2:A,"<"&TEXT(TODAY()+1,"yyyy-mm-dd"))`,
              ),
            ],
          },
          {
            values: [
              cellStr("Stroke Rehab Leads"),
              cellFormula(`=COUNTIF(${S}E2:E,"Stroke Rehab")`),
            ],
          },
          {
            values: [
              cellStr("General Inquiry Leads"),
              cellFormula(`=COUNTIF(${S}E2:E,"General Inquiry")`),
            ],
          },
        ],
      },
    },
    {
      updateCells: {
        range: grid(dashSheetId, 3, 3, 4, 5),
        fields: "userEnteredValue",
        rows: [
          {
            values: [cellStr("Lead type"), cellStr("Count")],
          },
        ],
      },
    },
    {
      updateCells: {
        range: grid(dashSheetId, 4, 3, 7, 5),
        fields: "userEnteredValue",
        rows: [
          { values: [cellStr("Hot Lead"), cellFormula(`=COUNTIF(${S}F2:F,D5)`)] },
          { values: [cellStr("Warm Lead"), cellFormula(`=COUNTIF(${S}F2:F,D6)`)] },
          { values: [cellStr("Cold Lead"), cellFormula(`=COUNTIF(${S}F2:F,D7)`)] },
        ],
      },
    },
    {
      updateCells: {
        range: grid(dashSheetId, 3, 6, 4, 8),
        fields: "userEnteredValue",
        rows: [
          {
            values: [cellStr("Category"), cellStr("Leads")],
          },
        ],
      },
    },
    {
      updateCells: {
        range: grid(dashSheetId, 4, 6, 5, 7),
        fields: "userEnteredValue",
        rows: [
          {
            values: [
              cellFormula(
                `=IFERROR(QUERY(${S}E2:E,"select E, count(E) where E is not null group by E order by count(E) desc label count(E) ''",0),{"No data",0})`,
              ),
            ],
          },
        ],
      },
    },
    {
      updateCells: {
        range: grid(dashSheetId, 3, 12, 4, 14),
        fields: "userEnteredValue",
        rows: [
          {
            values: [cellStr("Date"), cellStr("Leads")],
          },
        ],
      },
    },
    {
      updateCells: {
        range: grid(dashSheetId, 4, 12, 5, 13),
        fields: "userEnteredValue",
        rows: [
          {
            values: [
              cellFormula(
                `=IFERROR(QUERY(ARRAYFORMULA(IF(LEN(${S}A2:A),TEXT(DATEVALUE(LEFT(${S}A2:A,10)),"yyyy-mm-dd"),"")),"select Col1, count(Col1) where Col1 is not null group by Col1 order by Col1 desc limit 60 label count(Col1) ''",0),{"",0})`,
              ),
            ],
          },
        ],
      },
    },
    {
      updateCells: {
        range: grid(dashSheetId, 13, 0, 14, 1),
        fields: "userEnteredValue",
        rows: [{ values: [cellStr("Hot leads (live)")] }],
      },
    },
    {
      updateCells: {
        range: grid(dashSheetId, 14, 0, 15, 1),
        fields: "userEnteredValue",
        rows: [
          {
            values: [
              cellFormula(
                `=IF(COUNTIF(${S}F2:F,"Hot Lead")=0,"No hot leads yet.",FILTER(${S}A2:I,(${S}F2:F="Hot Lead")*(${S}A2:A<>"")))`,
              ),
            ],
          },
        ],
      },
    },
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: phase2 },
  });

  const maxRows = 5000;
  const cfHot = {
    addConditionalFormatRule: {
      index: 0,
      rule: {
        ranges: [grid(dataSheetId, 1, 5, maxRows, 6)],
        booleanRule: {
          condition: {
            type: "TEXT_EQ",
            values: [{ userEnteredValue: "Hot Lead" }],
          },
          format: {
            backgroundColor: { red: 0.99, green: 0.91, blue: 0.9 },
            textFormat: { foregroundColor: { red: 0.77, green: 0.13, blue: 0.12 } },
          },
        },
      },
    },
  };
  const cfWarm = {
    addConditionalFormatRule: {
      index: 1,
      rule: {
        ranges: [grid(dataSheetId, 1, 5, maxRows, 6)],
        booleanRule: {
          condition: {
            type: "TEXT_EQ",
            values: [{ userEnteredValue: "Warm Lead" }],
          },
          format: {
            backgroundColor: { red: 1, green: 0.97, blue: 0.88 },
            textFormat: { foregroundColor: { red: 0.69, green: 0.38, blue: 0 } },
          },
        },
      },
    },
  };
  const cfCold = {
    addConditionalFormatRule: {
      index: 2,
      rule: {
        ranges: [grid(dataSheetId, 1, 5, maxRows, 6)],
        booleanRule: {
          condition: {
            type: "TEXT_EQ",
            values: [{ userEnteredValue: "Cold Lead" }],
          },
          format: {
            backgroundColor: { red: 0.95, green: 0.95, blue: 0.97 },
            textFormat: { foregroundColor: { red: 0.37, green: 0.39, blue: 0.41 } },
          },
        },
      },
    },
  };

  const pieChart = {
    addChart: {
      chart: {
        spec: {
          title: "Lead types",
          pieChart: {
            domain: {
              sourceRange: {
                sources: [grid(dashSheetId, 4, 3, 7, 4)],
              },
            },
            series: {
              sourceRange: {
                sources: [grid(dashSheetId, 4, 4, 7, 5)],
              },
            },
            legendPosition: "RIGHT_LEGEND",
          },
        },
        position: {
          overlayPosition: {
            anchorCell: { sheetId: dashSheetId, rowIndex: 3, columnIndex: 9 },
            widthPixels: 420,
            heightPixels: 280,
            offsetXPixels: 0,
            offsetYPixels: 0,
          },
        },
      },
    },
  };

  const barChart = {
    addChart: {
      chart: {
        spec: {
          title: "Leads by category",
          basicChart: {
            chartType: "COLUMN",
            legendPosition: "NO_LEGEND",
            axis: [
              { position: "BOTTOM_AXIS", title: "Category" },
              { position: "LEFT_AXIS", title: "Count" },
            ],
            domains: [
              {
                domain: {
                  sourceRange: {
                    sources: [grid(dashSheetId, 3, 6, 30, 7)],
                  },
                },
              },
            ],
            series: [
              {
                series: {
                  sourceRange: {
                    sources: [grid(dashSheetId, 3, 7, 30, 8)],
                  },
                },
                targetAxis: "LEFT_AXIS",
              },
            ],
            headerCount: 1,
          },
        },
        position: {
          overlayPosition: {
            anchorCell: { sheetId: dashSheetId, rowIndex: 3, columnIndex: 15 },
            widthPixels: 480,
            heightPixels: 300,
            offsetXPixels: 0,
            offsetYPixels: 0,
          },
        },
      },
    },
  };

  const lineChart = {
    addChart: {
      chart: {
        spec: {
          title: "Daily leads trend",
          basicChart: {
            chartType: "LINE",
            legendPosition: "NO_LEGEND",
            lineSmoothing: false,
            axis: [
              { position: "BOTTOM_AXIS", title: "Date" },
              { position: "LEFT_AXIS", title: "Leads" },
            ],
            domains: [
              {
                domain: {
                  sourceRange: {
                    sources: [grid(dashSheetId, 3, 12, 70, 13)],
                  },
                },
              },
            ],
            series: [
              {
                series: {
                  sourceRange: {
                    sources: [grid(dashSheetId, 3, 13, 70, 14)],
                  },
                },
                targetAxis: "LEFT_AXIS",
              },
            ],
            headerCount: 1,
          },
        },
        position: {
          overlayPosition: {
            anchorCell: { sheetId: dashSheetId, rowIndex: 20, columnIndex: 9 },
            widthPixels: 520,
            heightPixels: 280,
            offsetXPixels: 0,
            offsetYPixels: 0,
          },
        },
      },
    },
  };

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        ...cfCleanup,
        cfHot,
        cfWarm,
        cfCold,
        pieChart,
        barChart,
        lineChart,
      ],
    },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: grid(dashSheetId, 0, 0, 1, 10),
            fields: "userEnteredFormat.textFormat,userEnteredFormat.backgroundColor",
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: true,
                  fontSize: 18,
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                },
                backgroundColor: { red: 0.04, green: 0.34, blue: 0.82 },
                horizontalAlignment: "CENTER",
                verticalAlignment: "MIDDLE",
              },
            },
          },
        },
        {
          repeatCell: {
            range: grid(dashSheetId, 1, 0, 2, 10),
            fields: "userEnteredFormat.textFormat,userEnteredFormat.backgroundColor",
            cell: {
              userEnteredFormat: {
                textFormat: { fontSize: 10, foregroundColor: { red: 0.37, green: 0.39, blue: 0.41 } },
                backgroundColor: { red: 0.97, green: 0.98, blue: 0.98 },
                horizontalAlignment: "CENTER",
              },
            },
          },
        },
        {
          repeatCell: {
            range: grid(dashSheetId, 3, 0, 4, 2),
            fields: "userEnteredFormat.textFormat,userEnteredFormat.backgroundColor",
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.91, green: 0.94, blue: 0.99 },
              },
            },
          },
        },
        {
          repeatCell: {
            range: grid(dashSheetId, 4, 0, 11, 1),
            fields: "userEnteredFormat.textFormat",
            cell: {
              userEnteredFormat: { textFormat: { bold: true } },
            },
          },
        },
        {
          repeatCell: {
            range: grid(dashSheetId, 4, 1, 11, 2),
            fields: "userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment",
            cell: {
              userEnteredFormat: {
                numberFormat: { type: "NUMBER", pattern: "#,##0" },
                horizontalAlignment: "RIGHT",
              },
            },
          },
        },
      ],
    },
  });

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${dashSheetId}`;
  console.log("OK — Dashboard tab created.");
  console.log("Open this URL (Dashboard is selected by gid):");
  console.log(url);
  console.log("");
  console.log("In the spreadsheet UI: bottom tab bar → look for tab named:", DASH_TAB);
  console.log("Tab order: usually to the right of", DATA_TAB, "(or drag the tab to reorder).");
}

main().catch((e) => {
  console.error(e.response?.data || e.message || e);
  process.exit(1);
});
