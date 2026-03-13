/**
 * server/index.js — Webhook server for Phase 2 features.
 *
 * Handles:
 *   POST /webhook/whatsapp  — Twilio WhatsApp inbound messages
 *   POST /webhook/comment   — scheduled check for new LinkedIn comments
 *   GET  /health            — uptime check
 */
const express      = require("express");
const bodyParser   = require("body-parser");
const { handleWhatsAppMessage } = require("./whatsapp-handler");
const { checkAndNotifyComments } = require("./comment-watcher");

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Health check — Railway pings this to keep the dyno alive
app.get("/health", (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Twilio sends inbound WhatsApp messages here
app.post("/webhook/whatsapp", async (req, res) => {
  res.sendStatus(200); // Respond immediately — Twilio times out at 15s
  try {
    await handleWhatsAppMessage(req.body);
  } catch (err) {
    console.error("[webhook/whatsapp] Error:", err.message);
  }
});

// GitHub Actions cron calls this every 2h during weekdays
app.post("/webhook/comments", async (req, res) => {
  res.sendStatus(202);
  try {
    await checkAndNotifyComments();
  } catch (err) {
    console.error("[webhook/comments] Error:", err.message);
  }
});

app.listen(PORT, () => console.log(`✅ Webhook server running on port ${PORT}`));
