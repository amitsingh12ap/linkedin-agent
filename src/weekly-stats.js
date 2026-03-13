/**
 * weekly-stats.js — Runs every Sunday, WhatsApps a weekly summary.
 * Shows: posts this week, themes used, most active hour, streak.
 */
require("dotenv").config();
const axios = require("axios");
const fs    = require("fs");
const path  = require("path");

const DB_PATH          = process.env.DB_PATH || path.join(__dirname, "../data/agent.json");
const TWILIO_SID       = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN     = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM      = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
const WHATSAPP_TO      = process.env.WHATSAPP_TO;

function loadStore() {
  if (!fs.existsSync(DB_PATH)) return { history: [] };
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function getISTDateString(date = new Date()) {
  const istMs = date.getTime() + date.getTimezoneOffset() * 60000 + 5.5 * 3600000;
  const d = new Date(istMs);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

async function sendWhatsApp(body) {
  const params = new URLSearchParams({ From: TWILIO_FROM, To: WHATSAPP_TO, Body: body });
  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    params.toString(),
    { auth: { username: TWILIO_SID, password: TWILIO_TOKEN },
      headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
}

async function main() {
  const store = loadStore();
  const history = store.history || [];

  // Posts in the last 7 days
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600000);
  const thisWeek = history.filter(h => new Date(h.posted_at) >= sevenDaysAgo);

  // Current posting streak (consecutive days)
  const postedDays = new Set(history.map(h => h.posted_at?.slice(0, 10)));
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    if (postedDays.has(getISTDateString(d))) streak++;
    else break;
  }

  // Most used theme this week
  const themeCounts = {};
  thisWeek.forEach(h => { themeCounts[h.theme_id] = (themeCounts[h.theme_id] || 0) + 1; });
  const topTheme = Object.entries(themeCounts).sort((a,b) => b[1]-a[1])[0];

  // Best performing hour (most common approval hour)
  const hours = history.filter(h => h.approved_hour != null).map(h => h.approved_hour);
  const hourFreq = {};
  hours.forEach(h => { hourFreq[h] = (hourFreq[h] || 0) + 1; });
  const bestHour = Object.entries(hourFreq).sort((a,b) => b[1]-a[1])[0];

  // Total posts ever
  const totalPosts = history.length;

  const lines = [
    `📊 *Weekly LinkedIn Agent Report*`,
    ``,
    `📅 Posts this week: *${thisWeek.length}*`,
    `🔥 Current streak: *${streak} day${streak !== 1 ? "s" : ""}*`,
    `📝 Total posts ever: *${totalPosts}*`,
    topTheme ? `🎯 Top theme this week: *${topTheme[0].replace(/-/g, " ")}* (${topTheme[1]}x)` : null,
    bestHour ? `⏰ Your best approval hour: *${bestHour[0]}:00 IST* — agent will bias towards it` : null,
    ``,
    thisWeek.length >= 4
      ? `✅ Great week! Consistency is building your profile.`
      : thisWeek.length >= 2
      ? `📈 Decent week. A few more posts would compound nicely.`
      : `💡 Quiet week. Tap approve more often — each post compounds.`,
  ].filter(Boolean).join("\n");

  await sendWhatsApp(lines);
  console.log("✅ Weekly stats sent!");
}

main().catch(err => { console.error("❌ Weekly stats failed:", err.message); process.exit(1); });
