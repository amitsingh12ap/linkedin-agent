/**
 * server/whatsapp-handler.js
 *
 * Handles inbound WhatsApp messages from Amit.
 * Supported commands:
 *   "history"          → last 5 posts
 *   "stats"            → quick stats
 *   "reply N"          → post the Nth queued comment reply to LinkedIn
 *   [voice note]       → transcribe + rewrite as LinkedIn post draft
 *   anything else      → help message
 */
const axios    = require("axios");
const fs       = require("fs");
const path     = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../data/agent.json");

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM  = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
const WHATSAPP_TO  = process.env.WHATSAPP_TO;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Utility ───────────────────────────────────────────────────────────────────

function loadStore() {
  if (!fs.existsSync(DB_PATH)) return { history: [], pendingCommentReplies: [] };
  const store = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  if (!store.pendingCommentReplies) store.pendingCommentReplies = [];
  return store;
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2));
}

async function sendWhatsApp(body) {
  const params = new URLSearchParams({ From: TWILIO_FROM, To: WHATSAPP_TO, Body: body });
  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    params.toString(),
    { auth: { username: TWILIO_SID, password: TWILIO_TOKEN },
      headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
}

// ── Command: history ──────────────────────────────────────────────────────────

async function handleHistory() {
  const store = loadStore();
  const recent = (store.history || []).slice(0, 5);
  if (recent.length === 0) {
    return sendWhatsApp("📭 No posts yet. Approve your first draft to see history here.");
  }
  const lines = ["📚 *Your last 5 LinkedIn posts:*", ""];
  recent.forEach((h, i) => {
    const date = h.posted_at ? h.posted_at.slice(0, 10) : "?";
    const preview = h.post_text?.slice(0, 120).replace(/\n/g, " ") + "...";
    lines.push(`*${i + 1}. ${date}* [${h.theme_id?.replace(/-/g," ")}]`);
    lines.push(preview);
    lines.push("");
  });
  await sendWhatsApp(lines.join("\n"));
}

// ── Command: stats ────────────────────────────────────────────────────────────

async function handleStats() {
  const store   = loadStore();
  const history = store.history || [];
  const total   = history.length;

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const thisWeek = history.filter(h => new Date(h.posted_at) >= sevenDaysAgo).length;

  const postedDays = new Set(history.map(h => h.posted_at?.slice(0, 10)));
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const s = d.toISOString().slice(0, 10);
    if (postedDays.has(s)) streak++;
    else break;
  }

  const hours = history.filter(h => h.approved_hour != null).map(h => h.approved_hour);
  const freq  = {};
  hours.forEach(h => { freq[h] = (freq[h] || 0) + 1; });
  const bestHour = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0];

  const lines = [
    `📊 *Quick Stats*`,
    ``,
    `📝 Total posts: *${total}*`,
    `📅 This week: *${thisWeek}*`,
    `🔥 Streak: *${streak} day${streak !== 1 ? "s" : ""}*`,
    bestHour ? `⏰ Best approval hour: *${bestHour[0]}:00 IST*` : null,
    ``,
    `Reply *history* to see your last 5 posts.`,
  ].filter(Boolean).join("\n");

  await sendWhatsApp(lines);
}

// ── Command: reply N ──────────────────────────────────────────────────────────

