"use client";

import { useState } from "react";
import { Card, Button } from "@/components/ui";

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-[border-color] duration-150 focus:border-accent";

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = current.length > 0 && next.length >= 8 && next === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not change the password.");
      setSaved(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6 h-full">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          <span className="text-muted">Current password</span>
          <input
            type="password"
            required
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setSaved(false);
            }}
            autoComplete="current-password"
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">New password</span>
          <input
            type="password"
            required
            minLength={8}
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              setSaved(false);
            }}
            autoComplete="new-password"
            className={`${inputCls} mt-1`}
          />
          <span className="block text-xs text-muted mt-1">At least 8 characters.</span>
        </label>
        <label className="block text-sm">
          <span className="text-muted">Repeat new password</span>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setSaved(false);
            }}
            autoComplete="new-password"
            aria-invalid={mismatch}
            className={`${inputCls} mt-1 ${mismatch ? "border-red-400" : ""}`}
          />
          {mismatch && (
            <span className="block text-xs text-red-600 mt-1">Passwords don&apos;t match.</span>
          )}
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || !ready}>
            {busy ? "Changing…" : "Change password"}
          </Button>
          {saved && <span className="text-sm text-muted">Password changed</span>}
        </div>
      </form>
    </Card>
  );
}
