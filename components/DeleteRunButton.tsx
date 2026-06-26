"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteRunButton({ id, redirectTo }: { id: number; redirectTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!confirm("Delete this run? This cannot be undone.")) return;
    setBusy(true);
    await fetch(`/api/runs/${id}`, { method: "DELETE" });
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }

  return (
    <button
      onClick={del}
      disabled={busy}
      className="text-sm text-muted hover:text-red-600 transition-colors disabled:opacity-50"
      title="Delete run"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
