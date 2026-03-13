/**
 * run-once.js — GitHub Actions entry point.
 *
 * MODE=draft      (default, cron) — decide to post, generate, WhatsApp for approval
 * MODE=post       — post approved draft to LinkedIn
 * MODE=decline    — clear declined draft, reset for tomorrow
 * MODE=regenerate — force a different angle, send new WhatsApp preview
 */
require("dotenv").config();
const { generatePost }        = require("./generator");
const { postToLinkedIn }      = require("./linkedin");
const { getNextTheme, markThemeUsed, initDB, loadDB, saveDB, getRecentPostTypes } = require("./db");
const { sendApprovalRequest } = require("./notifier");
const logger                  = require("./logger");

function getISTHour() {
  const now = new Date();
  const istMs = now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000;
  return new Date(istMs).getHours();
}

function getISTDateString() {
  const now = new Date();
  const istMs = now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000;
  const d = new Date(istMs);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Smart timing: pick best hour based on approval history, fall back to random
function pickTargetHour(db) {
  const approvedHours = (db.history || [])
    .filter(h => h.approved_hour != null)
    .map(h => h.approved_hour);

  if (approvedHours.length < 5) {
    // Not enough data yet — pick random between 8–13
    return randInt(8, 13);
  }

  // Build frequency map and add some randomness so it doesn't become too predictable
  const freq = {};
  approvedHours.forEach(h => { freq[h] = (freq[h] || 0) + 1; });
  const candidates = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h]) => parseInt(h));

  // Pick one of the top 3 hours randomly (adds variety)
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ── MODE: post ────────────────────────────────────────────────────────────────
async function postApproved() {
  await initDB();
  const db = await loadDB();
  if (!db.pendingDraft) { logger.info("⚠️  No pending draft."); return; }

  const { themeId, postText, postType } = db.pendingDraft;
  logger.info(`📤 Posting approved draft (theme: ${themeId}, type: ${postType})`);
  logger.info(`✍️  Post:\n${"─".repeat(50)}\n${postText}\n${"─".repeat(50)}`);

  const result = await postToLinkedIn(postText);
  logger.info(`✅ Published! LinkedIn URN: ${result.id}`);

  // Record the hour of approval for smart timing
  const approvedHour = getISTHour();
  await markThemeUsed(themeId, postText, result.id, postType, approvedHour);
  db.pendingDraft = null;
  await saveDB(db);
  logger.info(`💾 Done. Approved at IST hour ${approvedHour} (used for smart timing).`);
}

// ── MODE: decline ─────────────────────────────────────────────────────────────
async function postDeclined() {
  await initDB();
  const db = await loadDB();
  if (!db.pendingDraft) { logger.info("⚠️  No pending draft to decline."); return; }
  logger.info(`❌ Declining (theme: ${db.pendingDraft.themeId}, type: ${db.pendingDraft.postType})`);
  db.pendingDraft  = null;
  db.todayDecision = null;
  await saveDB(db);
  logger.info("🗑️  Draft cleared. Fresh post tomorrow.");
}

// ── MODE: regenerate ──────────────────────────────────────────────────────────
async function postRegenerate() {
  await initDB();
  const db = await loadDB();
  const today = getISTDateString();

  // Get the theme from existing draft (same theme, different angle)
  const themeId = db.pendingDraft?.themeId || (await getNextTheme()).id;
  const theme = { id: themeId };

  const recentPostTypes = getRecentPostTypes(3);
  logger.info(`🔄 Regenerating — theme: ${themeId}, forcing different angle`);

  const { post: postText, postType } = await generatePost(theme, recentPostTypes, true);
  logger.info(`✍️  New draft (type: ${postType}):\n${"─".repeat(50)}\n${postText}\n${"─".repeat(50)}`);

  const draftId = `${today}-${Date.now()}`;
  db.pendingDraft = { draftId, themeId, postText, postType, date: today };
  await saveDB(db);

  await sendApprovalRequest(postText, draftId);
  logger.info(`📱 New WhatsApp sent with fresh angle.`);
}

// ── MODE: draft ───────────────────────────────────────────────────────────────
async function draftAndNotify() {
  await initDB();
  const db    = await loadDB();
  const today = getISTDateString();
  const istHour = getISTHour();

  if (db.pendingDraft && db.pendingDraft.date === today) {
    logger.info(`📨 Approval already sent today. Waiting.`); return;
  }
  if (db.lastPosted === today) {
    logger.info(`✅ Already posted today. Skipping.`); return;
  }

  if (!db.todayDecision || db.todayDecision.date !== today) {
    const shouldPost = Math.random() < 5 / 7;
    const targetHour = pickTargetHour(db); // smart timing
    db.todayDecision = { date: today, shouldPost, targetHour };
    await saveDB(db);
    logger.info(`🎲 Today: shouldPost=${shouldPost}, targetHour=${targetHour}:xx IST (smart)`);
  }

  const { shouldPost, targetHour } = db.todayDecision;
  if (!shouldPost) { logger.info(`🚫 Randomly skipping today.`); return; }
  if (istHour < targetHour) { logger.info(`⏳ Target ${targetHour}:xx IST, now ${istHour}:xx. Waiting.`); return; }

  const VALID_THEMES = ["engineering-leadership","ai-productivity","streaming-tech","personal-growth"];
  const override = process.env.THEME_OVERRIDE;
  const theme = (override && override !== "auto" && VALID_THEMES.includes(override))
    ? { id: override, name: override }
    : await getNextTheme();

  const recentPostTypes = getRecentPostTypes(3);
  logger.info(`📌 Theme: ${theme.name || theme.id} | Recent types: [${recentPostTypes.join(", ")}]`);

  const { post: postText, postType } = await generatePost(theme, recentPostTypes);
  logger.info(`✍️  Draft (type: ${postType}):\n${"─".repeat(50)}\n${postText}\n${"─".repeat(50)}`);

  const draftId = `${today}-${Date.now()}`;
  db.pendingDraft = { draftId, themeId: theme.id, postText, postType, date: today };
  await saveDB(db);

  await sendApprovalRequest(postText, draftId);
  logger.info(`📱 WhatsApp sent.`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {
  const mode = process.env.MODE || "draft";
  logger.info(`🚀 Running in MODE=${mode}`);
  if      (mode === "post")       await postApproved();
  else if (mode === "decline")    await postDeclined();
  else if (mode === "regenerate") await postRegenerate();
  else                            await draftAndNotify();
}

main().catch((err) => {
  console.error("❌ Agent failed:", err.message);
  process.exit(1);
});
