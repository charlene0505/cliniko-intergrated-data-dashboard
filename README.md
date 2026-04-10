# SHP Referral Dashboard

A Next.js dashboard that displays patient referral data by referring doctors, sourced from the Cliniko API.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or later
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
CLINIKO_SHARD=au1        # your Cliniko shard, e.g. au1, au2, us1
```

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

1. The dashboard calls `/api/cliniko/referrals` on load.
2. That endpoint fetches all patients from Cliniko (paginated, up to 200 pages).
3. For each patient with a referring doctor, it fetches the doctor's contact details.
4. Results stream back to the browser in real time via Server-Sent Events (SSE).
5. The dashboard displays the top 20 referring doctors and their patient counts.
