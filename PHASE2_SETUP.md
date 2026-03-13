# Phase 2 Setup — 15-minute deploy guide

## Step 1: Deploy to Railway (free, always-on)

1. Go to https://railway.app → sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select `amitsingh12ap/linkedin-agent`
4. Railway auto-detects `railway.json` and starts the server

5. Add these environment variables in Railway dashboard:
   ```
   ANTHROPIC_API_KEY       = (your key)
   LINKEDIN_ACCESS_TOKEN   = (your LinkedIn token)
   LINKEDIN_PERSON_URN     = urn:li:person:XXXXXXXX
   TWILIO_ACCOUNT_SID      = (your Twilio SID)
   TWILIO_AUTH_TOKEN       = (your Twilio token)
   TWILIO_WHATSAPP_FROM    = whatsapp:+14155238886
   WHATSAPP_TO             = whatsapp:+91XXXXXXXXXX
   GITHUB_REPO             = amitsingh12ap/linkedin-agent
   GITHUB_PAT              = (your GH_PAT secret value)
   DB_PATH                 = /app/data/agent.json
   PORT                    = 3001
   ```

6. Copy your Railway public URL — looks like:
   `https://linkedin-agent-production.up.railway.app`

---

## Step 2: Point Twilio to your webhook

1. Go to https://console.twilio.com → Messaging → WhatsApp Sandbox
2. Set **"When a message comes in"** to:
   `https://YOUR-RAILWAY-URL/webhook/whatsapp`
   Method: HTTP POST
3. Save.

---

## Step 3: Add WEBHOOK_SERVER_URL to GitHub Secrets

In GitHub repo → Settings → Secrets:
```
WEBHOOK_SERVER_URL = https://YOUR-RAILWAY-URL
```

This lets the comment-check cron ping your server.

---

## What works after this

| You do                         | What happens                                      |
|-------------------------------|---------------------------------------------------|
| Send "history" on WhatsApp    | Get your last 5 posts instantly                   |
| Send "stats" on WhatsApp      | Get streak, total posts, best timing hour         |
| Send a voice note             | Claude transcribes + rewrites → approval flow     |
| Someone comments on your post | You get draft reply via WhatsApp within 2 hours   |
| Send "reply 1"                | That draft reply is posted to LinkedIn            |

---

## Data persistence note

Railway's filesystem resets on redeploy. For production, point `DB_PATH` to a mounted volume:
- Railway: Add a **Volume** in your service → mount at `/data` → set `DB_PATH=/data/agent.json`
- This keeps your post history and pending state across deploys.
