/**
 * server/index.js — Webhook + OAuth server.
 *
 * Handles:
 *   GET  /health                  — uptime check
 *   POST /auth/linkedin/token     — exchanges LinkedIn OAuth code for access token + URN
 *   POST /webhook/whatsapp        — Twilio WhatsApp inbound messages
 *   POST /webhook/comments        — scheduled LinkedIn comment watcher
 */
const express    = require("express");
const bodyParser = require("body-parser");
const axios      = require("axios");
const { handleWhatsAppMessage }   = require("./whatsapp-handler");
const { checkAndNotifyComments }  = require("./comment-watcher");

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// CORS — allow GitHub Pages frontend to call this server
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── LinkedIn OAuth Token Exchange ─────────────────────────────────────────────
// Called by callback.html with { code, redirect_uri }
// Returns { access_token, person_urn, expires_in }
app.post("/auth/linkedin/token", async (req, res) => {
  const { code, redirect_uri } = req.body;

  if (!code || !redirect_uri) {
    return res.status(400).json({ error: "Missing code or redirect_uri" });
  }

  const clientId     = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: "Server missing LinkedIn credentials" });
  }

  try {
    // Step 1: Exchange code for access token
    const tokenRes = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type:    "authorization_code",
        code,
        redirect_uri,
        client_id:     clientId,
        client_secret: clientSecret,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, expires_in } = tokenRes.data;

    // Step 2: Fetch person URN using the token (LinkedIn requires versioned API)
    const meRes = await axios.get("https://api.linkedin.com/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "LinkedIn-Version": "202304",
      },
    });

    // userinfo returns sub = person ID (from OpenID Connect)
    const person_urn = `urn:li:person:${meRes.data.sub}`;
    const name       = meRes.data.name || `${meRes.data.given_name || ""} ${meRes.data.family_name || ""}`.trim();

    return res.json({ access_token, person_urn, name, expires_in });

  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error("[auth/linkedin/token] Error:", detail);
    return res.status(500).json({ error: "Token exchange failed", detail });
  }
});

// ── WhatsApp Webhook ──────────────────────────────────────────────────────────
app.post("/webhook/whatsapp", async (req, res) => {
  res.sendStatus(200);
  try { await handleWhatsAppMessage(req.body); }
  catch (err) { console.error("[webhook/whatsapp]", err.message); }
});

// ── Comment Watcher ───────────────────────────────────────────────────────────
app.post("/webhook/comments", async (req, res) => {
  res.sendStatus(202);
  try { await checkAndNotifyComments(); }
  catch (err) { console.error("[webhook/comments]", err.message); }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
