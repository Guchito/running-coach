"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSignup ? { email, password, name } : { email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");

      const next = new URLSearchParams(window.location.search).get("next") || "/";
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-accent bg-card";

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-accent text-white font-bold text-xl">G</span>
          <div className="leading-tight">
            <div className="font-semibold text-lg">Gunna</div>
            <div className="text-xs text-muted">AI Running Coach</div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h1 className="text-xl font-semibold mb-1">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-muted mb-5">
            {isSignup
              ? "Start tracking your runs and training with your AI coach."
              : "Sign in to see your runs, goal, and coach."}
          </p>

          <form onSubmit={submit} className="space-y-3">
            {isSignup && (
              <label className="block text-sm">
                <span className="text-muted">Name (optional)</span>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  autoComplete="name" placeholder="Agustin" className={inputCls} />
              </label>
            )}
            <label className="block text-sm">
              <span className="text-muted">Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)}
                type="email" required autoComplete="email" placeholder="you@example.com" className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Password</span>
              <input value={password} onChange={(e) => setPassword(e.target.value)}
                type="password" required minLength={isSignup ? 8 : undefined}
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? "At least 8 characters" : "••••••••"} className={inputCls} />
            </label>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button type="submit" disabled={busy}
              className="w-full rounded-lg bg-accent text-white py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-muted mt-4">
          {isSignup ? (
            <>Already have an account?{" "}
              <Link href="/login" className="text-accent font-medium">Sign in</Link>
            </>
          ) : (
            <>New here?{" "}
              <Link href="/signup" className="text-accent font-medium">Create an account</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
