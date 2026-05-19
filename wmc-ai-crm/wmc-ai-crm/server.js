const app    = require("./src/app");
const config = require("./src/config");
const { startCampaignScheduler }  = require("./src/services/campaignScheduler");
const { start: startAllLoops }    = require("./services/startAllLoops");

const PORT = config.port;

app.listen(PORT, () => {
  console.log("─────────────────────────────────────────────────────");
  console.log(" WMC AI CRM — WhatsApp Auto Reply System");
  console.log("─────────────────────────────────────────────────────");
  console.log(`  Port         : ${PORT}`);
  console.log(`  Health       : http://localhost:${PORT}/health`);
  console.log(`  Suggestions  : http://localhost:${PORT}/health/suggestions`);
  console.log(`  Webhook      : http://localhost:${PORT}/webhook`);
  console.log(`  Loops API    : http://localhost:${PORT}/api/loops`);
  console.log("─────────────────────────────────────────────────────");

  // Start all 6 AI loops and force-write LoopDashboard Google Sheet.
  // Creates the LoopDashboard tab if it does not exist.
  startAllLoops().catch((err) =>
    console.error("[Server] startAllLoops error:", err.message),
  );

  // Daily campaign scheduler (runs at 10:00 AM MYT)
  startCampaignScheduler();
});
