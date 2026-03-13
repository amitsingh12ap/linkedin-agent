const Anthropic = require("@anthropic-ai/sdk");
const { getTodaysHeadlines } = require("./news");
require("dotenv").config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VOICE_PROFILE = `
You are writing LinkedIn posts on behalf of Amit Singh, a Director of Engineering at JioStar 
(India's largest streaming platform). He leads a 22-person team across iOS, Android, and Web 
platforms, building video player infrastructure and SSAI (server-side ad insertion) systems.

His LinkedIn writing style:
- Short, punchy sentences. No fluff.
- First-person, conversational, authentic
- Never corporate-speak or buzzwords
- Posts are under 150 words
- Often starts with a bold hook line (not a question)
- Ends with a short, thoughtful takeaway or call-to-reflection (not a generic CTA)
- Uses 2-3 relevant emojis max, placed naturally
- No hashtag spam — 2-3 targeted hashtags at the very end

CRITICAL — variety of post formats:
- MOST posts should be: opinions, observations, technical insights, industry takes, career reflections
- Team/conversation moments should be RARE — maximum 1 in 4 posts
- NEVER write two similar-format posts in a row
- Do NOT always start with "I". Try starting with a fact, a number, a provocation, or a situation.

Do NOT write:
- "In today's fast-paced world..." / "As a leader, I've learned..."
- Generic advice that could apply to anyone
- Lists or bullet points / More than 150 words
`;

const THEME_ANGLES = {
  "engineering-leadership": [
    { type: "opinion",           prompt: `Write a strong opinion post about engineering leadership. Examples: why 1:1s are broken at most companies, why velocity metrics lie, why senior engineers shouldn't become managers by default, why psychological safety is overused as a term. Pick ONE controversial but defensible take. State it plainly. Don't hedge.` },
    { type: "observation",       prompt: `Write an observation-style post about a pattern you keep seeing in how engineering teams work or fail. NOT a personal story — more like "here's something I notice across the industry." Examples: why the best engineers are invisible, how on-call culture reveals engineering culture, why the best PRs get the least comments.` },
    { type: "team_moment",       prompt: `Write about ONE specific leadership moment — brief story, lesson is the main point. Should feel like a rare memorable moment, not a routine conversation. Max 2 sentences on the story, rest is insight.` },
    { type: "industry_take",     prompt: `Write a take on something happening in the engineering industry. Examples: how AI is changing what senior engineers do, why platform engineering is trending, the RTO debate, why India produces world-class engineering talent. Have an actual opinion.` },
    { type: "career_reflection", prompt: `Write a career reflection — something you wish you'd known earlier, a belief you changed about engineering leadership, or an uncomfortable truth about moving into management. Personal but universally relatable to senior engineers.` },
  ],
  "ai-productivity": [
    { type: "opinion",           prompt: `Write a strong opinion about AI tools in engineering. Examples: why most teams are using AI wrong, why AI won't replace engineers but bad engineers will blame AI, why prompt engineering is overrated. Be direct.` },
    { type: "technical_insight", prompt: `Write about a specific, concrete way AI changed how you approach a technical problem. Not hype — a real use case like AI-assisted debugging, code migration, writing test cases. What actually worked and why.` },
    { type: "observation",       prompt: `Write an observation about how AI is reshaping engineering skills. What skills matter more now, what's becoming obsolete, why curiosity beats expertise in an AI world, how junior engineers benefit more than seniors.` },
    { type: "industry_take",     prompt: `Write a take on where AI in software development is actually headed vs. the hype. Honest about promise AND limits. Why LLM-generated code still needs real engineers, what's genuinely changing in the next 2 years.` },
    { type: "experiment",        prompt: `Write about an experiment you ran with AI tooling. What you tried, what the result was, what surprised you. Could be a success or a failure. Make the learning the point, not the tool.` },
  ],
  "streaming-tech": [
    { type: "technical_insight", prompt: `Translate one hard streaming/video engineering problem into a broader engineering insight. What ABR algorithms teach about decision-making, what SSAI taught about distributed systems, what live streaming latency taught about tradeoffs. Make it interesting to a non-streaming engineer.` },
    { type: "opinion",           prompt: `Write a strong opinion about video streaming technology or the streaming industry. Why most streaming apps have bad players, why HLS still wins, why 4K is a marketing story, why CDN choice matters more than codec. Have a clear stance.` },
    { type: "scale_story",       prompt: `Write about the engineering reality of operating at massive scale — 100M+ concurrent viewers. Not a brag — genuine reflection on what changes when scale gets extreme. What breaks, what you unlearn, what surprises you.` },
    { type: "industry_take",     prompt: `Write a take on something happening in the streaming/media industry — economics, tech decisions, platform wars, shift to sports streaming, ad-tech evolution. Have an engineering or product perspective.` },
    { type: "hidden_complexity",  prompt: `Write about something in video/streaming engineering that looks simple but is deeply complex — subtitle rendering, thumbnail generation at scale, audio normalization, seek performance. Make the complexity interesting, not intimidating.` },
  ],
  "personal-growth": [
    { type: "career_reflection",   prompt: `Write a career reflection senior engineers and EMs actually relate to. The moment you stopped being an IC and started thinking like a leader, why you almost quit, what you got wrong about career growth in your 20s. Honest, not inspirational.` },
    { type: "opinion",             prompt: `Write a contrarian take on career advice in tech. Why "follow your passion" is bad advice, why switching companies every 2 years is overrated, why visible work beats good work (or vice versa), why mentorship is misunderstood.` },
    { type: "observation",         prompt: `Write one sharp observation about patterns in engineers who grow fast vs. those who plateau. One specific thing — how they handle being wrong, how they approach problems outside their expertise, how they communicate upward.` },
    { type: "uncomfortable_truth", prompt: `Write an uncomfortable truth about senior engineering or management roles nobody says publicly. Most technical decisions are political, impact is about timing not skill, likability matters at senior levels. Honest without being cynical.` },
    { type: "india_specific",      prompt: `Write something specific to the Indian tech ecosystem. Building world-class products on India-scale infra, navigating startup-to-BigCo career in India, why Indian engineers are underrated globally, engineering culture differences across Indian cities. Relevant globally too.` },
  ],
};

