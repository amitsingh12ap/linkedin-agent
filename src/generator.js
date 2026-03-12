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
- Shares real experiences from managing large engineering teams
- Occasionally references India's tech/startup ecosystem
- Ends with a short, thoughtful takeaway or call-to-reflection (not a generic CTA)
- Uses 2-3 relevant emojis max, placed naturally — not as bullet decorators
- No hashtag spam — 2-3 targeted hashtags at the very end

Do NOT write:
- "In today's fast-paced world..."
- "As a leader, I've learned..."
- Generic advice that could apply to anyone
- Lists or bullet points
- More than 150 words

DO write like a real person sharing a real moment or insight from their week.
`;

const THEME_PROMPTS = {
  "engineering-leadership": `
    Write a LinkedIn post about engineering leadership & team building. 
    Pick ONE specific scenario such as: giving hard feedback, removing blockers for your team, 
    handling underperformance, building psychological safety, running better 1:1s, 
    defending your team's decisions upward, or what great engineering culture actually looks like.
    Make it feel like something that actually happened this week.
  `,
  "ai-productivity": `
    Write a LinkedIn post about how AI tools are changing the way engineering teams work.
    Pick ONE angle such as: using Claude/ChatGPT for code review, AI-accelerated debugging, 
    how AI changes what skills matter, the fear vs opportunity debate, or a surprising way 
    your team used AI recently that actually worked.
    Be specific and grounded — not hype.
  `,
  "streaming-tech": `
    Write a LinkedIn post sharing a technical learning from building large-scale video streaming systems.
    Pick ONE topic such as: video player performance at scale, SSAI ad stitching challenges, 
    HLS vs DASH tradeoffs, ABR algorithm decisions, live streaming latency, 
    or handling 100M+ concurrent viewers.
    Make it accessible to a non-streaming engineer — translate the tech into a broader insight.
  `,
  "personal-growth": `
    Write a LinkedIn post about personal growth and career development for senior engineers and EMs.
    Pick ONE theme such as: the shift from IC to manager, learning to say no, 
    managing up effectively, dealing with imposter syndrome at senior levels, 
    how to grow when you're already experienced, or lessons from a career mistake.
    Make it personal and real — not textbook advice.
  `,
};

async function generatePost(theme) {
  const themePrompt = THEME_PROMPTS[theme.id];
  if (!themePrompt) throw new Error(`Unknown theme: ${theme.id}`);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", month: "long", day: "numeric",
  });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",  // Haiku: same quality for constrained creative writing, ~20x cheaper than Opus
    max_tokens: 300,                      // Post is <150 words (~200 tokens) — 300 is plenty
    system: VOICE_PROFILE,
    messages: [{
      role: "user",
      content: `Today is ${today}. ${themePrompt}

Write exactly ONE LinkedIn post. Output only the post text — no preamble, 
no "Here's a post:", no explanations. Just the raw post ready to copy-paste.`,
    }],
  });

  const post = message.content[0].text.trim();
  if (post.length > 1500) throw new Error(`Generated post too long: ${post.length} chars`);
  return post;
}

module.exports = { generatePost };
