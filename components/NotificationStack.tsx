"use client";

import { useState } from "react";
import { SyncNotifier } from "@/components/SyncNotifier";
import { NextWeekPlanPrompt } from "@/components/NextWeekPlanPrompt";

// Fixed stack for notification cards, mounted once in the root layout. Owning
// both cards here lets them coordinate: when the sync card is showing it
// already offers "analyze + plan the week" in one action, so the standalone
// plan prompt stays hidden until the sync card is gone.
export function NotificationStack({ authed }: { authed: boolean }) {
  const [syncVisible, setSyncVisible] = useState(false);
  return (
    <div className="fixed z-40 inset-x-4 top-16 md:inset-x-auto md:top-auto md:right-6 md:bottom-6 md:max-w-sm flex flex-col gap-3 pointer-events-none">
      <SyncNotifier authed={authed} onVisibleChange={setSyncVisible} />
      <NextWeekPlanPrompt authed={authed} suppressed={syncVisible} />
    </div>
  );
}
