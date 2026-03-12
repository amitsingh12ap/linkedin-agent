/**
 * run-once.js — GitHub Actions entry point.
 *
 * Two modes controlled by env var:
 *
 *   MODE=draft  (default, cron job)
 *     - Rolls dice: skip ~2/7 days
 *     - Picks random IST hour (8 AM–1 PM)
 *     - When it's time: generates post, saves as pendingDraft, sends WhatsApp for approval
 *
 *   MODE=post  (triggered by approve link via post-approved.yml)
 *     - Reads pendingDraft from agent.json
 *     - Posts to LinkedIn
 *     - Clears pendingDraft
 */
require("dotenv").config();
const { generatePost }        = require("./generator");
const { postToLinkedIn }      = require("./linkedin");
const { getNextTheme, markThemeUsed, initDB, loadDB, saveDB } = require("./db");
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

// ── MODE: post (called after user approves on WhatsApp) ───────────────────────
async function postApproved() {
  await initDB();
  const db = await loadDB();

  if (!db.pendingDraft) {
    logger.info("⚠️  No pending draft found. Nothing to post.");
    return;
  }

  const { themeId, postText } = db.pendingDraft;
  logger.info(`📤 Posting approved draft (theme: ${themeId})`);
  logger.info(`✍️  Post:\n${"─".repeat(50)}\n${postText}\n${"─".repeat(50)}`);

  const result = await postToLinkedIn(postText);
  logger.info(`✅ Published! LinkedIn URN: ${result.id}`);

  await markThemeUsed(themeId, postText, result.id);

  // Clear the pending draft
  db.pendingDraft = null;
  await saveDB(db);
  logger.info("💾 Draft cleared, history saved.");
}

// ── MODE: draft (cron, randomised) ───────────────────────────────────────────
async function draftAndNotify() {
  await initDB();
  const db    = await loadDB();
  const today = getISTDateString();
  const istHour = getISTHour();

  // Already sent for approval today?
  if (db.pendingDraft && db.pendingDraft.date === today) {
    logger.info(`📨 Approval already sent today (${today}). Waiting for user action.`);
    return;
  }

  // Already posted today?
  if (db.lastPosted === today) {
    logger.info(`✅ Already posted today (${today}). Skipping.`);
    return;
  }

  // Decide for today (once per day)
  if (!db.todayDecision || db.todayDecision.date !== today) {
    const shouldPost  = Math.random() < 5 / 7;
    const targetHour  = randInt(8, 13);
    db.todayDecision  = { date: today, shouldPost, targetHour };
    await saveDB(db);
    logger.info(`🎲 Today: shouldPost=${shouldPost}, targetHour=${targetHour}:xx IST`);
  }

  const { shouldPost, targetHour } = db.todayDecision;

  if (!shouldPost) {
    logger.info(`🚫 Randomly skipping today. No post.`);
    return;
  }

  if (istHour < targetHour) {
    logger.info(`⏳ Target ${targetHour}:xx IST, now ${istHour}:xx IST. Will generate later.`);
    return;
  }

  // Time to generate draft
  const VALID_THEMES = ["engineering-leadership","ai-productivity","streaming-tech","personal-growth"];
  const override = process.env.THEME_OVERRIDE;
  let theme;
  if (override && override !== "auto" && VALID_THEMES.includes(override)) {
    theme = { id: override, name: override };
  } else {
    theme = await getNextTheme();
  }

  logger.info(`📌 Generating draft for theme: ${theme.name || theme.id}`);
  const postText = await generatePost(theme);
  logger.info(`✍️  Draft:\n${"─".repeat(50)}\n${postText}\n${"─".repeat(50)}`);

  // Save as pending draft
  const draftId = `${today}-${Date.now()}`;
  db.pendingDraft = { draftId, themeId: theme.id, postText, date: today };
  await saveDB(db);
  logger.info(`💾 Draft saved (id: ${draftId})`);

  // Send WhatsApp approval request
  await sendApprovalRequest(postText, draftId);
  logger.info(`📱 WhatsApp sent — waiting for approval.`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {
  const mode = process.env.MODE || "draft";
  logger.info(`🚀 Running in MODE=${mode}`);

  if (mode === "post") {
    await postApproved();
  } else {
    await draftAndNotify();
  }
}

main().catch((err) => {
  console.error("❌ Agent failed:", err.message);
  process.exit(1);
});
