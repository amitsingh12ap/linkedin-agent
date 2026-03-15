/**
 * generator-multi.js
 * Like generator.js but voice profile is dynamically built per user,
 * not hardcoded. Reuses all the same THEME_ANGLES logic.
 */
require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const { getTodaysHeadlines } = require("./news");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const THEME_ANGLES = {
  "engineering-leadership": [
    { type: "opinion",           prompt: `Write a strong opinion about engineering leadership. One controversial but defensible take — why 1:1s are broken at most companies, why velocity metrics lie, why senior engineers shouldn't always become managers. State it plainly, don't hedge.` },
    { type: "observation",       prompt: `An observation about a pattern you keep seeing in how engineering teams work or fail. Not a personal story — more like "here's something I notice across the industry." Examples: why the best engineers are invisible, how on-call culture reveals team culture.` },
    { type: "team_moment",       prompt: `ONE specific leadership moment — brief 2-sentence story, lesson is the main point. Should feel like a rare memorable moment, not a routine conversation.` },
    { type: "industry_take",     prompt: `A take on something in the engineering industry. AI changing what senior engineers do, why India produces world-class talent, the RTO debate, why platform engineering is trending. Have an actual opinion.` },
    { type: "career_reflection", prompt: `A career reflection — something you wish you'd known earlier, a belief you changed about leadership, or an uncomfortable truth about moving into management.` },
  ],
  "ai-productivity": [
    { type: "opinion",           prompt: `A strong opinion about AI tools in engineering. Why most teams use AI wrong, why AI won't replace engineers, why prompt engineering is overrated. Be direct.` },
    { type: "technical_insight", prompt: `A specific, concrete way AI changed how you approach a technical problem. Not hype — a real use case. What actually worked and why.` },
    { type: "observation",       prompt: `An observation about how AI is reshaping engineering skills. What matters more now, what's becoming obsolete, why curiosity beats expertise.` },
    { type: "industry_take",     prompt: `Where AI in software development is actually headed vs the hype. Honest about promise AND limits.` },
    { type: "experiment",        prompt: `An experiment you ran with AI tooling. What you tried, the result, what surprised you. Make the learning the point.` },
  ],
  "streaming-tech": [
    { type: "technical_insight", prompt: `Translate one hard streaming/video engineering problem into a broader engineering insight. What ABR algorithms teach about decision-making, what SSAI taught about distributed systems.` },
    { type: "opinion",           prompt: `A strong opinion about video streaming technology. Why most streaming apps have bad players, why HLS still wins, why 4K is a marketing story. Clear stance.` },
    { type: "scale_story",       prompt: `The engineering reality of operating at massive scale. Not a brag — genuine reflection on what changes when scale gets extreme. What breaks, what you unlearn.` },
    { type: "industry_take",     prompt: `A take on something in the streaming/media industry — economics, platform wars, sports streaming shift, ad-tech evolution.` },
    { type: "hidden_complexity",  prompt: `Something in video/streaming that looks simple but is deeply complex — subtitle rendering, thumbnail generation at scale, seek performance. Make the complexity interesting.` },
  ],
  "personal-growth": [
    { type: "career_reflection",   prompt: `A career reflection senior engineers and EMs actually relate to. The moment you stopped being an IC and started thinking like a leader. Honest, not inspirational.` },
    { type: "opinion",             prompt: `A contrarian take on career advice in tech. Why "follow your passion" is bad, why switching companies every 2 years is overrated, why visible work beats good work (or vice versa).` },
    { type: "observation",         prompt: `One sharp observation about engineers who grow fast vs those who plateau. One specific thing — how they handle being wrong, how they communicate upward.` },
    { type: "uncomfortable_truth", prompt: `An uncomfortable truth about senior engineering or management nobody says publicly. Most technical decisions are political, impact is about timing. Honest without cynical.` },
    { type: "india_specific",      prompt: `Something specific to the Indian tech ecosystem. Building world-class products on India-scale infra, why Indian engineers are underrated globally, engineering culture in Indian cities.` },
  ],
};

/**
 * Build a voice profile system prompt for a user.
 */
function buildVoicePrompt(user) {
  return `You are writing LinkedIn posts on behalf of ${user.name}.

ABOUT THEM:
${user.role || "Senior engineering leader"}

THEIR WRITING STYLE:
${user.voiceProfile || "Short, punchy sentences. First-person, conversational, authentic. No fluff. Under 150 words."}

STRICT RULES:
- Write in FIRST PERSON always
- 150 words max
- No generic fluff or buzzwords
- End with 1 thoughtful question or reflection, not a generic CTA
- 2-3 emojis max, placed naturally
- 2-3 targeted hashtags at the very end ONLY
- Sound like a real person, not a corporate memo
- Vary sentence length — mix short punchy lines with longer ones
- Do NOT always start with "I". Try starting with a fact, a number, a provocation.

Do NOT write:
- "In today's fast-paced world..." / generic advice that applies to everyone
- Bullet points or lists / More than 150 words`;
}

/**
 * generatePostForUser
 * @param {object} user             - user object from users.json
 * @param {string} themeId          - theme id string
 * @param {string[]} recentPostTypes - last N post types to avoid repeating
 * @param {boolean} forceNewAngle   - force a different angle (regenerate mode)
 */
async function generatePostForUser(user, themeId, recentPostTypes = [], forceNewAngle = false) {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" });
  const newsContext = await getTodaysHeadlines();

  // ── Custom topic mode ─────────────────────────────────────────────────────
  if (user.pendingTopic) {
    console.log(`   💡 Using custom topic: "${user.pendingTopic}"`);
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: buildVoicePrompt(user),
      messages: [{
        role: "user",
        content: `Today is ${today}.\n\nWrite a LinkedIn post about: "${user.pendingTopic}"\n\nMake it specific, personal, and insightful. Draw from real experience. Output only the post text.`,
      }],
    });
    const post = message.content[0].text.trim();
    if (post.length > 1500) throw new Error(`Post too long: ${post.length} chars`);
    return { post, postType: "custom_topic" };
  }

  // ── Theme rotation mode ───────────────────────────────────────────────────
  if (!angles) throw new Error(`Unknown theme: ${themeId}`);

  const exclude = forceNewAngle ? recentPostTypes.slice(-3) : recentPostTypes.slice(-2);
  const available = angles.filter(a => !exclude.includes(a.type));
  const pool = available.length > 0 ? available : angles;
  const angle = pool[Math.floor(Math.random() * pool.length)];

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", month: "long", day: "numeric",
  });

  const newsContext = await getTodaysHeadlines();
  const recentContext = exclude.length > 0
    ? `Recent post types to AVOID repeating: ${exclude.join(", ")}.`
    : "";

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: buildVoicePrompt(user),
    messages: [{
      role: "user",
      content: [
        `Today is ${today}.`,
        recentContext,
        newsContext,
        ``,
        `Post type: ${angle.type}`,
        `Instructions: ${angle.prompt}`,
        ``,
        `Write exactly ONE LinkedIn post. Output only the post text — no preamble, no explanations. Just the raw post.`,
      ].filter(Boolean).join("\n"),
    }],
  });

  const post = message.content[0].text.trim();
  if (post.length > 1500) throw new Error(`Post too long: ${post.length} chars`);
  return { post, postType: angle.type };
}

module.exports = { generatePostForUser, THEME_ANGLES };
