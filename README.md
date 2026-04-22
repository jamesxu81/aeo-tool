# AEO Tool

AI search visibility platform. Check if ChatGPT, Perplexity, and Google AI Overview cite your site.

## Week-0 Status: Landing + Waitlist

This is the landing page + waitlist intake only. The full audit engine is still on the roadmap (see Kanban cards #1–#8).

## Local dev

```bash
pnpm install
cp .env.example .env.local
# Edit .env.local — set ADMIN_PASS at minimum
pnpm dev
```

Open http://localhost:3000.

### Admin waitlist viewer

- http://localhost:3000/admin (browser will prompt for basic auth)
- Credentials: `ADMIN_USER` / `ADMIN_PASS` from `.env.local`
- CSV export: `/api/admin/waitlist?format=csv`

### Database

SQLite at `./data/waitlist.db` (auto-created). Gitignored.

## Stack (Week 0)

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS v4
- better-sqlite3 (local file, zero external deps)
- Zod validation

Full stack (cards #1+): Clerk, Neon Postgres, Prisma, BullMQ/Upstash, Stripe, Playwright, Resend.

## Deploy to Vercel

```bash
# Once the private GitHub repo is created + you say "push":
vercel
```

Note: better-sqlite3 won't persist on Vercel serverless (filesystem is ephemeral). For production, swap to Neon/Postgres before deploying. For Week-0 demand validation, either:
- Deploy to Railway/Fly with persistent volume, or
- Migrate `src/lib/db.ts` to Postgres before `vercel deploy`.

## Scripts

- `pnpm dev` — dev server with Turbopack
- `pnpm build` — production build
- `pnpm start` — run production build
- `pnpm lint`
