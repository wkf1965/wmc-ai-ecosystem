/**
 * WMC AI CRM — Professional Dashboard (bound script)
 *
 * INSTALL
 * 1. Open your spreadsheet (the same one WHAPI/webhook writes to).
 * 2. Extensions → Apps Script → delete default Code.gs content → paste this file → Save.
 * 3. Run setupCrmDashboard once → Authorize.
 * 4. Refresh the spreadsheet. Use menu CRM Dashboard if you need to re-run setup.
 *
 * EXPECTED DATA TAB: Sheet1
 *   Row 1 headers. Columns A–I:
 *   A Timestamp | B Patient Name | C Message | D Source | E Category | F LeadType | G Phone | H Auto Reply | I Next Action
 *
 * Creates tab "Dashboard" with KPIs, charts, hot-lead table, and Sheet1 column F conditional formatting.
 * KPIs and FILTER use open-ended ranges — new rows on Sheet1 update automatically (no cron required).
 */

var DATA_SHEET_NAME = "Sheet1";
var DASH_SHEET_NAME = "Dashboard";

/** Optional: change if your data tab has another name. */
function getDataSheetName_() {
  return DATA_SHEET_NAME;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("CRM Dashboard")
    .addItem("Run full setup / rebuild Dashboard", "setupCrmDashboard")
    .addItem("Apply lead-type colors (Sheet1 col F)", "applyLeadTypeConditionalFormatting")
    .addToUi();
}

/**
 * One-time / rebuild: creates Dashboard, writes formulas, inserts charts, applies CF on Sheet1!F:F.
 */
function setupCrmDashboard() {
  var ss = SpreadsheetApp.getActive();
  var dataName = getDataSheetName_();
  var data = ss.getSheetByName(dataName);
  if (!data) {
    throw new Error('Missing sheet "' + dataName + '". Rename your data tab or edit DATA_SHEET_NAME in this script.');
  }

  var dash = ss.getSheetByName(DASH_SHEET_NAME);
  if (dash) {
    dash.getCharts().forEach(function (c) {
      dash.removeChart(c);
    });
    dash.clear();
    dash.clearConditionalFormatRules();
  } else {
    dash = ss.insertSheet(DASH_SHEET_NAME);
  }

  dash.setTabColor("#0b57d0");
  dash.setFrozenRows(3);

  // ----- Row 1: hero header -----
  dash.getRange("A1:J1").merge();
  dash
    .getRange("A1")
    .setValue("Wong Medical Centre · AI CRM Analytics")
    .setFontFamily("Roboto")
    .setFontSize(20)
    .setFontWeight("bold")
    .setBackground("#0b57d0")
    .setFontColor("#ffffff")
    .setVerticalAlignment("middle")
    .setHorizontalAlignment("center");
  dash.setRowHeight(1, 44);

  dash
    .getRange("A2:J2")
    .merge()
    .setValue("Live metrics from " + dataName + " · Last updated " + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm"))
    .setFontSize(10)
    .setFontColor("#5f6368")
    .setBackground("#f8f9fa")
    .setHorizontalAlignment("center");

  var S = "'" + dataName + "'!";

  // ----- KPI block A4:B11 -----
  dash.getRange("A4").setValue("KPI").setFontWeight("bold").setFontSize(12).setBackground("#e8f0fe");
  dash.getRange("B4").setValue("Value").setFontWeight("bold").setFontSize(12).setBackground("#e8f0fe");

  var kpiBody = [
    ["Total Leads", '=COUNTIFS(' + S + 'A2:A,"<>")'],
    ["Hot Leads", '=COUNTIF(' + S + 'F2:F,"Hot Lead")'],
    ["Warm Leads", '=COUNTIF(' + S + 'F2:F,"Warm Lead")'],
    ["Cold Leads", '=COUNTIF(' + S + 'F2:F,"Cold Lead")'],
    [
      "Today's Leads",
      '=COUNTIFS(' +
        S +
        'A2:A,">="&TEXT(TODAY(),"yyyy-mm-dd"),' +
        S +
        'A2:A,"<"&TEXT(TODAY()+1,"yyyy-mm-dd"))',
    ],
    ["Stroke Rehab Leads", '=COUNTIF(' + S + 'E2:E,"Stroke Rehab")'],
    ["General Inquiry Leads", '=COUNTIF(' + S + 'E2:E,"General Inquiry")'],
  ];
  dash.getRange(5, 1, 5 + kpiBody.length - 1, 2).setValues(kpiBody);
  dash.getRange("A5:A11").setFontWeight("bold");
  dash.getRange("B5:B11").setHorizontalAlignment("right").setNumberFormat("#,##0");
  dash.getRange("A4:B11").setBorder(true, true, true, true, true, true, "#dadce0", SpreadsheetApp.BorderStyle.SOLID);
  dash.getRange("B5:B11").setBackground("#ffffff");

  // ----- Chart feed: Lead types (pie) D4:E7 -----
  dash.getRange("D4").setValue("Lead type").setFontWeight("bold").setBackground("#e8f0fe");
  dash.getRange("E4").setValue("Count").setFontWeight("bold").setBackground("#e8f0fe");
  dash.getRange("D5:D7").setValues([["Hot Lead"], ["Warm Lead"], ["Cold Lead"]]);
  dash.getRange("E5").setFormula('=COUNTIF(' + S + 'F2:F,D5)');
  dash.getRange("E6").setFormula('=COUNTIF(' + S + 'F2:F,D6)');
  dash.getRange("E7").setFormula('=COUNTIF(' + S + 'F2:F,D7)');
  dash.getRange("D4:E7").setBorder(true, true, true, true, true, true, "#dadce0", SpreadsheetApp.BorderStyle.SOLID);

  // ----- Category counts for bar chart (QUERY) G4 -----
  dash.getRange("G4").setValue("Category").setFontWeight("bold").setBackground("#e8f0fe");
  dash.getRange("H4").setValue("Leads").setFontWeight("bold").setBackground("#e8f0fe");
  dash
    .getRange("G5")
    .setFormula(
      '=IFERROR(QUERY(' +
        S +
        'E2:E,"select E, count(E) where E is not null group by E order by count(E) desc label count(E) \'\'",0),{"No data",0})'
    );

  // ----- Daily trend M4 (60 buckets max) -----
  dash.getRange("M4").setValue("Date").setFontWeight("bold").setBackground("#e8f0fe");
  dash.getRange("N4").setValue("Leads").setFontWeight("bold").setBackground("#e8f0fe");
  dash
    .getRange("M5")
    .setFormula(
      "=IFERROR(QUERY(ARRAYFORMULA(IF(LEN(" +
        S +
        "A2:A),TEXT(DATEVALUE(LEFT(" +
        S +
        'A2:A,10)),"yyyy-mm-dd"),"")),"select Col1, count(Col1) where Col1 is not null group by Col1 order by Col1 desc limit 60 label count(Col1) \'\'",0),{"",0})'
    );

  // ----- Section: Hot leads table -----
  var hotTitleRow = 14;
  dash.getRange(hotTitleRow, 1).setValue("Hot leads (live from " + dataName + ")").setFontSize(13).setFontWeight("bold");
  dash
    .getRange(hotTitleRow + 1, 1)
    .setFormula(
      "=IF(COUNTIF(" +
        S +
        'F2:F,"Hot Lead")=0,"No hot leads yet.",FILTER(' +
        S +
        "A2:I,(" +
        S +
        'F2:F="Hot Lead")*(' +
        S +
        'A2:A<>"")))'
    );

  dash.setColumnWidth(1, 180);
  dash.setColumnWidth(2, 90);
  dash.setColumnWidths(3, 8, 140);
  dash.setColumnWidths(10, 4, 100);

  SpreadsheetApp.flush();
  Utilities.sleep(300);

  // ----- Charts -----
  var pie = dash
    .newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(dash.getRange("D4:E7"))
    .setOption("title", "Lead types")
    .setOption("colors", ["#d93025", "#f9ab00", "#80868b"])
    .setOption("pieSliceText", "value")
    .setOption("legend", { position: "right" })
    .setOption("chartArea", { width: "88%", height: "82%" })
    .setPosition(4, 10, 0, 0)
    .build();

  var bar = dash
    .newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dash.getRange("G4:H24"))
    .setOption("title", "Leads by category")
    .setOption("legend", { position: "none" })
    .setOption("hAxis", { slantedText: true })
    .setOption("vAxis", { minValue: 0, format: "0" })
    .setPosition(4, 16, 0, 0)
    .build();

  var line = dash
    .newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(dash.getRange("M4:N70"))
    .setOption("title", "Daily leads trend")
    .setOption("legend", { position: "none" })
    .setOption("curveType", "function")
    .setOption("vAxis", { minValue: 0 })
    .setPosition(22, 10, 0, 0)
    .build();

  dash.insertChart(pie);
  dash.insertChart(bar);
  dash.insertChart(line);

  applyLeadTypeConditionalFormatting();
}

