"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";

// Lets the runner store their OWN Anthropic API key (encrypted server-side) so
// they can use the paid Claude models. Without a key, the coach uses the free
// model. The key is write-only here: we only ever learn whether one is set.
export function AnthropicKeyForm({ initialHasKey }: { initialHasKey: boolean }) {
  const router = useRouter();
  const [hasKey, setHasKey] = useState(initialHasKey);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/anthropic-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to save");
      setHasKey(true);
      setKey("");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/anthropic-key", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to remove");
      setHasKey(false);
      setKey("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <p className="text-sm text-muted mb-3">
        The free model works with no setup. To use the paid Claude models above, add your own
        Anthropic API key — requests are billed to your Anthropic account. The key is encrypted
        before it's stored and never shown again.{" "}
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          Get a key
        </a>
        .
      </p>

      {hasKey && (
        <div className="flex items-center gap-2 mb-3 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-accent font-medium">
            ✓ Key saved
          </span>
          <span className="text-muted">sk-ant-••••••••</span>
        </div>
      )}

      <input
        type="password"
        value={key}
        onChange={(e) => {
          setKey(e.target.value);
          setSaved(false);
        }}
        placeholder={hasKey ? "Enter a new key to replace it" : "sk-ant-..."}
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm font-mono outline-none focus:border-accent"
      />

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      <div className="flex items-center gap-3 mt-4">
        <Button onClick={save} disabled={busy || !key.trim()}>
          {busy ? "Saving…" : hasKey ? "Replace key" : "Save key"}
        </Button>
        {hasKey && (
          <Button variant="ghost" onClick={remove} disabled={busy}>
            Remove
          </Button>
        )}
        {saved && <span className="text-sm text-muted">Saved</span>}
      </div>
    </Card>
  );
}
