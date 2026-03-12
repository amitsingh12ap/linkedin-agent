const Anthropic = require("@anthropic-ai/sdk");
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
- Team/conversation moments ("I told my engineer...", "had a tough discussion...") should be RARE — maximum 1 in 4 posts
- NEVER write two similar-format posts in a row
- Do NOT always start with "I". Try starting with a fact, a number, a provocation, or a situation.

Do NOT write:
- "In today's fast-paced world..."
- "As a leader, I've learned..."
- Generic advice that could apply to anyone
- Lists or bullet points
- More than 150 words
- Two posts in a row about team conversations or feedback moments
`;

// Each theme has multiple post TYPES. The system rotates through types
// to ensure variety — no two consecutive posts feel the same.
const THEME_ANGLES = {
  "engineering-leadership": [
    {
      type: "opinion",
      prompt: `Write a strong opinion post about engineering leadership. Examples: why 1:1s are broken at most companies, why velocity metrics lie, why senior engineers shouldn't become managers by default, why psychological safety is overused as a term, why code reviews take too long. Pick ONE controversial but defensible take. State it plainly. Don't hedge.`,
    },
    {
      type: "observation",
      prompt: `Write an observation-style post about something you've noticed about how engineering teams work or fail. Not a personal story — more like "here's a pattern I keep seeing across the industry." Examples: why the best engineers are invisible, how on-call culture reveals engineering culture, why the best PRs get the least comments. Ground it in something specific.`,
    },
    {
      type: "team_moment",
      prompt: `Write about ONE specific leadership moment — but make it brief and the lesson more prominent than the story. Avoid framing it as a daily occurrence. It should feel like a rare, memorable moment, not a routine conversation. Keep the "I told my engineer..." element small.`,
    },
    {
      type: "industry_take",
      prompt: `Write a take on something happening in the engineering industry right now. Examples: how AI is changing what senior engineers actually do, why platform engineering is having a moment, the return-to-office debate for engineers, why India is producing world-class engineering talent. Have an actual opinion, not just a summary.`,
    },
    {
      type: "career_reflection",
      prompt: `Write a career reflection post — something you wish you'd known earlier, a belief you've changed about engineering leadership, or an uncomfortable truth about moving into management. Should feel personal but universally relatable to senior engineers.`,
    },
  ],

  "ai-productivity": [
    {
      type: "opinion",
      prompt: `Write a strong opinion about AI tools in engineering. Examples: why most teams are using AI wrong, why AI won't replace engineers but bad engineers will blame AI, why prompt engineering is overrated, why AI code review is better than human review for certain things. Be direct.`,
    },
    {
      type: "technical_insight",
      prompt: `Write about a specific, concrete way AI changed how you or your team approaches a technical problem. Not general hype — a real example like: using AI to debug a latency issue, AI-assisted code migration, AI for writing test cases. Focus on what actually worked and why.`,
    },
    {
      type: "observation",
      prompt: `Write an observation about how AI is reshaping engineering skills and roles. Examples: what skills matter more now, what's becoming obsolete, why curiosity beats expertise in an AI world, how junior engineers are actually benefiting more than seniors. Ground it in something you've seen.`,
    },
    {
      type: "industry_take",
      prompt: `Write a take on where AI in software development is actually headed vs. the hype. Be honest about both the promise and the limits. Examples: why LLM-generated code still needs real engineers, why AI agents aren't replacing DevOps yet, what's genuinely changing in the next 2 years.`,
    },
    {
      type: "experiment",
      prompt: `Write about an experiment or test you ran with AI tooling — something you tried, what the result was, and what surprised you. Could be positive or a failure. Make the learning the point, not the tool itself.`,
    },
  ],

  "streaming-tech": [
    {
      type: "technical_insight",
      prompt: `Write a post translating one hard streaming/video engineering problem into a broader engineering insight. Examples: what ABR algorithms teach you about decision-making under uncertainty, what SSAI taught you about distributed systems, what live streaming latency taught you about tradeoffs. Make it interesting to someone who has never worked in streaming.`,
    },
    {
      type: "opinion",
      prompt: `Write a strong opinion about video streaming technology or the streaming industry. Examples: why most streaming apps have bad players and nobody talks about it, why HLS still wins despite DASH being "better", why 4K is a marketing story more than an engineering one, why CDN choice matters more than codec choice for most teams.`,
    },
    {
      type: "scale_story",
      prompt: `Write about the engineering reality of operating at massive scale — 100M+ concurrent viewers, billions of video starts. Not a brag — a genuine reflection on what changes when scale gets extreme. What breaks, what you have to unlearn, what surprises you.`,
    },
    {
      type: "industry_take",
      prompt: `Write a take on something happening in the streaming/media industry — the economics, the tech decisions, the platform wars, the shift to sports streaming, the ad-tech evolution. Have an actual engineering or product perspective on it.`,
    },
    {
      type: "hidden_complexity",
      prompt: `Write about something in video/streaming engineering that looks simple from the outside but is deeply complex — something that would surprise most engineers. Examples: subtitle rendering, thumbnail generation at scale, audio normalization, seek performance. Make the complexity interesting, not intimidating.`,
    },
  ],

  "personal-growth": [
    {
      type: "career_reflection",
      prompt: `Write a career reflection that senior engineers and EMs actually relate to. Examples: the moment you stopped being an IC and started thinking like a leader, why you almost quit engineering, what you got wrong about career growth in your 20s, what you'd tell your 28-year-old self. Be honest, not inspirational.`,
    },
    {
      type: "opinion",
      prompt: `Write a contrarian take on career advice in tech. Examples: why "follow your passion" is bad career advice for engineers, why switching companies every 2 years is overrated, why visible work beats good work (or vice versa), why mentorship is misunderstood. Push back on conventional wisdom.`,
    },
    {
      type: "observation",
      prompt: `Write an observation about patterns you see in engineers who grow fast vs. those who plateau. Not a listicle — one sharp, specific observation. Examples: the difference in how they handle being wrong, how they approach problems outside their expertise, how they communicate upward.`,
    },
    {
      type: "uncomfortable_truth",
      prompt: `Write an uncomfortable truth about senior engineering or management roles that nobody says publicly. Examples: most technical decisions are actually political, impact is more about timing than skill, likability matters more than competence at senior levels. Be honest without being cynical.`,
    },
    {
      type: "india_specific",
      prompt: `Write something specific to the Indian tech ecosystem — the unique challenges and opportunities for engineering leaders here. Examples: building world-class products on India-scale infrastructure, navigating the startup-to-BigCo career path in India, why Indian engineers are underrated globally, the engineering culture difference between Bengaluru/Mumbai/Delhi. Make it relevant globally too.`,
    },
  ],
};

