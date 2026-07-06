"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HoldDeleteButton } from "@/components/HoldDeleteButton";

export function DeleteGymButton({ id, redirectTo }: { id: number; redirectTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    setBusy(true);
    await fetch(`/api/gym/${id}`, { method: "DELETE" });
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }

  return (
    <HoldDeleteButton
      title="Hold to delete gym session"
      confirmText="Delete this gym session? This cannot be undone."
      onDelete={del}
      busy={busy}
    />
  );
}