/**
 * Conditional formatting on data sheet column F (LeadType).
 * Hot = red tint, Warm = yellow tint, Cold = grey tint.
 */
function applyLeadTypeConditionalFormatting() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(getDataSheetName_());
  if (!sh) return;

  /** Whole column F below header so new webhook rows pick up formatting without re-running script. */
  var colF = sh.getRange(2, 6, sh.getMaxRows(), 6);

  var others = sh.getConditionalFormatRules().filter(function (rule) {
    return !rule.getRanges().some(function (r) {
      return r.getSheet().getSheetId() === sh.getSheetId() && r.getColumn() === 6 && r.getNumColumns() === 1;
    });
  });

  var hot = SpreadsheetApp.newConditionalFormatRule()
    .setRanges([colF])
    .whenTextEqualTo("Hot Lead")
    .setBackground("#fce8e6")
    .setFontColor("#c5221f")
    .build();

  var warm = SpreadsheetApp.newConditionalFormatRule()
    .setRanges([colF])
    .whenTextEqualTo("Warm Lead")
    .setBackground("#fef7e0")
    .setFontColor("#b06000")
    .build();

  var cold = SpreadsheetApp.newConditionalFormatRule()
    .setRanges([colF])
    .whenTextEqualTo("Cold Lead")
    .setBackground("#f1f3f8")
    .setFontColor("#5f6368")
    .build();

  sh.setConditionalFormatRules([hot, warm, cold].concat(others));
}

/**
 * Optional: run from script editor once to refresh CF when Sheet1 grows a lot.
 * Formulas/charts already include full columns; this only extends CF range.
 */
function refreshLeadTypeFormattingRange() {
  applyLeadTypeConditionalFormatting();
}
