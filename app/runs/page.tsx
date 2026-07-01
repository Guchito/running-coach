import { listRuns, listGymSessions } from "@/lib/db";
import { formatPace, formatDuration, formatDistance, formatDatesInText } from "@/lib/parseRun";
import { PageShell, Button, EmptyState } from "@/components/ui";
import { SessionHistory } from "@/components/SessionHistory";
import { sessionColor, sessionTypeLabel, type SessionLite } from "@/lib/sessionMeta";
import { requireUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const userId = await requireUserId();
  const [runs, gymSessions] = await Promise.all([listRuns(userId), listGymSessions(userId)]);

  // One flat, colour-coded list of every session, newest first.
  const sessions: SessionLite[] = [
    ...runs.map(
      (r): SessionLite => ({
        id: r.id,
        kind: "run",
        type: "run",
        typeLabel: sessionTypeLabel("run"),
        color: sessionColor("run"),
        name: formatDatesInText(r.name),
        startedAt: r.startedAt,
        href: `/runs/${r.id}`,
        meta: `${formatDistance(r.distanceM)} · ${formatDuration(r.durationSec)} · ${formatPace(
          r.avgPaceSecPerKm
        )}`,
        distanceM: r.distanceM,
        paceSecPerKm: r.avgPaceSecPerKm,
      })
    ),
    ...gymSessions.map(
      (g): SessionLite => ({
        id: g.id,
        kind: "gym",
        type: g.type,
        typeLabel: sessionTypeLabel("gym", g.type),
        color: sessionColor("gym", g.type),
        name: formatDatesInText(g.name),
        startedAt: g.startedAt,
        href: `/gym/${g.id}`,
        meta: `${formatDuration(g.durationSec)}${g.avgHr ? ` · HR ${Math.round(g.avgHr)}` : ""}${
          g.rpe != null ? ` · RPE ${g.rpe}` : ""
        }`,
      })
    ),
  ].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  return (
    <PageShell
      title="History"
      subtitle={`${sessions.length} session${sessions.length === 1 ? "" : "s"} logged.`}
      action={<Button href="/upload">+ Upload session</Button>}
    >
      {sessions.length === 0 ? (
        <EmptyState
          title="Your history is empty"
          body="Upload your past runs and gym sessions one file at a time to build up your training history."
          action={<Button href="/upload">Upload a session</Button>}
        />
      ) : (
        <SessionHistory sessions={sessions} />
      )}
    </PageShell>
  );
}
