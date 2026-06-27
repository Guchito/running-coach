import type { GymType } from "./types";
import { gymTypeLabel } from "./gym";

// Client-safe colour + label helpers shared by the history list and the calendar.
// Runs are a single category; each gym type gets its own colour.

export const RUN_COLOR = "#4f46e5"; // indigo

export const GYM_TYPE_COLOR: Record<GymType, string> = {
  push: "#e11d48", // rose
  pull: "#0ea5e9", // sky
  legs: "#d97706", // amber
  upper: "#8b5cf6", // violet
  lower: "#f59e0b", // orange
  full_body: "#10b981", // emerald
  core: "#ec4899", // pink
  cardio: "#14b8a6", // teal
  other: "#94a3b8", // slate
};

export function sessionColor(kind: "run" | "gym", type?: string | null): string {
  if (kind === "run") return RUN_COLOR;
  return GYM_TYPE_COLOR[type as GymType] ?? GYM_TYPE_COLOR.other;
}

export function sessionTypeLabel(kind: "run" | "gym", type?: string | null): string {
  return kind === "run" ? "Run" : gymTypeLabel(type ?? "other");
}

// Flat, serialisable shape passed from the server page into client components.
export type SessionLite = {
  id: number;
  kind: "run" | "gym";
  type: string; // "run" for runs, the GymType for gym sessions
  typeLabel: string;
  color: string;
  name: string;
  startedAt: string; // ISO
  href: string; // detail page
  meta: string; // secondary line, e.g. "5.0 km · 24:30 · 4:54 /km"
  distanceM?: number; // runs only — for distance filtering
  paceSecPerKm?: number; // runs only — for pace filtering
};

// Local-time YYYY-MM-DD key for grouping sessions by day.
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
