/**
 * Orchestrates Marketing Leads upsert, Follow Up Queue (hot), and Campaign aggregates.
 */

const { toSheetUtf8String } = require("./sheetsAppend");
const {
  getClient,
  ensureMarketingTabs,
  loadMarketingLeadByPhone,
  loadFollowUpQueueByPhone,
  bumpCampaignRow,
  DEFAULT_FOLLOWUP_MSG,
  TAB_LEADS,
  TAB_QUEUE,
} = require("./sheetsMarketingCrm");
const {
  inferServiceInterestMarketing,
  extractMarketingKeyword,
  inferMarketingLeadType,
  inferMarketingStage,
} = require("./marketingCrmInference");

function esc(t) {
  return `'${String(t).replace(/'/g, "''")}'`;
}

/**
 * @param {{
 *   phoneKey: string;
 *   sheetPayload: Record<string, string>;
 *   trimmedMessage: string;
 *   casualGreet: boolean;
 *   pipelineNextStage: string;
 *   campaign: string;
 *   platform: string;
 *   budgetStr: string;
 *   sourceLabel: string;
 * }} opts
 */
async function syncMarketingCrm(opts) {
  const ctx = await getClient();
  if (!ctx) return { ok: false, reason: "not_configured" };
  const { sheets, spreadsheetId } = ctx;

  const {
    phoneKey,
    sheetPayload,
    trimmedMessage,
    casualGreet,
    pipelineNextStage,
    campaign,
    platform,
    budgetStr,
    sourceLabel,
  } = opts;

  if (!phoneKey) return { ok: false, reason: "no_phone" };

  await ensureMarketingTabs(sheets, spreadsheetId);

  const existing = await loadMarketingLeadByPhone(sheets, spreadsheetId, phoneKey);

  const inferredSvc = inferServiceInterestMarketing(trimmedMessage);
  const serviceInterest =
    inferredSvc !== "General Inquiry"
      ? inferredSvc
      : sheetPayload.category || "General Inquiry";

  const keyword =
    extractMarketingKeyword(trimmedMessage) ||
    (existing?.keyword && existing.keyword.trim()) ||
    "";

  const mLeadType = inferMarketingLeadType(
    trimmedMessage,
    casualGreet,
    sheetPayload.leadType || "",
  );

  const newStage = inferMarketingStage({
    trimmedMessage,
    casualGreet,
    marketingLeadType: mLeadType,
    previousMarketingStage: existing?.marketingStage || "New Lead",
    pipelineSalesStage: pipelineNextStage || "",
    crmCategory: sheetPayload.category || "",
  });

  const nowIso = new Date().toISOString();
  const firstTs = existing?.timestamp || sheetPayload.timestamp;
  const src = (sourceLabel || sheetPayload.source || "whatsapp").trim();
  const camp =
    (campaign || "").trim() ||
    (existing?.campaign || "").trim() ||
    "";

  const cells = [
    toSheetUtf8String(firstTs),
    toSheetUtf8String(sheetPayload.name || existing?.name || ""),
    toSheetUtf8String(phoneKey || sheetPayload.phone || ""),
    toSheetUtf8String(src),
    toSheetUtf8String(camp),
    toSheetUtf8String(keyword),
    toSheetUtf8String(serviceInterest),
    toSheetUtf8String(mLeadType),
    toSheetUtf8String(newStage),
    toSheetUtf8String(sheetPayload.message || ""),
    toSheetUtf8String(sheetPayload.reply || ""),
    toSheetUtf8String(sheetPayload.nextAction || ""),
    toSheetUtf8String(nowIso),
  ];

  const prevStage = (existing?.marketingStage || "").trim();
  if (prevStage && prevStage !== newStage) {
    console.log("[MARKETING STAGE UPDATE]", phoneKey, `${prevStage} → ${newStage}`);
  } else if (!prevStage && newStage !== "New Lead") {
    console.log("[MARKETING STAGE UPDATE]", phoneKey, `→ ${newStage}`);
  }

  if (!existing) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${esc(TAB_LEADS)}!A:M`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { majorDimension: "ROWS", values: [cells] },
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${esc(TAB_LEADS)}!A${existing.rowIndex1Based}:M${existing.rowIndex1Based}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { majorDimension: "ROWS", values: [cells] },
    });
  }
  console.log("[MARKETING CRM SAVE]", phoneKey);

  if (mLeadType === "Hot Lead") {
    const later = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const qExisting = await loadFollowUpQueueByPhone(
      sheets,
      spreadsheetId,
      phoneKey,
    );
    const qCells = [
      toSheetUtf8String(phoneKey),
      toSheetUtf8String(sheetPayload.name || qExisting?.name || ""),
      toSheetUtf8String(serviceInterest),
      toSheetUtf8String(mLeadType),
      toSheetUtf8String(nowIso),
      toSheetUtf8String(later),
      toSheetUtf8String(DEFAULT_FOLLOWUP_MSG),
      toSheetUtf8String(qExisting?.status === "Done" ? "Done" : "Pending"),
    ];
    if (!qExisting) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${esc(TAB_QUEUE)}!A:H`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { majorDimension: "ROWS", values: [qCells] },
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${esc(TAB_QUEUE)}!A${qExisting.rowIndex1Based}:H${qExisting.rowIndex1Based}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { majorDimension: "ROWS", values: [qCells] },
      });
    }
    console.log("[FOLLOW UP QUEUE ADD]", phoneKey);
  }

  const isNew = !existing;
  const hotDelta =
    mLeadType === "Hot Lead" && !/hot/i.test(existing?.leadType || "") ? 1 : 0;
  const apptDelta =
    newStage === "Appointment Booked" &&
    (existing?.marketingStage || "").indexOf("Appointment Booked") === -1
      ? 1
      : 0;
  const convDelta =
    newStage === "Converted" &&
    (existing?.marketingStage || "").indexOf("Converted") === -1
      ? 1
      : 0;

  if (
    camp &&
    (isNew || hotDelta > 0 || apptDelta > 0 || convDelta > 0)
  ) {
    await bumpCampaignRow(sheets, spreadsheetId, {
      campaignName: camp,
      platform: platform || "WhatsApp",
      service: serviceInterest,
      budgetStr: budgetStr || "0",
      leadsDelta: isNew ? 1 : 0,
      hotDelta,
      apptDelta,
      convDelta,
    });
  }

  return {
    ok: true,
    marketingStage: newStage,
    marketingLeadType: mLeadType,
    serviceInterest,
  };
}

module.exports = { syncMarketingCrm };
