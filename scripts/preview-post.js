/**
 * Preview a generated post without publishing to LinkedIn.
 * Usage:
 *   node scripts/preview-post.js
 *   node scripts/preview-post.js --theme=ai-productivity
 */
require("dotenv").config();
const { generatePost } = require("../src/generator");
const { getNextTheme, initDB } = require("../src/db");

const VALID_THEMES = ["engineering-leadership", "ai-productivity", "streaming-tech", "personal-growth"];

(async () => {
  await initDB();

  const themeArg = process.argv.find((a) => a.startsWith("--theme="))?.split("=")[1];
  let theme;

  if (themeArg) {
    if (!VALID_THEMES.includes(themeArg)) {
      console.error(`❌ Unknown theme: "${themeArg}"`);
      console.error(`   Valid: ${VALID_THEMES.join(", ")}`);
      process.exit(1);
    }
    theme = { id: themeArg, name: themeArg };
  } else {
    theme = await getNextTheme();
  }

  console.log(`\n🎯 Theme: ${theme.name || theme.id}`);
  console.log("⏳ Generating post...\n");

  try {
    const post = await generatePost(theme);
    console.log("━".repeat(60));
    console.log(post);
    console.log("━".repeat(60));
    console.log(`\n📊 Length: ${post.length} characters`);
    console.log("✅ Preview only — not published to LinkedIn\n");
  } catch (err) {
    console.error("❌ Generation failed:", err.message);
  }
})();
