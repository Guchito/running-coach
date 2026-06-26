"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Mounted on the dashboard. On load it asks the server to sync from Drive; the
// server throttles, so this is cheap to call on every visit. If new runs come
// in, it shows a banner and refreshes the page data.
export function DriveAutoSync() {
  const router = useRouter();
  const ran = useRef(false);
  const [imported, setImported] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const res = await fetch("/api/drive/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false }),
        });
        const d = await res.json();
        if (d?.imported?.length) {
          setImported(d.imported);
          router.refresh();
        }
      } catch {
        /* silent — Drive sync is best-effort */
      }
    })();
  }, [router]);

  if (imported.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl bg-good/10 border border-good/20 text-good px-4 py-3 text-sm">
      ✓ Imported {imported.length} new run{imported.length === 1 ? "" : "s"} from Google Drive:{" "}
      {imported.map((r) => r.name).join(", ")}
    </div>
  );
}