/**
 * generatePost — picks a varied angle, fetches today's news as optional context,
 * and generates a LinkedIn post in Amit's voice.
 *
 * @param {object} theme           - { id, name }
 * @param {string[]} recentPostTypes - last N post types to avoid repeating
 * @param {boolean} forceNewAngle  - if true, forces a different angle than last time (regenerate mode)
 */
async function generatePost(theme, recentPostTypes = [], forceNewAngle = false) {
  const angles = THEME_ANGLES[theme.id];
  if (!angles) throw new Error(`Unknown theme: ${theme.id}`);

  // Avoid repeating recent types; if forceNewAngle, avoid the most recent one too
  const exclude = forceNewAngle ? recentPostTypes.slice(-3) : recentPostTypes.slice(-2);
  const available = angles.filter(a => !exclude.includes(a.type));
  const pool = available.length > 0 ? available : angles;
  const angle = pool[Math.floor(Math.random() * pool.length)];

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", month: "long", day: "numeric",
  });

  // Fetch today's headlines — silently skipped if feeds fail
  const newsContext = await getTodaysHeadlines();
  const recentContext = recentPostTypes.length > 0
    ? `Recent post types to AVOID repeating: ${exclude.join(", ")}.`
    : "";

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: VOICE_PROFILE,
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
        `Write exactly ONE LinkedIn post. Output only the post text — no preamble, no "Here's a post:", no explanations. Just the raw post ready to copy-paste.`,
      ].filter(Boolean).join("\n"),
    }],
  });

  const post = message.content[0].text.trim();
  if (post.length > 1500) throw new Error(`Post too long: ${post.length} chars`);
  return { post, postType: angle.type };
}

module.exports = { generatePost };
