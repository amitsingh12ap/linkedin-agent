/**
 * run-multi.js — Multi-user GitHub Actions entry point.
 * Iterates all active users in data/users.json,
 * generates a post for each, publishes to LinkedIn,
 * then saves updated state back to users.json.
 *
 * Usage:
 *   node src/run-multi.js
 *   DRY_RUN=true node src/run-multi.js
 *   TARGET_USER=amit node src/run-multi.js
 */
require("dotenv").config();
const fs   = require("fs");
const path = require("path");
const { generatePostForUser } = require("./generator-multi");
const { postToLinkedInAs }    = require("./linkedin-multi");
const logger                  = require("./logger");

const USERS_PATH = path.join(__dirname, "../data/users.json");

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadUsers() {
  const raw = fs.readFileSync(USERS_PATH, "utf8");
  return JSON.parse(raw);
}

function saveUsers(data) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2), "utf8");
}

function getNextTheme(user) {
  const themes = user.themes || ["engineering-leadership","ai-productivity","streaming-tech","personal-growth"];
  const idx = user.currentThemeIndex || 0;
  return {
    themeId:   themes[idx % themes.length],
    nextIndex: (idx + 1) % themes.length,
  };
}

function getRecentPostTypes(user, n = 3) {
  return (user.postHistory || []).slice(0, n).map(h => h.postType).filter(Boolean);
}

function checkTokenExpiry(user) {
  if (!user.tokenExpiry) return { ok: true };
  const expiry   = new Date(user.tokenExpiry);
  const daysLeft = Math.floor((expiry - new Date()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0)  return { ok: false, reason: "token_expired", daysLeft };
  if (daysLeft < 7)  return { ok: true,  warn: `Token expires in ${daysLeft} days — renew soon!` };
  return { ok: true };
}


// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const isDryRun    = process.env.DRY_RUN === "true";
  const targetUser  = process.env.TARGET_USER || null;
  const themeOverride = process.env.THEME_OVERRIDE || null;

  logger.info(`🤖 LinkedIn Agent — Multi-User Runner`);
  logger.info(`   Mode: ${isDryRun ? "DRY RUN (no publishing)" : "LIVE"}`);
  logger.info(`   Time: ${new Date().toISOString()}`);

  const data  = loadUsers();
  let users   = data.users.filter(u => u.active);

  if (targetUser) {
    users = users.filter(u => u.id === targetUser);
    if (users.length === 0) {
      logger.error(`❌ No active user found with id: ${targetUser}`);
      process.exit(1);
    }
  }

  logger.info(`📋 Processing ${users.length} active user(s)...\n`);

  const results = [];

  for (const user of users) {
    logger.info(`─────────────────────────────────────`);
    logger.info(`👤 ${user.name} (${user.id})`);

    try {
      // Token expiry check
      const expiry = checkTokenExpiry(user);
      if (!expiry.ok) {
        logger.info(`   ⚠️  ${expiry.reason}. Skipping.`);
        results.push({ user: user.id, status: "skipped", reason: expiry.reason });
        continue;
      }
      if (expiry.warn) logger.info(`   ⚠️  ${expiry.warn}`);

      // Resolve theme
      const { themeId, nextIndex } = getNextTheme(user);
      const resolvedTheme = themeOverride || themeId;
      logger.info(`   🎯 Theme: ${resolvedTheme}`);

      // Generate post
      logger.info(`   ✍️  Generating post...`);
      const recentPostTypes = getRecentPostTypes(user, 3);
      const { post, postType } = await generatePostForUser(user, resolvedTheme, recentPostTypes);

      logger.info(`\n   📝 Post preview:\n`);
      post.split("\n").forEach(l => logger.info(`      ${l}`));
      logger.info(``);

      // Publish
      if (!isDryRun) {
        logger.info(`   📤 Publishing to LinkedIn...`);
        const result = await postToLinkedInAs(user.accessToken, user.personUrn, post);
        logger.info(`   ✅ Published! LinkedIn ID: ${result.id}`);

        // Update user state in-memory
        const userInData = data.users.find(u => u.id === user.id);
        userInData.currentThemeIndex = nextIndex;
        if (!userInData.postHistory) userInData.postHistory = [];
        userInData.postHistory.unshift({
          date:     new Date().toISOString().split("T")[0],
          theme:    resolvedTheme,
          postType,
          postId:   result.id,
          preview:  post.substring(0, 120) + "...",
        });
        // Keep last 30 entries only
        userInData.postHistory = userInData.postHistory.slice(0, 30);
        results.push({ user: user.id, status: "success", postId: result.id });
      } else {
        logger.info(`   ⏭️  DRY RUN — skipping publish`);
        results.push({ user: user.id, status: "dry_run" });
      }

    } catch (err) {
      logger.error(`   ❌ Error for ${user.name}: ${err.message}`);
      results.push({ user: user.id, status: "error", error: err.message });
    }

    // Small delay between users to avoid rate limits
    if (users.indexOf(user) < users.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Persist updated state
  if (!isDryRun) {
    saveUsers(data);
    logger.info(`\n💾 State saved to data/users.json`);
  }

  // Summary
  logger.info(`\n─────────────────────────────────────`);
  logger.info(`📊 Summary:`);
  logger.info(`   ✅ Success: ${results.filter(r => r.status === "success").length}`);
  logger.info(`   ⏭️  Skipped: ${results.filter(r => r.status === "skipped").length}`);
  logger.info(`   ❌ Errors:  ${results.filter(r => r.status === "error").length}`);

  if (results.some(r => r.status === "error")) {
    process.exit(1);
  }

  logger.info("\n✨ Done!\n");
}

main().catch(err => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
