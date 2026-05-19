const axios = require("axios");
const config = require("../config");

/**
 * Sends a WhatsApp text message via the WHAPI gateway.
 *
 * @param {string} to   Recipient phone number or chat_id (e.g. "60123456789@s.whatsapp.net")
 * @param {string} body Message text to send
 * @returns {Promise<object>} WHAPI response data
 */
async function sendMessage(to, body) {
  const cleanTo = String(to).replace(/\s/g, "");
  console.log("[WHATSAPP_SEND_START]", { to: cleanTo, chars: String(body || "").length });

  try {
    const response = await axios.post(
      `${config.whapi.apiUrl}/messages/text`,
      { to: cleanTo, body },
      {
        headers: {
          Authorization: `Bearer ${config.whapi.token}`,
          "Content-Type": "application/json",
        },
        timeout: 10_000,
      },
    );

    console.log("[WHATSAPP_SEND_SUCCESS]");
    return response.data;
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    console.error(
      "[WHATSAPP_SEND_ERROR]",
      JSON.stringify({ status, message: err.message, data }),
    );
    throw err;
  }
}

module.exports = { sendMessage };
