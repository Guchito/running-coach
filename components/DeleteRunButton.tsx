"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HoldDeleteButton } from "@/components/HoldDeleteButton";

export function DeleteRunButton({ id, redirectTo }: { id: number; redirectTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    setBusy(true);
    await fetch(`/api/runs/${id}`, { method: "DELETE" });
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }

  return (
    <HoldDeleteButton
      title="Hold to delete run"
      confirmText="Delete this run? This cannot be undone."
      onDelete={del}
      busy={busy}
    />
  );
}
