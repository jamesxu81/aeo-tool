# AEO Tool

AI search visibility platform. Check if ChatGPT, Perplexity, and Google AI Overview cite your site.

## Status

- ✅ **Card #0** — Landing + Waitlist (SQLite, Resend-optional)
- ✅ **Card #1** — Auth + Billing + Project scaffold (Clerk + Prisma/Postgres + Stripe)
- 🚧 Cards #2–#8 — Audit pipeline, AI citation checker, competitor diff, PDF report

## Local dev

```bash
pnpm install
cp .env.example .env.local
# Fill in at minimum: ADMIN_PASS (for /admin Week-0 viewer)
# For /app to work, also need: CLERK_*, DATABASE_URL
# For payments: STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET
pnpm dev
```

Open http://localhost:3000.

## Route map

| Route | Auth | What |
|---|---|---|
| `/` | public | Landing + waitlist form |
| `/admin` | basic-auth | Week-0 waitlist viewer + CSV export |
| `/sign-in`, `/sign-up` | public | Clerk |
| `/app` | Clerk | Projects dashboard |
| `/app/projects/new` | Clerk | Create project form |
| `/app/projects/[id]` | Clerk | Project detail + Stripe CTA |
| `/api/waitlist` | public POST | SQLite insert + Resend confirmation |
| `/api/admin/waitlist` | basic-auth GET | JSON or `?format=csv` |
| `/api/projects` | Clerk | GET / POST projects |
| `/api/checkout` | Clerk | POST — creates Stripe Checkout session |
| `/api/webhooks/stripe` | Stripe sig | Marks project paid on `checkout.session.completed` |

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind v4 (Turbopack)
- Clerk (auth)
- Prisma 7 + `@prisma/adapter-pg` (Postgres; Neon recommended)
- Stripe Checkout (payment mode, single SKU $99)
- Resend (waitlist confirmation — optional)
- better-sqlite3 (Week-0 waitlist only; Clerk/Stripe flows use Postgres)

## Activating each service

Drop the corresponding env vars in `.env.local`, restart `pnpm dev`, done.

### Clerk
1. Create app at https://clerk.com → copy publishable + secret keys
2. Paste into `.env.local`
3. Go to `/sign-up` → register → `/app` now accessible

### Postgres (Neon)
1. https://neon.tech → new project → copy connection string
2. Paste as `DATABASE_URL`
3. Run `pnpm prisma migrate dev --name init` to create tables

### Stripe (test mode)
1. https://dashboard.stripe.com (test mode) → copy secret key
2. For webhook testing locally: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` → copy the `whsec_...`
3. Paste both into `.env.local`

## Scripts

- `pnpm dev` — dev server with Turbopack
- `pnpm build` — production build
- `pnpm start` — run production build
- `pnpm lint`
- `pnpm prisma migrate dev` — create/apply migrations
- `pnpm prisma studio` — DB browser
