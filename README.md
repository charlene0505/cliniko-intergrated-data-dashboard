# SHP Referral Dashboard

A Next.js dashboard that displays patient referral data by referring doctors, sourced from the Cliniko API.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v22 (run `nvm use`)
- [pnpm](https://pnpm.io/) v10 — install with `npm install -g pnpm`
- A Cliniko account with an API key
- (Optional) [Docker](https://www.docker.com/) for containerised runs

---

## Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
CLINIKO_API_KEY=your_api_key_here
CLINIKO_SHARD=au1
MONGODB_URI=mongodb+srv://USER:PASSWORD@HOST/shp
AUTH_ADMIN_PASSWORD=choose-a-password
AUTH_OWNER_PASSWORD=choose-a-different-password
AUTH_PHYSIO_PASSWORD=choose-another-password
JWT_SECRET=replace-with-a-random-secret
CRON_SECRET=replace-with-a-different-random-secret
```

The login names are `admin`, `owner`, and `physio`. Their passwords come from the corresponding `AUTH_*_PASSWORD` variables; an empty value disables that account. `JWT_SECRET` is required to sign sessions and has no fallback. Generate separate random secrets with `openssl rand -hex 32`. Keep `.env.local` out of Git.

**How to find your API key:** In Cliniko, go to **My Info → API Keys → Generate API key**.  
**How to find your shard:** It's in your Cliniko URL — e.g. `https://api.au1.cliniko.com` → shard is `au1`.

---

## Running Locally (Development)

```bash
# 1. Install dependencies
pnpm install

# 2. Start the development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The dev server supports hot reload — any file changes are reflected immediately.

---

## Running Locally (Production Build)

Use this to test the production build before deploying:

```bash
# 1. Install dependencies
pnpm install

# 2. Build the app
pnpm build

# 3. Start the production server
pnpm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Running with Docker

```bash
# 1. Build the Docker image
docker build -t shp-dashboard .

# 2. Run the container, passing your env variables
docker run -p 3000:3000 \
  -e CLINIKO_API_KEY=your_api_key_here \
  -e CLINIKO_SHARD=au1 \
  shp-dashboard
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Tip:** If you have a `.env.local` file, you can mount it directly instead:
> ```bash
> docker run -p 3000:3000 --env-file .env.local shp-dashboard
> ```

---

## Deploying to Vercel

This project is pre-configured for Vercel (`vercel.json`), targeting the Sydney region (`syd1`).

```bash
# Install the Vercel CLI if you haven't already
npm install -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

Set your environment variables in the Vercel dashboard under **Project → Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `CLINIKO_API_KEY` | Your Cliniko API key |
| `CLINIKO_SHARD` | Your shard (e.g. `au1`) |
| `MONGODB_URI` | Connection string including the database name |
| `AUTH_ADMIN_PASSWORD` | Admin login password |
| `AUTH_OWNER_PASSWORD` | Owner login password |
| `AUTH_PHYSIO_PASSWORD` | Physio login password |
| `JWT_SECRET` | Random session-signing secret |
| `CRON_SECRET` | Separate random secret for scheduled sync requests |

Set these for **Production** before redeploying. Local `.env.local` values are not automatically copied into Vercel.

### Daily sync

`vercel.json` contains one full sync: `0 2 * * *` (daily at 02:00 UTC; noon Sydney standard time or 1 pm daylight time). Vercel Hobby runs it within that hour, not necessarily at the exact minute. The previous hourly schedule is unsupported on Hobby and causes deployment rejection. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Vercel sends `CRON_SECRET` as a bearer token. The middleware permits that token only for `/api/sync`; the route also checks authentication. Scheduled jobs run on production deployments. Manual **Sync Now** remains available independently of the daily schedule.

### Contact errors

A failed contact lookup or save emits a warning with the contact ID and HTTP status when available. The sync continues, attempts each failed contact only once per run, and saves warnings in `sync_jobs.contactFailures`. The dashboard displays warnings during the sync and from the last completed sync after refresh. Use **Retry full sync** to retry missing contacts, including those linked to unchanged patients. Old syncs cannot recover error details that were never recorded.

---

## Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server (requires `pnpm build` first) |
| `pnpm lint` | Run ESLint |

---

## Project Structure

```
src/
├── app/
│   ├── api/cliniko/
│   │   ├── referrals/route.ts   # Main data endpoint (SSE stream)
│   │   ├── test/route.ts        # API connection test
│   │   └── debug/route.ts       # Debug endpoint
│   ├── page.tsx                 # Dashboard UI
│   ├── layout.tsx               # Root layout
│   └── globals.css              # Global styles (Tailwind)
└── lib/
    └── cliniko.ts               # Cliniko API helper with retry logic
```

---

## How It Works

1. The dashboard reads precomputed referral statistics from MongoDB through `/api/cliniko/referrals`.
2. An initial, manual, or scheduled sync fetches patients and referring-doctor contacts from Cliniko.
3. The sync saves patients, doctors, and job details to MongoDB, then computes statistics for each period.
4. Manual sync progress and contact warnings stream back via Server-Sent Events (SSE).
5. The dashboard displays the top 20 referring doctors for the selected period.

## Regression checks

Run `node --test tests/regressions.mjs` to check environment-based authentication, cron routing, and contact failure reporting with mocked services. Run `pnpm lint` and `pnpm exec tsc --noEmit` for static checks.
