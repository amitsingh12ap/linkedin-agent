const cron = require("node-cron");
const { generatePost } = require("./generator");
const { postToLinkedIn } = require("./linkedin");
const { getNextTheme, markThemeUsed, initDB } = require("./db");
const logger = require("./logger");

async function runDailyPost() {
  logger.info("🚀 LinkedIn Agent: Starting daily post run");
  try {
    const theme = await getNextTheme();
    logger.info(`📌 Theme selected: ${theme.name}`);

    const post = await generatePost(theme);
    logger.info(`✍️  Post generated (${post.length} chars)`);
    logger.info(`📝 Post preview:\n---\n${post}\n---`);

    const result = await postToLinkedIn(post);
    logger.info(`✅ Posted to LinkedIn! URN: ${result.id}`);

    await markThemeUsed(theme.id, post, result.id);
    logger.info("💾 Post saved to history");
  } catch (err) {
    logger.error("❌ Daily post failed:", err.message);
    logger.error(err.stack);
    process.exit(1);
  }
}

async function main() {
  await initDB();

  if (process.env.IMMEDIATE_RUN === "true") {
    logger.info("🔥 IMMEDIATE_RUN mode — posting now");
    await runDailyPost();
    return;
  }

  const schedule = process.env.CRON_SCHEDULE || "30 3 * * *";
  logger.info(`📅 Scheduler started. Cron: "${schedule}" (UTC)`);
  logger.info("   → Posts at 9:00 AM IST daily");

  cron.schedule(schedule, runDailyPost, { timezone: "UTC" });
  logger.info("💤 Agent is running and waiting for next scheduled time...");
}

main();
