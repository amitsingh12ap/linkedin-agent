/**
 * Single-run entry point for GitHub Actions.
 * Generates one post, publishes it, and saves history.
 * No cron scheduler — GitHub Actions handles the timing.
 */
require("dotenv").config();
const { generatePost } = require("./generator");
const { postToLinkedIn } = require("./linkedin");
const { getNextTheme, markThemeUsed, initDB } = require("./db");
const logger = require("./logger");

async function main() {
  await initDB();

  // Allow theme override via env (for manual workflow_dispatch)
  const override = process.env.THEME_OVERRIDE;
  const VALID_THEMES = [
    "engineering-leadership",
    "ai-productivity",
    "streaming-tech",
    "personal-growth",
  ];

  let theme;
  if (override && override !== "auto" && VALID_THEMES.includes(override)) {
    theme = { id: override, name: override };
    logger.info(`🎛️  Theme override: ${override}`);
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
