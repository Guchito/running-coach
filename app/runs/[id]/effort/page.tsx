import { formatDatesInText } from "@/lib/parseRun";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRun, getUserById, listRuns, listCrossTraining, listGymSessions } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { resolveZones } from "@/lib/hr";
import { effortSessions, weeklyEffort } from "@/lib/fitness";
import { PageShell } from "@/components/ui";
import { WeeklyEffort } from "@/components/EffortCards";

export const dynamic = "force-dynamic";

// Weekly Effort for the week a run fell in — where tapping Relative Effort on
// the run page leads (on phones).
export default async function RunEffort({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const [run, user, runs, cross, gym] = await Promise.all([
    getRun(userId, Number(id)),
    getUserById(userId),
    listRuns(userId),
    listCrossTraining(userId),
    listGymSessions(userId),
  ]);
  if (!run) notFound();
  const zones = resolveZones(user?.maxHr ?? null, user?.hrZones ?? null);
  const efforts = effortSessions([...runs, ...cross], gym, zones);
  const self = efforts.find((e) => e.kind === "run" && e.id === run.id);

  return (
    <PageShell
      title="Weekly effort"
      subtitle={formatDatesInText(run.name)}
      action={
        <Link href={`/runs/${run.id}`} className="tap text-sm text-accent whitespace-nowrap">
          ← Back to run
        </Link>
      }
    >
      {/* No card: on phones the header runs edge to edge like the Strava app. */}
      <WeeklyEffort data={weeklyEffort(efforts, Date.parse(run.startedAt))} currentHref={self?.href} showTitle={false} />
    </PageShell>
  );
}
