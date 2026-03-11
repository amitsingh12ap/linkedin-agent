const fs = require("fs");
const path = require("path");
require("dotenv").config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../data/agent.json");

const THEMES = [
  { id: "engineering-leadership", name: "Engineering Leadership & Team Building" },
  { id: "ai-productivity",        name: "AI & Productivity in Engineering" },
  { id: "streaming-tech",         name: "Streaming & Media Tech Learnings" },
  { id: "personal-growth",        name: "Personal Growth & Career Advice" },
];

function loadStore() {
  if (!fs.existsSync(DB_PATH)) {
    return { lastIndex: -1, lastPosted: null, history: [] };
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2), "utf8");
}

function initDB() {
  const store = loadStore();
  saveStore(store);
  console.log("✅ Store initialized at:", DB_PATH);
  return Promise.resolve();
}

function getNextTheme() {
  const store = loadStore();
  const nextIndex = (store.lastIndex + 1) % THEMES.length;
  return Promise.resolve(THEMES[nextIndex]);
}

function markThemeUsed(themeId, postText, linkedinId = null) {
  const store = loadStore();
  const theme = THEMES.find((t) => t.id === themeId);
  store.lastIndex = THEMES.indexOf(theme);
  store.lastPosted = new Date().toISOString();
  store.history.unshift({
    id: Date.now(),
    theme_id: themeId,
    theme_name: theme.name,
    post_text: postText,
    posted_at: new Date().toISOString(),
    linkedin_id: linkedinId,
  });
  saveStore(store);
  return Promise.resolve();
}

function getRecentPosts(limit = 10) {
  const store = loadStore();
  return store.history.slice(0, limit);
}

module.exports = { initDB, getNextTheme, markThemeUsed, getRecentPosts };
