/**
 * View recent post history.
 * Usage:
 *   node scripts/history.js
 *   node scripts/history.js --limit=20
 */
require("dotenv").config();
const { initDB, getRecentPosts } = require("../src/db");

(async () => {
  await initDB();
  const limitArg = process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = parseInt(limitArg || "10", 10);
  const posts = getRecentPosts(limit);

  if (posts.length === 0) {
    console.log("\n📭 No posts yet. Run the agent to get started!\n");
    return;
  }

  console.log(`\n📋 Last ${posts.length} posts:\n`);
  posts.forEach((p, i) => {
    console.log(`━━━ ${i + 1}. ${p.theme_name} — ${p.posted_at} ━━━`);
    console.log(p.post_text);
    if (p.linkedin_id) console.log(`\n🔗 LinkedIn URN: ${p.linkedin_id}`);
    console.log();
  });
})();