async function handleReply(n) {
  const store   = loadStore();
  const replies = store.pendingCommentReplies || [];
  const idx     = n - 1;

  if (idx < 0 || idx >= replies.length) {
    return sendWhatsApp(`⚠️ No reply #${n} pending. Send *stats* to see your status.`);
  }

  const { commentUrn, replyText, postUrn } = replies[idx];

  // Post the reply to LinkedIn
  await axios.post(
    "https://api.linkedin.com/v2/socialActions/" + encodeURIComponent(postUrn) + "/comments",
    {
      actor:   process.env.LINKEDIN_PERSON_URN,
      message: { text: replyText },
      parentComment: commentUrn,
    },
    { headers: { Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`, "Content-Type": "application/json" } }
  );

  // Remove from pending
  store.pendingCommentReplies.splice(idx, 1);
  saveStore(store);
  await sendWhatsApp(`✅ Reply posted to LinkedIn!\n\n"${replyText.slice(0, 100)}..."`);
}

// ── Voice note handler ────────────────────────────────────────────────────────

async function handleVoiceNote(mediaUrl) {
  await sendWhatsApp("🎙️ Got your voice note — transcribing and rewriting...");

  // Download audio from Twilio (requires auth)
  const audioRes = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    auth: { username: TWILIO_SID, password: TWILIO_TOKEN },
  });

  const audioBuffer = Buffer.from(audioRes.data);
  const mimeType    = audioRes.headers["content-type"] || "audio/ogg";

  // Transcribe using Claude's audio understanding (base64 encode)
  const base64Audio = audioBuffer.toString("base64");

  // Step 1: Transcribe
  const transcriptRes = await client.messages.create({
    model: "claude-opus-4-5-20251101",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: "This is a voice note from a senior engineering leader. Please transcribe it exactly. Output only the transcription, nothing else.",
        },
        {
          type: "document",
          source: { type: "base64", media_type: mimeType, data: base64Audio },
        },
      ],
    }],
  });

  const transcript = transcriptRes.content[0].text.trim();
  console.log("[voice] Transcript:", transcript);

  // Step 2: Rewrite as LinkedIn post in Amit's voice
  const { generatePost } = require("../src/generator");
  const { getRecentPostTypes } = require("../src/db");

  const recentPostTypes = getRecentPostTypes(3);

  // Override: use transcript as inspiration for a custom post
  const rewriteRes = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: require("../src/generator").VOICE_PROFILE || `You are a LinkedIn ghostwriter for Amit Singh, Director of Engineering at JioStar. Short, punchy, authentic, under 150 words.`,
    messages: [{
      role: "user",
      content: `The person recorded this voice note:\n\n"${transcript}"\n\nRewrite this as a LinkedIn post in Amit's authentic voice. Keep the core insight but make it punchy, under 150 words. Don't mention it was a voice note. Just output the post text, nothing else.`,
    }],
  });

  const postText = rewriteRes.content[0].text.trim();

  // Save as pending draft
  const store  = loadStore();
  const today  = new Date().toISOString().slice(0, 10);
  const draftId = `voice-${Date.now()}`;
  store.pendingDraft = { draftId, themeId: "voice", postText, postType: "voice_note", date: today };
  saveStore(store);

  // Send for approval (same 3-button flow)
  const { sendApprovalRequest } = require("../src/notifier");
  await sendApprovalRequest(postText, draftId);
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

async function handleWhatsAppMessage(body) {
  const from = body.From || "";
  // Only respond to Amit's number
  if (WHATSAPP_TO && from !== WHATSAPP_TO) {
    console.log("[whatsapp] Ignoring message from unknown sender:", from);
    return;
  }

  const text     = (body.Body || "").trim().toLowerCase();
  const numMedia = parseInt(body.NumMedia || "0");
  const mediaUrl = body.MediaUrl0;
  const mediaType = (body.MediaContentType0 || "").toLowerCase();

  console.log(`[whatsapp] From: ${from} | Text: "${text}" | Media: ${numMedia}`);

  // Voice note
  if (numMedia > 0 && mediaType.includes("audio")) {
    return handleVoiceNote(mediaUrl);
  }

  // Text commands
  if (text === "history") return handleHistory();
  if (text === "stats")   return handleStats();

  const replyMatch = text.match(/^reply\s+(\d+)$/);
  if (replyMatch) return handleReply(parseInt(replyMatch[1]));

  // Help
  await sendWhatsApp([
    `👋 *LinkedIn Agent Commands:*`,
    ``,
    `*history*   — see your last 5 posts`,
    `*stats*     — posting streak & timing data`,
    `*reply N*   — post queued comment reply #N`,
    ``,
    `🎙️ Send a *voice note* — I'll rewrite it as a LinkedIn post draft and send it for your approval.`,
  ].join("\n"));
}

module.exports = { handleWhatsAppMessage };
