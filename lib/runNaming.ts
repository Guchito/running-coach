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
  "Examples: Easy Z2 7K | Tempo 6x800m | Long run 24K | Recovery jog 5K | Half marathon race.";

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

// Ask the model for a fitting name for one run. Returns null on any failure so
// callers can simply skip the rename.
export async function generateRunName(
  run: RunRow,
  model: string,
  apiKey: string | null
): Promise<string | null> {
  const stats = [
    `Distance: ${formatDistance(run.distanceM)}`,
    `Time: ${formatDuration(run.durationSec)}`,
    `Avg pace: ${formatPace(run.avgPaceSecPerKm)}`,
    run.avgHr ? `Avg HR: ${Math.round(run.avgHr)}` : null,
    run.maxHr ? `Max HR: ${Math.round(run.maxHr)}` : null,
    `Elevation gain: ${Math.round(run.elevGainM)} m`,
  ]
    .filter(Boolean)
    .join(", ");

  try {
    const provider = resolveProvider(model, apiKey);
    const result = await provider.streamTurn({
      model,
      system: NAMING_SYSTEM,
      messages: [{ role: "user", text: `Name this run:\n${stats}` }],
      onText: () => {},
    });
    return cleanName(result.text);
  } catch {
    return null;
  }
}