module.exports = { THEME_ANGLES, VOICE_PROFILE };

async function generatePost(theme, recentPostTypes = []) {
  const angles = THEME_ANGLES[theme.id];
  if (!angles) throw new Error(`Unknown theme: ${theme.id}`);

  // Pick an angle — avoid repeating last 2 post types
  const available = angles.filter(a => !recentPostTypes.slice(-2).includes(a.type));
  const pool = available.length > 0 ? available : angles;
  const angle = pool[Math.floor(Math.random() * pool.length)];

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", month: "long", day: "numeric",
  });

  // Tell the model what types were recently used so it avoids similar vibes
  const recentContext = recentPostTypes.length > 0
    ? `Recent post types to AVOID repeating: ${recentPostTypes.slice(-2).join(", ")}.`
    : "";

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: VOICE_PROFILE,
    messages: [{
      role: "user",
      content: `Today is ${today}. ${recentContext}

Post type: ${angle.type}
Instructions: ${angle.prompt}

Write exactly ONE LinkedIn post. Output only the post text — no preamble, 
no "Here's a post:", no explanations. Just the raw post ready to copy-paste.`,
    }],
  });

  const post = message.content[0].text.trim();
  if (post.length > 1500) throw new Error(`Generated post too long: ${post.length} chars`);
  return { post, postType: angle.type };
}

module.exports = { generatePost };
