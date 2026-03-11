/**
 * Get your LinkedIn Person URN. Run once during setup.
 * Usage:
 *   LINKEDIN_ACCESS_TOKEN=your_token node scripts/get-person-urn.js
 */
require("dotenv").config();
const { getMyPersonUrn } = require("../src/linkedin");

(async () => {
  try {
    const urn = await getMyPersonUrn();
    console.log("\n✅ Your LinkedIn Person URN:");
    console.log(`   ${urn}`);
    console.log("\nAdd this to your .env file:");
    console.log(`   LINKEDIN_PERSON_URN=${urn}\n`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error("Make sure LINKEDIN_ACCESS_TOKEN is set correctly.");
  }
})();
