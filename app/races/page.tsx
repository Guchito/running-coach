import Link from "next/link";
import { listGoals } from "@/lib/db";
import { PageShell, Card, EmptyState, Button } from "@/components/ui";
import { formatDate, formatDuration } from "@/lib/parseRun";
import { requireUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RacesPage() {
  const userId = await requireUserId();
  const goals = await listGoals(userId);

  // Only goals with a recorded race result, most recent race first.
  const races = goals
    .filter((g) => g.resultTimeSec != null)
    .sort((a, b) => (b.racedOn ?? "").localeCompare(a.racedOn ?? ""));

  return (
    <PageShell
      title="Races"
      subtitle="Every race you've completed and how it went against your target."
      action={
        <Button href="/goals" variant="ghost">
          Goals →
        </Button>
      }
    >
      {races.length === 0 ? (
        <EmptyState
          title="No races logged yet"
          body="When you finish a race, upload the run and confirm it with your coach (or mark it on the goal). It'll show up here with your time."
          action={<Button href="/goals">View goals</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {races.map((g) => {
            const beat =
              g.targetTimeSec != null ? g.resultTimeSec! <= g.targetTimeSec : null;
            return (
              <Card key={g.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{g.title}</div>
                    <div className="text-sm text-muted mt-0.5">
                      {g.raceType}
                      {g.racedOn ? ` · ${formatDate(g.racedOn)}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-bold tabular-nums leading-none">
                      {formatDuration(g.resultTimeSec!)}
                    </div>
                    <div className="text-[11px] text-muted">finish time</div>
                  </div>
                </div>

                {g.targetTimeSec != null && (
                  <div
                    className={`mt-3 text-sm ${beat ? "text-good" : "text-muted"}`}
                  >
                    {beat
                      ? `🎉 Beat your ${formatDuration(g.targetTimeSec)} target by ${formatDuration(
                          g.targetTimeSec - g.resultTimeSec!,
                        )}`
                      : `${formatDuration(
                          g.resultTimeSec! - g.targetTimeSec,
                        )} off your ${formatDuration(g.targetTimeSec)} target`}
                  </div>
                )}

                {g.resultRunId != null && (
                  <Link
                    href={`/runs/${g.resultRunId}`}
                    className="mt-3 inline-block text-sm text-accent hover:underline"
                  >
                    View race run →
                  </Link>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
