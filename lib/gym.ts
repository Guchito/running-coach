import type { GymType } from "./types";

// Client-safe gym helpers (no Node-only FIT SDK), so the upload form and
// server can both import them. The watch can't tell push from pull, so the
// runner picks the type on upload — these are the choices and labels.
export const GYM_TYPES: { value: GymType; label: string }[] = [
  { value: "push", label: "Push" },
  { value: "pull", label: "Pull" },
  { value: "legs", label: "Legs" },
  { value: "upper", label: "Upper body" },
  { value: "lower", label: "Lower body" },
  { value: "full_body", label: "Strength" },
  { value: "core", label: "Core" },
  { value: "cardio", label: "Cardio / conditioning" },
  { value: "other", label: "Other" },
];

const LABELS: Record<string, string> = Object.fromEntries(
  GYM_TYPES.map((t) => [t.value, t.label])
);

export function gymTypeLabel(t: string): string {
  return LABELS[t] ?? t;
}

export function isGymType(v: string): v is GymType {
  return v in LABELS;
}

// Best-effort default from the file's sport/sub-sport. Watches don't record the
// muscle group, so this is only a fallback when the runner doesn't pick one.
export function guessGymType(sport: string | null, subSport: string | null): GymType {
  const s = `${sport ?? ""} ${subSport ?? ""}`.toLowerCase();
  if (s.includes("strength")) return "full_body";
  if (s.includes("cardio") || s.includes("hiit")) return "cardio";
  return "other";
}

// Distance/endurance sports that are runs (or run-like cardio we still track as
// runs), as reported by a FIT/TCX `sport` tag.
const RUN_LIKE_SPORTS = [
  "running",
  "run",
  "walking",
  "hiking",
  "cycling",
  "biking",
  "swimming",
  "rowing",
];

// Gym/strength indicators in a `sport` or `sub_sport` tag.
const STRENGTH_HINTS = [
  "strength",
  "cardio",
  "flexibility",
  "hiit",
  "training", // FIT "training" sport == gym/fitness, distinct from "running"
  "fitness",
  "yoga",
  "pilates",
  "core",
];

// Decide whether a workout's sport tags describe a gym/strength session rather
// than a run. Distance sports win first so a "running" workout is never a gym.
export function isStrengthSport(sport: string | null, subSport: string | null): boolean {
  const sp = (sport ?? "").toLowerCase();
  const sub = (subSport ?? "").toLowerCase();
  if (RUN_LIKE_SPORTS.some((k) => sp.includes(k))) return false;
  return STRENGTH_HINTS.some((k) => sp.includes(k) || sub.includes(k));
}
