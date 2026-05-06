# AEO Worker — Railway Deployment

The BullMQ worker runs as a **separate always-on process** on Railway while the Next.js app runs on Vercel.

## Architecture

```
User → Vercel (Next.js UI + API)
         ↓ enqueue job via BullMQ
       Upstash Redis (shared queue)
         ↓ worker polls
       Railway (this worker) → writes to Neon DB
```

## Environment Variables (set in Railway dashboard)

Copy all variables from your `.env.local` into Railway:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `REDIS_URL` | Upstash Redis TLS URL (`rediss://...`) |
| `SERPAPI_KEY` | SerpAPI key for AI citation checks |
| `RESEND_API_KEY` | Resend API key for email notifications |
| `NEXT_PUBLIC_APP_URL` | Your Vercel app URL (for report links in emails) |

> **Not needed in worker:** `CLERK_*`, `STRIPE_*`, `NEXT_PUBLIC_*` (except APP_URL)

## Deploy Steps

1. Push your repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo → Railway auto-detects `railway.toml`
4. In the service settings, add the environment variables above
5. Deploy — Railway builds the Docker image and starts the worker

## Local dev

```bash
pnpm worker:dev
```

## Logs

Railway streams worker logs in real time from the dashboard.
Each audit step logs: `[worker] <auditId> — <step message>`
