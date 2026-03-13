/**
 * news.js — Fetches top Indian tech & engineering news headlines.
 * Uses free RSS feeds — no API key required.
 * Returns 3 relevant headlines as a short string to inject into the prompt.
 */
const axios = require("axios");

const RSS_FEEDS = [
  "https://economictimes.indiatimes.com/tech/rss.cms",
  "https://techcrunch.com/feed/",
  "https://feeds.feedburner.com/ndtvtech",
];

// Extracts <title> tags from raw RSS XML
function extractTitles(xml, max = 5) {
  const matches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return matches.slice(0, max).map(item => {
    const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                  item.match(/<title>(.*?)<\/title>/);
    return title ? title[1].trim() : null;
  }).filter(Boolean);
}

async function fetchNewsFeed(url) {
  try {
    const res = await axios.get(url, {
      timeout: 5000,
      headers: { "User-Agent": "linkedin-agent/1.0" },
    });
    return extractTitles(res.data);
  } catch {
    return [];
  }
}

/**
 * Returns a short string with 2–3 current headlines,
 * or empty string if all feeds fail (agent still works without news).
 */
async function getTodaysHeadlines() {
  try {
    const results = await Promise.all(RSS_FEEDS.map(fetchNewsFeed));
    const all = results.flat().slice(0, 6);
    if (all.length === 0) return "";

    // Pick 3 at random to avoid always using the same source
    const picked = all.sort(() => Math.random() - 0.5).slice(0, 3);
    return `OPTIONAL CONTEXT — today's tech headlines (use only if genuinely relevant, don't force it):\n${picked.map((h, i) => `${i+1}. ${h}`).join("\n")}`;
  } catch {
    return ""; // silently fail — news is optional
  }
}

module.exports = { getTodaysHeadlines };
