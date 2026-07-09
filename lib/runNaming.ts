import { resolveProvider } from "./providers";
import { formatDistance, formatDuration, formatPace } from "./parseRun";
import type { RunRow } from "./types";

// A focused, single-purpose naming call. Unlike the coach's rename_run TOOL
// (which weak models fail to invoke), this only asks the model to emit a name as
// plain text — something every model does reliably — and the server does the
// actual rename. See setAutoNameRuns / the Settings toggle.
const NAMING_SYSTEM =
  "You name running workouts. Reply with ONLY the name — 2 to 6 words, no quotes, " +
  "no trailing punctuation, no explanation. Capture the effort/workout type and distance. " +
  "Judge effort from the per-km splits, not the averages: big pace/HR swings between " +
  "kilometers mean structure (progression, tempo finish, intervals), never 'easy'. " +
  "Call it easy only when the splits are uniformly relaxed. Mention time of day only if " +
  "a start time is given — never guess it. " +
  "Examples: Easy Z2 7K | Tempo 6x800m | Progression 8K | Long run 24K | Recovery jog 5K.";

// Turn a raw model reply into a safe, tidy run name (or null if unusable).
function cleanName(raw: string): string | null {
  let s = (raw || "").trim();
  if (!s) return null;
  s = s.split("\n")[0].trim(); // first line only
  s = s.replace(/^["'`]+|["'`]+$/g, "").trim(); // strip surrounding quotes
  s = s.replace(/[.]+$/, "").trim(); // trailing period
  if (!s) return null;
  return s.length > 60 ? s.slice(0, 60).trim() : s;
}

// Human time-of-day label. startedAt is interpreted in the server's timezone,
// matching how the rest of the app renders session times.
function timeOfDay(h: number): string {
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 14) return "midday";
  if (h >= 14 && h < 18) return "afternoon";
  if (h >= 18 && h < 22) return "evening";
  return "night";
}

// Ask the model for a fitting name for one run. Returns null on any failure so
// callers can simply skip the rename.
export async function generateRunName(
  run: RunRow,
  model: string,
  apiKey: string | null,
  nvidiaKey: string | null = null
): Promise<string | null> {
  const started = new Date(run.startedAt);
  const startLine = `Started: ${started.toLocaleDateString("en-GB", {
    weekday: "long",
  })} ${started.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })} (${timeOfDay(started.getHours())})`;

  const stats = [
    startLine,
    `Distance: ${formatDistance(run.distanceM)}`,
    `Time: ${formatDuration(run.durationSec)}`,
    `Avg pace: ${formatPace(run.avgPaceSecPerKm)}`,
    run.avgHr ? `Avg HR: ${Math.round(run.avgHr)}` : null,
    run.maxHr ? `Max HR: ${Math.round(run.maxHr)}` : null,
    `Elevation gain: ${Math.round(run.elevGainM)} m`,
  ]
    .filter(Boolean)
    .join(", ");

  // Per-km splits: the effort STRUCTURE. Averages hide a half-easy/half-hard
  // run; this is what lets the model tell a progression from an easy run.
  const splits = run.summary.splits ?? [];
  const splitsLine =
    splits.length > 1
      ? `\nPer-km pace: ${splits
          .map((s) => formatPace(s.paceSecPerKm) + (s.avgHr ? ` (${Math.round(s.avgHr)})` : ""))
          .join(", ")}`
      : "";

  // Watch-defined laps (warmup/active/recovery…) describe intervals directly.
  const laps = run.summary.laps ?? [];
  const lapsLine =
    laps.length > 1
      ? `\nWorkout laps: ${laps
          .map((l) => `${l.intensity} ${formatDistance(l.distanceM)} @ ${formatPace(l.paceSecPerKm)}`)
          .join("; ")}`
      : "";

  try {
    const provider = resolveProvider(model, apiKey, nvidiaKey);
    const result = await provider.streamTurn({
      model,
      system: NAMING_SYSTEM,
      messages: [{ role: "user", text: `Name this run:\n${stats}${splitsLine}${lapsLine}` }],
      onText: () => {},
    });
    return cleanName(result.text);
  } catch {
    return null;
  }
}
