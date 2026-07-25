"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExerciseCandidate } from "@/lib/types";

// The body parts you can browse when search doesn't find it. Kept local (not
// imported from the server-only exerciseDb module) so no server code leaks into
// the client bundle.
const BODY_PARTS = [
  "chest", "back", "shoulders", "upper arms", "lower arms",
  "upper legs", "lower legs", "waist", "cardio", "neck",
];

// A quiet "the demo is wrong" escape hatch. The matcher is right most of the
// time, so this stays a single muted line until tapped; then it offers search
// across both datasets plus browse-by-body-part, and a "no match" option.
// Picking writes a verified override the auto-resolver won't clobber.
export function ExerciseMatchFixer({
  name,
  matchedName,
}: {
  name: string; // the athlete's own exercise name (the resolution key)
  matchedName: string | null; // what's currently showing, if anything
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [bodyPart, setBodyPart] = useState<string | null>(null);
  const [results, setResults] = useState<ExerciseCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ indexed: number; total: number; complete: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [nonce, setNonce] = useState(0); // bump to re-run the current search
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTerm(matchedName ?? name);
      inputRef.current?.focus();
      fetch("/api/exercise-media?status")
        .then((r) => r.json())
        .then(setStatus)
        .catch(() => {});
    }
  }, [open, name, matchedName]);

  // Pull the next slice of the catalog from the (flaky) source, then re-search.
  async function loadMore() {
    setSyncing(true);
    try {
      const res = await fetch("/api/exercise-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync: true }),
      });
      setStatus(await res.json());
      setNonce((n) => n + 1);
    } finally {
      setSyncing(false);
    }
  }

  // Typing searches both datasets; a body-part chip browses instead. Typing
  // clears any active body-part filter.
  useEffect(() => {
    if (!open) return;
    const q = term.trim();
    const url = q
      ? `/api/exercise-media?search=${encodeURIComponent(q)}`
      : bodyPart
      ? `/api/exercise-media?bodyPart=${encodeURIComponent(bodyPart)}`
      : null;
    if (!url) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(url);
        const body = (await res.json()) as { results?: ExerciseCandidate[] };
        setResults(body.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [term, bodyPart, open, nonce]);

  async function choose(candidate: ExerciseCandidate | null) {
    setSaving(true);
    try {
      await fetch("/api/exercise-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          candidate ? { name, exerciseId: candidate.exerciseId } : { name }
        ),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted hover:text-foreground underline underline-offset-2"
      >
        {matchedName ? "Wrong exercise? Fix the demo" : "Pick the right demo"}
      </button>
    );
  }

  return (
    <div className="mt-1 w-full">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setBodyPart(null);
          }}
          placeholder="Search exercises…"
          className="flex-1 min-w-0 rounded-lg border border-border bg-card px-3 py-1.5 text-sm outline-none focus-visible:border-accent"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:text-foreground px-2 py-1"
        >
          Cancel
        </button>
      </div>

      {/* Browse by body part when you can't name it. */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {BODY_PARTS.map((bp) => {
          const active = bodyPart === bp && !term.trim();
          return (
            <button
              key={bp}
              type="button"
              onClick={() => {
                setTerm("");
                setBodyPart(active ? null : bp);
              }}
              className={`text-xs px-2 py-0.5 rounded-full capitalize transition-colors ${
                active ? "bg-accent-soft text-accent" : "bg-black/4 text-muted hover:text-foreground"
              }`}
            >
              {bp}
            </button>
          );
        })}
      </div>

      {/* The catalog syncs from a flaky free source, so it can arrive in
          pieces. Show progress and let the athlete pull more if what they want
          isn't indexed yet. */}
      {status && !status.complete && (
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
          <span>
            Exercise library loading — {status.indexed}/{status.total} indexed
          </span>
          <button
            type="button"
            onClick={loadMore}
            disabled={syncing}
            className="shrink-0 rounded-md bg-accent-soft text-accent px-2 py-1 font-medium disabled:opacity-50"
          >
            {syncing ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-border/70 rounded-lg border border-border">
        {loading && results.length === 0 && (
          <li className="px-3 py-2 text-xs text-muted">Searching…</li>
        )}
        {!loading && results.length === 0 && (term.trim() || bodyPart) && (
          <li className="px-3 py-2 text-xs text-muted">No matches.</li>
        )}
        {results.map((c) => (
          <li key={`${c.source}:${c.exerciseId}`}>
            <button
              type="button"
              disabled={saving}
              onClick={() => choose(c)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-black/4 disabled:opacity-50"
            >
              {c.thumbUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.thumbUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded object-cover bg-black/3"
                  loading="lazy"
                />
              )}
              <span className="text-sm min-w-0 capitalize">{c.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={saving}
        onClick={() => choose(null)}
        className="mt-2 text-xs text-muted hover:text-warn underline underline-offset-2 disabled:opacity-50"
      >
        None of these — hide the demo
      </button>
    </div>
  );
}
