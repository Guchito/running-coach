"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-[border-color] duration-150 focus:border-accent";

// Display name is editable; email is the login identity and shown read-only.
export function AccountForm({
  initialName,
  initialEmail,
  memberSince,
}: {
  initialName: string | null;
  initialEmail: string;
  memberSince: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== (initialName ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/profile/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(data?.error ?? "Could not save your details.");
      setSaved(true);
      router.refresh(); // sidebar email + anything else reading the user
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your details.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6 h-full">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          <span className="text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            placeholder="How the coach should call you"
            autoComplete="name"
            className={`${inputCls} mt-1`}
          />
        </label>
        <div className="text-sm">
          <span className="text-muted">Email</span>
          <div className="mt-1 rounded-lg border border-border bg-black/2 px-3 py-2 text-foreground/80">
            {initialEmail}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save details"}
          </Button>
          {saved && <span className="text-sm text-muted">Saved</span>}
        </div>

        <p className="text-xs text-muted pt-2 border-t border-border">
          Training here since {memberSince}.
        </p>
      </form>
    </Card>
  );
}
