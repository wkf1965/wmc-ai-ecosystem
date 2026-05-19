require("dotenv").config();

const config = {
  port: Number(process.env.PORT) || 3000,

  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_API_BASE || "https://api.deepseek.com",
    model: process.env.OPENAI_MODEL || "deepseek-chat",
  },

  whapi: {
    token: process.env.WHAPI_TOKEN || "",
    apiUrl: (process.env.WHAPI_API_URL || "https://gate.whapi.cloud").replace(
      /\/$/,
      "",
    ),
  },

  google: {
    sheetId: process.env.GOOGLE_SHEET_ID || "",
    credentials:
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      "./google-credentials.json",
    patientsRange: "Patients!A:D",
  },
};

module.exports = config;
