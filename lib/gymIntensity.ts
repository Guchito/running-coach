import type { GymSession } from "./types";
import { volumeOf } from "./gymProgress";
import { DEFAULT_MAX_HR } from "./hr";

// Most gym sessions arrive with no RPE: Strong/Hevy pastes carry none, and only
// some watches write FIT workout_rpe. Rather than show a dash, estimate the
// effort from everything the session *does* have — tonnage, work rate, length,
// calorie burn and heart rate.
//
// Every signal but heart rate is scored *relative to the runner's own history
// for that session type*, because absolute tonnage says nothing on its own: an
// hour that moved twice your usual load is not the hour that moved half of it.
// Heart rate is the one absolute signal, so a first-ever session still gets a
// number. It carries the least weight of the lot — lifting suppresses average
// HR through the rests between sets, and a low gym HR must never read as easy.

export type IntensityEstimate = {
  rpe: number; // 1-10, to the nearest half
  basis: string[]; // the signals that fed it, heaviest first
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Your own median session is a 6.5 — a normal working session, neither a
// deload nor a peak. Log-shaped so double your usual lands near 9 and the
// extremes compress instead of running off the end of the scale.
function ratioScore(ratio: number): number {
  return clamp(6.5 + 2.6 * Math.log2(ratio), 1, 10);
}

// Absolute %max-HR anchors, used only when there's no history to compare
// against. Strength work holds average HR near half of max — the rests between
// sets see to that — so for lifting, 50% *is* a normal working session and the
// running anchors would score every gym session a 2. Conditioning work is paced
// like a run, so it keeps the standard anchors.
function hrScore(pctMax: number, cardio: boolean): number {
  return cardio
    ? clamp((pctMax - 0.35) * 16, 1, 10)
    : clamp(6.5 + (pctMax - 0.5) * 18, 1, 10);
}

// Total kg moved across every logged set. 0 when the session is watch-only.
export function sessionVolume(s: GymSession): number {
  return (s.exercises ?? []).reduce((t, e) => t + volumeOf(e.sets), 0);
}

function perMinute(total: number, durationSec: number): number | null {
  return durationSec > 0 && total > 0 ? total / (durationSec / 60) : null;
}

// How many same-type sessions form the baseline. Wide enough that one outlier
// week can't define "normal", short enough to track current form.
const PEER_WINDOW = 8;

type Signal = { label: string; weight: number; score: number };

// Estimate a 1-10 RPE for a session that has none. Returns null when the
// session carries no usable data at all — better a dash than a made-up number.
export function estimateIntensity(
  session: GymSession,
  history: GymSession[],
  userMaxHr?: number | null
): IntensityEstimate | null {
  // Compare like with like: same session type, never against itself, and only
  // against the sessions nearest it in time. An all-time baseline would drift
  // out from under the runner — once they get stronger, every session from
  // then on reads "hard" against what they were lifting months ago, and an old
  // session reads "easy" against a future it hadn't reached yet.
  const at = Date.parse(session.startedAt);
  const peers = history
    .filter((s) => s.id !== session.id && s.type === session.type)
    .sort(
      (a, b) =>
        Math.abs(Date.parse(a.startedAt) - at) - Math.abs(Date.parse(b.startedAt) - at)
    )
    .slice(0, PEER_WINDOW);
  const signals: Signal[] = [];

  // A relative signal needs a couple of past sessions before its median means
  // anything. With fewer, it's dropped rather than guessed at.
  const relative = (
    label: string,
    weight: number,
    value: number | null,
    of: (s: GymSession) => number | null
  ) => {
    if (value == null || value <= 0) return;
    const peerVals = peers.map(of).filter((v): v is number => v != null && v > 0);
    if (peerVals.length < 2) return;
    signals.push({ label, weight, score: ratioScore(value / median(peerVals)) });
  };

  const vol = sessionVolume(session);
  relative("tonnage", 1.2, vol || null, (s) => sessionVolume(s) || null);
  relative("work rate", 0.9, perMinute(vol, session.durationSec), (s) =>
    perMinute(sessionVolume(s), s.durationSec)
  );
  relative("calorie burn", 0.6, perMinute(session.calories ?? 0, session.durationSec), (s) =>
    perMinute(s.calories ?? 0, s.durationSec)
  );
  relative("session length", 0.5, session.durationSec || null, (s) => s.durationSec || null);

  // Heart rate is scored relative too. Lifting holds average HR near half of
  // max (all those rests between sets), so the absolute %max-HR anchors would
  // score every gym session a 2 and, worse, rate a session that recorded no HR
  // at all *harder* than the identical one that did.
  relative("heart rate", 0.7, session.avgHr, (s) => s.avgHr);

  // Only when there's no history to compare against does the absolute curve
  // earn its keep — it's what lets a first-ever session still get a number.
  if (signals.length === 0 && session.avgHr != null && session.avgHr > 0) {
    const maxRef = userMaxHr && userMaxHr > 0 ? userMaxHr : DEFAULT_MAX_HR;
    signals.push({
      label: "heart rate",
      weight: 0.7,
      score: hrScore(session.avgHr / maxRef, session.type === "cardio"),
    });
  }

  if (signals.length === 0) return null;
  const totalWeight = signals.reduce((t, s) => t + s.weight, 0);
  const raw = signals.reduce((t, s) => t + s.score * s.weight, 0) / totalWeight;
  return {
    rpe: clamp(Math.round(raw * 2) / 2, 1, 10),
    basis: [...signals].sort((a, b) => b.weight - a.weight).map((s) => s.label),
  };
}
