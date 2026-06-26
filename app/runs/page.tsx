import { listRuns } from "@/lib/db";
import { formatPace, formatDuration, formatDistance } from "@/lib/parseRun";
import { PageShell, Card, Button, EmptyState } from "@/components/ui";
import { DeleteRunButton } from "@/components/DeleteRunButton";
import { requireUserId } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const userId = await requireUserId();
  const runs = await listRuns(userId);

  return (
    <PageShell
      title="History"
      subtitle={`${runs.length} run${runs.length === 1 ? "" : "s"} logged.`}
      action={<Button href="/upload">+ Upload run</Button>}
    >
      {runs.length === 0 ? (
        <EmptyState
          title="Your history is empty"
          body="Upload your past runs one CSV at a time to build up your training history."
          action={<Button href="/upload">Upload a run</Button>}
        />
      ) : (
        <Card className="divide-y divide-border">
          {runs.map((r) => (
            <div key={r.id} className="flex items-center gap-4 px-4 py-3 hover:bg-black/[0.02]">
              <Link href={`/runs/${r.id}`} className="flex-1 min-w-0 flex items-center gap-4">
                <div className="w-14 text-center shrink-0">
                  <div className="text-xs text-muted">{new Date(r.startedAt).toLocaleString("en", { month: "short" })}</div>
                  <div className="text-lg font-semibold leading-none">{new Date(r.startedAt).getDate()}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted">
                    {formatDistance(r.distanceM)} · {formatDuration(r.durationSec)} · HR{" "}
                    {r.avgHr ? Math.round(r.avgHr) : "—"}
                  </div>
                </div>
                <div className="text-accent font-medium tabular-nums w-24 text-right">
                  {formatPace(r.avgPaceSecPerKm)}
                </div>
              </Link>
              <DeleteRunButton id={r.id} />
            </div>
          ))}
        </Card>
      )}
    </PageShell>
  );
}
