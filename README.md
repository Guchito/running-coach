# Stride — AI Running Coach 🏃

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

1. Add your Anthropic API key to `.env.local` (already created):

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   COACH_MODEL=claude-opus-4-8
   ```

   Get a key at https://console.anthropic.com/settings/keys

2. Install & run:

   ```bash
   npm install
   npm run dev
   ```

   Open http://localhost:3000

## How it works

- **Frontend/Backend:** Next.js 16 (App Router) + Tailwind CSS 4.
- **Database:** a local SQLite file at `data/coach.db` (via Node's built-in
  `node:sqlite`). Holds your runs, goal, and chat history. Easy to back up;
  delete the file to reset everything.
- **CSV parsing:** [`lib/parseRun.ts`](lib/parseRun.ts) handles the Apple Watch
  Outdoor Running format (`;`-separated, European `,` decimals, ~1 sample/sec).
- **Claude:** [`app/api/chat/route.ts`](app/api/chat/route.ts) streams responses.
  Your goal and a compact summary of every run are rebuilt into the context on
  each message, so the coach is always current. The raw per-second data is
  summarized first — it's never dumped wholesale into the prompt.

## Importing your history

Just upload each past run's CSV one at a time from the **Upload** page — they
stack up in your history and the coach factors them all in.

Your API key lives only in `.env.local` (gitignored) and the database stays on
your machine.
