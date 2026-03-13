/**
 * WhatsApp notifier via Twilio.
 * Sends a post preview to Amit's WhatsApp with approve + decline links.
 */
const axios = require("axios");
require("dotenv").config();

const TWILIO_ACCOUNT_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN    = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
const WHATSAPP_TO          = process.env.WHATSAPP_TO;
const GITHUB_REPO          = process.env.GITHUB_REPO || "amitsingh12ap/linkedin-agent";
const GITHUB_PAT           = process.env.GITHUB_PAT;

const BASE_URL = `https://amitsingh12ap.github.io/linkedin-agent`;

/**
 * Sends WhatsApp preview with ✅ Approve and ❌ Decline links.
 */
async function sendApprovalRequest(postText, draftId) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials not set");
  }
  if (!WHATSAPP_TO) {
    throw new Error("WHATSAPP_TO not set");
  }

  const preview = postText.length > 500
    ? postText.slice(0, 497) + "..."
    : postText;

  const approveUrl = `${BASE_URL}/approve.html?pat=${GITHUB_PAT}&repo=${GITHUB_REPO}`;
  const declineUrl = `${BASE_URL}/decline.html?pat=${GITHUB_PAT}&repo=${GITHUB_REPO}`;

  const body = [
    `📝 *LinkedIn Post Ready*`,
    ``,
    preview,
    ``,
    `──────────────────`,
    `✅ *Approve & Post:*`,
    approveUrl,
    ``,
    `❌ *Decline (skip today):*`,
    declineUrl,
    ``,
    `⏰ Expires midnight IST.`,
  ].join("\n");

  const params = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: WHATSAPP_TO,
    Body: body,
  });

  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    params.toString(),
    {
      auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );

  console.log(`✅ WhatsApp sent to ${WHATSAPP_TO}`);
}

module.exports = { sendApprovalRequest };
