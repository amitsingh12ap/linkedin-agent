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

function getISTDateString() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istMs = utcMs + 5.5 * 3600000;
  const ist = new Date(istMs);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
}

function loadStore() {
  if (!fs.existsSync(DB_PATH)) {
    return { lastIndex: -1, lastPosted: null, todayDecision: null, recentPostTypes: [], history: [] };
  }
  const store = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  if (!store.recentPostTypes) store.recentPostTypes = [];
  return store;
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2), "utf8");
}

function loadDB()        { return Promise.resolve(loadStore()); }
function saveDB(store)   { saveStore(store); return Promise.resolve(); }

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

// Returns last N post types so generator can avoid repeating them
function getRecentPostTypes(n = 3) {
  const store = loadStore();
  return (store.recentPostTypes || []).slice(-n);
}

function markThemeUsed(themeId, postText, linkedinId = null, postType = null) {
  const store = loadStore();
  const theme = THEMES.find((t) => t.id === themeId);
  store.lastIndex = THEMES.indexOf(theme);
  store.lastPosted = getISTDateString();

  // Track post type history for anti-repeat logic (keep last 5)
  if (postType) {
    store.recentPostTypes = [...(store.recentPostTypes || []), postType].slice(-5);
  }

  store.history.unshift({
    id: Date.now(),
    theme_id: themeId,
    theme_name: theme.name,
    post_type: postType,
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

module.exports = { initDB, getNextTheme, markThemeUsed, getRecentPosts, getRecentPostTypes, loadDB, saveDB };
