# NVIDIA model bench

Finds which free NVIDIA model can be the default coach, by testing the one thing
the app depends on: **reliable tool calling**. Goals and plans only change when the
model emits the right tool call with valid arguments — a model that "describes" a
plan in prose instead of calling `set_macro_plan` silently breaks the feature.

It runs the **exact production system prompt and tools** (`lib/coachDefs.ts`)
through the **same agentic loop** the app uses, against NVIDIA's OpenAI-compatible
endpoint. Tool execution is stubbed (no DB) — we only score the model's tool calls.

## Setup

1. Get a free API key at <https://build.nvidia.com> → add to `.env.local`:
   ```
   NVIDIA_API_KEY=nvapi-...
   ```
2. Verify the model ids in `DEFAULT_MODELS` (top of `run.mts`) against the live
   catalog — ids drift, and a wrong id just reports as an error.

## Run

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env.local bench/run.mts

# or test specific models:
NODE_OPTIONS=--no-warnings node --env-file=.env.local bench/run.mts meta/llama-3.3-70b-instruct qwen/qwen2.5-72b-instruct
```

## What it scores

Six realistic scenarios, each with explicit pass criteria, plus an automatic
JSON-schema validation of every tool call's arguments:

| Scenario        | Tests |
|-----------------|-------|
| `build-plan`    | Multi-tool, multi-turn — calls `set_macro_plan` **and** `set_weekly_plan` (flagship) |
| `create-goal`   | Parses NL into `upsert_goal` with right `raceType` / time / date |
| `log-lthr`      | Calls `log_lthr_test` with the reported value |
| `edit-week`     | Resends the **full 7-day** week on a one-day edit (a strong discriminator) |
| `set-projection`| Calls `set_goal_projection` on the right goal id |
| `no-tool`       | Plain feedback request → makes **zero** tool calls (no over-calling) |

A scenario passes only if all its checks pass **and** every tool call's args are
schema-valid. Output: a scoreboard (best first) + `results.json` with every tool
call and its arguments for inspection.
