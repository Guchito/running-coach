"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDatesInText } from "@/lib/parseRun";

// Editable run title. Shows the name (with any embedded ISO date reformatted to
// dd-mm-yy) and a pencil; editing swaps in an input that PATCHes /api/runs/[id].
export function RunNameEditor({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      setValue(name);
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/runs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setEditing(false);
    setValue(name);
  }

  if (editing) {
    return (
      <span className="flex items-center gap-2 flex-wrap">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          className="text-2xl font-semibold bg-transparent border-b border-accent outline-none min-w-0 max-w-full"
        />
        <button
          onClick={save}
          disabled={busy}
          className="text-sm font-normal text-accent hover:underline disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          onClick={cancel}
          disabled={busy}
          className="text-sm font-normal text-muted hover:underline"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      {formatDatesInText(name)}
      <button
        onClick={() => setEditing(true)}
        aria-label="Rename run"
        title="Rename run"
        className="text-muted hover:text-accent"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      </button>
    </span>
  );
}
