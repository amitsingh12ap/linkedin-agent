/**
 * WhatsApp notifier via Twilio.
 * Sends a post preview to Amit's WhatsApp with an approve link.
 */
const axios = require("axios");
require("dotenv").config();

const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886"; // Twilio sandbox default
const WHATSAPP_TO         = process.env.WHATSAPP_TO; // e.g. whatsapp:+919XXXXXXXXX

const GITHUB_REPO         = process.env.GITHUB_REPO || "amitsingh12ap/linkedin-agent";
const GITHUB_PAT          = process.env.GITHUB_PAT;  // Personal Access Token with workflow scope

/**
 * Triggers the post workflow via GitHub API.
 * This is what the approve endpoint calls.
 */
async function triggerPostWorkflow() {
  if (!GITHUB_PAT) throw new Error("GITHUB_PAT not set");
  await axios.post(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/post-approved.yml/dispatches`,
    { ref: "main" },
    {
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
}

/**
 * Sends a WhatsApp preview message with an approve link.
 * The approve link hits a GitHub Pages redirect that calls the GitHub API.
 */
async function sendApprovalRequest(postText, draftId) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials not set (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  }
  if (!WHATSAPP_TO) {
    throw new Error("WHATSAPP_TO not set (e.g. whatsapp:+919XXXXXXXXX)");
  }

  // Approval link — triggers the post-approved workflow via GitHub API redirect page
  const approveUrl = `https://amitsingh12ap.github.io/linkedin-agent/approve?token=${draftId}&pat=${GITHUB_PAT}&repo=${GITHUB_REPO}`;

  const preview = postText.length > 400
    ? postText.slice(0, 397) + "..."
    : postText;

  const body = [
    `📝 *LinkedIn Post Ready for Approval*`,
    ``,
    `${preview}`,
    ``,
    `──────────────────`,
    `✅ Tap to approve & post:`,
    approveUrl,
    ``,
    `⏰ Expires at midnight IST. No action = skipped today.`,
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

  console.log(`✅ WhatsApp approval request sent to ${WHATSAPP_TO}`);
}

module.exports = { sendApprovalRequest, triggerPostWorkflow };
