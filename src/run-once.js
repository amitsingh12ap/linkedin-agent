/**
 * run-once.js — GitHub Actions entry point.
 *
 * MODE=draft   (default, cron) — generate post, send WhatsApp for approval
 * MODE=post    — post approved draft to LinkedIn
 * MODE=decline — clear declined draft, reset for tomorrow
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

  await markThemeUsed(themeId, postText, result.id, postType);
  db.pendingDraft = null;
  await saveDB(db);
  logger.info("💾 Draft cleared, history saved.");
}

// ── MODE: decline ─────────────────────────────────────────────────────────────
async function postDeclined() {
  await initDB();
  const db = await loadDB();
  if (!db.pendingDraft) { logger.info("⚠️  No pending draft to decline."); return; }

  logger.info(`❌ Declining draft (theme: ${db.pendingDraft.themeId}, type: ${db.pendingDraft.postType})`);
  db.pendingDraft  = null;
  db.todayDecision = null; // reset so tomorrow gets a fresh decision
  await saveDB(db);
  logger.info("🗑️  Draft cleared. Fresh post tomorrow.");
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
    const targetHour = randInt(8, 13);
    db.todayDecision = { date: today, shouldPost, targetHour };
    await saveDB(db);
    logger.info(`🎲 Today: shouldPost=${shouldPost}, targetHour=${targetHour}:xx IST`);
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
  logger.info(`💾 Draft saved (type: ${postType})`);

  await sendApprovalRequest(postText, draftId);
  logger.info(`📱 WhatsApp sent — waiting for approval.`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {
  const mode = process.env.MODE || "draft";
  logger.info(`🚀 Running in MODE=${mode}`);
  if (mode === "post")         await postApproved();
  else if (mode === "decline") await postDeclined();
  else                         await draftAndNotify();
}

main().catch((err) => {
  console.error("❌ Agent failed:", err.message);
  process.exit(1);
});
