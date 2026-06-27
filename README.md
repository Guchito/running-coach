# Gunna — AI Running Coach 🏃

A personal running coach web app. Upload your Apple Watch run exports (CSV),
set a goal, and chat with an AI coach (powered by Claude) that sees your goal
and full run history and gives you tailored feedback after every run.

## Features

- **Upload runs** — drag-and-drop the `.csv` your watch exports. Each run is
  parsed into pace, splits, heart-rate effort, cadence, stride, vertical
  oscillation, ground-contact time, elevation, and effort zones.
- **Dashboard** — goal progress (days to race + a Riegel-projected finish
  time), weekly volume, pace trend, and recent runs.
- **Run breakdown** — per-km splits, pace/HR chart, elevation profile, running
  form metrics, and effort/HR-zone breakdown.
- **Goals** — pick a race (5K/10K/Half/Marathon/custom), a target time and date.
  Update it anytime as your fitness changes.
- **AI coach** — a streaming chat that always sees your current goal and run
  history. Ask for feedback, a next workout, or whether you're on track.

## Setup

1. Configure `.env.local` (already created locally):

   ```
   ANTHROPIC_API_KEY=sk-ant-...                       # console.anthropic.com/settings/keys
   COACH_MODEL=claude-opus-4-8
   DATABASE_URL=postgresql://user@host:5432/dbname     # your Postgres
   SESSION_SECRET=<long random string>                 # signs login cookies
   # DATABASE_SSL=disable                               # only for a plain local Postgres
   ```

   Generate a session secret with:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

2. Install & run:

   ```bash
   npm install
   npm run dev          # http://localhost:3000
   ```

   The database schema (users, runs, goals, messages) is created automatically
   on first request. Open the app, **create an account**, and start uploading.

## Accounts & privacy

- Email + password sign-in. Passwords are hashed with scrypt; they are never
  stored in plain text. Sessions are signed JWTs in an httpOnly cookie.
- Every run, goal, and chat message is scoped to your `user_id`. Other users
  can only ever see their own data — enforced in every query and by middleware
  ([`proxy.ts`](proxy.ts)) that gates all routes behind a valid session.
- To make it just you, create your account, then remove the signup link / close
  signups (see "Locking signups" below).

## How it works

- **Frontend/Backend:** Next.js 16 (App Router) + Tailwind CSS 4.
- **Database:** Postgres via [`pg`](https://node-postgres.com) — tables for
  `users`, `runs`, `goals`, `messages`. Schema lives in
  [`lib/db.ts`](lib/db.ts) and is applied idempotently (`CREATE TABLE IF NOT
  EXISTS`) on first query.
- **Auth:** [`lib/password.ts`](lib/password.ts) (scrypt hashing),
  [`lib/session.ts`](lib/session.ts) (jose JWT, edge-safe for middleware),
  [`lib/auth.ts`](lib/auth.ts) (server helpers), and [`proxy.ts`](proxy.ts)
  (route protection).
- **CSV parsing:** [`lib/parseRun.ts`](lib/parseRun.ts) handles the Apple Watch
  Outdoor Running format (`;`-separated, European `,` decimals, ~1 sample/sec).
- **Claude:** [`app/api/chat/route.ts`](app/api/chat/route.ts) streams responses.
  Your name, goal, and a compact summary of every run are rebuilt into the
  context on each message, so the coach is always current. The raw per-second
  data is summarized first — it's never dumped wholesale into the prompt.

## Deploying online

1. Create a hosted Postgres (e.g. [Neon](https://neon.tech) free tier) and copy
   its **pooled** connection string.
2. Deploy to a Node host (Vercel works well). Set the env vars
   (`ANTHROPIC_API_KEY`, `DATABASE_URL`, `SESSION_SECRET`, `COACH_MODEL`) in the
   project settings. Hosted Postgres needs TLS, which is on by default.
3. First load creates the tables; sign up to create your account.

### Locking signups (make it private)

After you've created your account, you can close registration: have
`app/api/auth/signup/route.ts` reject new signups (e.g. `if (await countUsers()
> 0) return 403`) and hide the signup link in
[`components/AuthForm.tsx`](components/AuthForm.tsx). Ask and I'll wire this up.

## Importing your history

Upload each past run from the **Upload** page — `.fit` (HealthFit, Garmin,
Strava…) or `.csv` (Apple Watch Outdoor Running export). They stack up in your
history and the coach factors them all in.

## Google Drive auto-import (optional)

If HealthFit syncs your runs to a Google Drive folder, the app can pull new
files in automatically. It uses a **service account** (no login popups), so it
works for silent background sync.

**One-time setup:**

1. In the [Google Cloud Console](https://console.cloud.google.com/): create a
   project, **enable the Google Drive API**, then create a **Service Account**
   and download its **JSON key**.
2. Point the app at the key — either in `.env.local`:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
   # or paste the JSON (single line or base64):
   # GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
   ```
   then restart the dev server.
3. In the app: **Settings → Google Drive auto-import**. Copy the service
   account's email shown there.
4. In Google Drive: **share your HealthFit folder** with that email (Viewer).
5. Back in Settings, paste the folder's share link (or ID) and **Save**.

Now the dashboard auto-syncs on visit (throttled to once every ~5 min), and
**Sync now** in Settings forces an immediate pull. Files are de-duplicated by
Drive file id and by run start time, so nothing imports twice — even if you
also uploaded it manually.

The service account only sees folders you explicitly share with it.
