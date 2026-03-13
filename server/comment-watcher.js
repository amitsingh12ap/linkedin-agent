/**
 * server/comment-watcher.js
 *
 * Polls LinkedIn for new comments on Amit's recent posts.
 * For each unseen comment, Claude drafts a reply and WhatsApps it.
 * Amit replies "reply N" to post it.
 */
const axios    = require("axios");
const fs       = require("fs");
const path     = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../data/agent.json");
const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM  = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
const WHATSAPP_TO  = process.env.WHATSAPP_TO;

function loadStore() {
  if (!fs.existsSync(DB_PATH)) return { history: [], seenComments: [], pendingCommentReplies: [] };
  const s = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  if (!s.seenComments)          s.seenComments = [];
  if (!s.pendingCommentReplies) s.pendingCommentReplies = [];
  return s;
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

async function fetchRecentPostUrns() {
  const store = loadStore();
  // Only check posts from the last 14 days (comments unlikely after that)
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  return (store.history || [])
    .filter(h => h.linkedin_id && h.posted_at > cutoff)
    .map(h => h.linkedin_id)
    .slice(0, 5);
}

async function fetchComments(postUrn) {
  try {
    const res = await axios.get(
      `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}/comments`,
      {
        headers: { Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` },
        params: { count: 20 },
      }
    );
    return (res.data.elements || []).map(c => ({
      urn:     c.id,
      postUrn: postUrn,
      author:  c.actor?.replace("urn:li:person:", "") || "unknown",
      text:    c.message?.text || "",
      created: c.created?.time || 0,
    }));
  } catch (err) {
    console.error(`[comments] Failed to fetch for ${postUrn}:`, err.message);
    return [];
  }
}

async function draftReply(commentText, postContext) {
  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [{
      role: "user",
      content: `You are replying to a LinkedIn comment on behalf of Amit Singh, Director of Engineering at JioStar.

Comment: "${commentText}"

Write a short, warm, authentic reply (2-3 sentences max). No fluff. Sound like a real person, not a corporate account. Don't start with "Great comment!" or similar sycophancy. Output only the reply text.`,
    }],
  });
  return res.content[0].text.trim();
}

async function checkAndNotifyComments() {
  const store = loadStore();
  const seen  = new Set(store.seenComments || []);

  const postUrns = await fetchRecentPostUrns();
  if (postUrns.length === 0) {
    console.log("[comments] No recent posts to check.");
    return;
  }

  let newReplies = [];

  for (const postUrn of postUrns) {
    const comments = await fetchComments(postUrn);
    for (const comment of comments) {
      if (seen.has(comment.urn)) continue;
      seen.add(comment.urn);

      const replyText = await draftReply(comment.text, postUrn);
      newReplies.push({ ...comment, replyText });
    }
  }

  if (newReplies.length === 0) {
    console.log("[comments] No new comments.");
    return;
  }

  // Save pending replies
  store.seenComments = [...seen].slice(-200); // cap at 200
  store.pendingCommentReplies = [
    ...(store.pendingCommentReplies || []),
    ...newReplies.map(r => ({ commentUrn: r.urn, postUrn: r.postUrn, replyText: r.replyText }))
  ].slice(-10); // keep last 10
  saveStore(store);

  // Send WhatsApp notification with drafted replies
  const lines = [`💬 *${newReplies.length} new comment${newReplies.length > 1 ? "s" : ""} on your posts:*`, ``];
  newReplies.forEach((r, i) => {
    const n = (store.pendingCommentReplies.length - newReplies.length + i + 1);
    lines.push(`*Comment:* "${r.text.slice(0, 100)}${r.text.length > 100 ? "..." : ""}"`);
    lines.push(`*Draft reply:* "${r.replyText}"`);
    lines.push(`👉 Send *reply ${n}* to post this`);
    lines.push(``);
  });
  lines.push(`Or just ignore — no action needed to skip.`);

  await sendWhatsApp(lines.join("\n"));
  console.log(`[comments] Sent ${newReplies.length} draft replies via WhatsApp.`);
}

module.exports = { checkAndNotifyComments };
