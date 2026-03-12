/**
 * Single-run entry point for GitHub Actions.
 * Generates one post, publishes it, and saves history.
 * 
 * RANDOMISATION STRATEGY (so it doesn't look like a bot):
 *  - Runs every hour via cron, but decides internally whether to post.
 *  - Each day, randomly skips ~2 out of 7 days.
 *  - On posting days, picks a random target hour (8 AM–1 PM IST).
 *  - Only posts once the current hour matches the target.
 */
require("dotenv").config();
const { generatePost } = require("./generator");
const { postToLinkedIn } = require("./linkedin");
const { getNextTheme, markThemeUsed, initDB, loadDB, saveDB } = require("./db");
const logger = require("./logger");

// IST = UTC + 5:30. We work in IST hour (0-23).
function getISTHour() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istMs = utcMs + 5.5 * 3600000;
  return new Date(istMs).getHours();
}

function getISTDateString() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istMs = utcMs + 5.5 * 3600000;
  const ist = new Date(istMs);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
}

// Returns a random integer between min and max (inclusive).
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  await initDB();
  const db = await loadDB();
  const today = getISTDateString();
  const istHour = getISTHour();

  // ── Manual override via workflow_dispatch ──────────────────────────────────
  const override = process.env.THEME_OVERRIDE;
  const VALID_THEMES = ["engineering-leadership", "ai-productivity", "streaming-tech", "personal-growth"];
  const isManualRun = override && override !== "auto";

  if (isManualRun) {
    logger.info(`🎛️  Manual run triggered. Skipping randomisation checks.`);
    return await runPost(override && VALID_THEMES.includes(override) ? { id: override } : null, db);
  }

  // ── Already posted today? ──────────────────────────────────────────────────
  if (db.lastPosted === today) {
    logger.info(`✅ Already posted today (${today}). Skipping.`);
    return;
  }

  // ── Decide for today (once per day) ───────────────────────────────────────
  if (!db.todayDecision || db.todayDecision.date !== today) {
    // 5/7 chance to post on any given day
    const shouldPost = Math.random() < 5 / 7;
    // Random IST hour between 8 AM and 1 PM (inclusive)
    const targetHour = randInt(8, 13);
    db.todayDecision = { date: today, shouldPost, targetHour };
    await saveDB(db);
    logger.info(`🎲 Today's decision: shouldPost=${shouldPost}, targetHour=${targetHour}:xx IST`);
  }

  const { shouldPost, targetHour } = db.todayDecision;

  if (!shouldPost) {
    logger.info(`🚫 Randomly skipping today (${today}). No post.`);
    return;
  }

  if (istHour < targetHour) {
    logger.info(`⏳ Target hour is ${targetHour}:xx IST, current is ${istHour}:xx IST. Will post later.`);
    return;
  }

  // ── Time to post! ──────────────────────────────────────────────────────────
  logger.info(`🕐 IST ${istHour}:xx — posting now (target was ${targetHour}:xx)`);
  await runPost(null, db);
}

async function runPost(themeOverride, db) {
  let theme;
  if (themeOverride) {
    theme = themeOverride;
    logger.info(`🎛️  Theme override: ${themeOverride.id || themeOverride}`);
  } else {
    theme = await getNextTheme();
  }

  logger.info(`📌 Theme: ${theme.name || theme.id}`);

  const post = await generatePost(theme);
  logger.info(`✍️  Generated (${post.length} chars):\n${"─".repeat(50)}\n${post}\n${"─".repeat(50)}`);

  const result = await postToLinkedIn(post);
  logger.info(`✅ Published! LinkedIn URN: ${result.id}`);

  await markThemeUsed(theme.id, post, result.id);
  logger.info("💾 History saved to data/agent.json");
}

main().catch((err) => {
  console.error("❌ Agent failed:", err.message);
  process.exit(1);
});
