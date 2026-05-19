require("dotenv").config();





















const axios = require("axios");

async function sendWhatsApp(to, message) {
  try {
    const cleanNumber = String(to).replace(/\D/g, "");

    const response = await axios.post(
      `${process.env.WHAPI_API_URL}/messages/text`,
      {
        to: cleanNumber,
        body: message,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHAPI_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log("WhatsApp sent:", response.data);
    return response.data;
  } catch (error) {
    console.error("WhatsApp error:", error.response?.data || error.message);
    throw error;
  }
}

module.exports = { sendWhatsApp };
