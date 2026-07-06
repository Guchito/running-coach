"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// Kicks off server-side auto-naming (no-op if the toggle is off), then hands the
// run to the coach for conversational analysis. `ask` must be pre-encoded.
export function AnalyzeRunButton({ runId, ask }: { runId: number; ask: string }) {
  const router = useRouter();

  function go() {
    fetch(`/api/runs/${runId}/autoname`, { method: "POST" }).catch(() => {});
    router.push(`/coach?ask=${ask}`);
  }

  return (
    <Button onClick={go} variant="soft">
      Analyze this run
    </Button>
  );
}
