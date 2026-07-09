import { getGymSession, listGymSessions } from "@/lib/db";
import { formatDuration, formatDatesInText } from "@/lib/parseRun";
import { gymTypeLabel } from "@/lib/gym";
import { PageShell, Card, Stat, Button } from "@/components/ui";
import { DeleteGymButton } from "@/components/DeleteGymButton";
import { ExerciseList } from "@/components/ExerciseList";
import { RevealOnView } from "@/components/RevealOnView";
import { requireUserId } from "@/lib/auth";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GymSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;
  const session = await getGymSession(userId, Number(id));
  if (!session) notFound();
  // Full history so each exercise can compare against its previous outing.
  const allSessions = session.exercises?.length ? await listGymSessions(userId) : [];

  const started = new Date(session.startedAt);

  return (
    <PageShell
      title={formatDatesInText(session.name)}
      subtitle={`${gymTypeLabel(session.type)} · ${started.toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}`}
      action={
        <div className="flex items-center gap-3">
          <Button href="/runs" variant="ghost">
            ← All sessions
          </Button>
          <DeleteGymButton id={session.id} redirectTo="/runs" />
        </div>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="Duration"
          value={session.durationSec > 0 ? formatDuration(session.durationSec) : "—"}
          sub={session.durationSec > 0 ? undefined : "syncs from your watch"}
        />
        <Stat label="Intensity" value={session.rpe != null ? `RPE ${session.rpe}` : "—"} />
        <Stat
          label="Avg HR"
          value={session.avgHr != null ? Math.round(session.avgHr) : "—"}
          sub={session.maxHr != null ? `max ${Math.round(session.maxHr)}` : undefined}
        />
        <Stat label="Calories" value={session.calories != null ? Math.round(session.calories) : "—"} />
      </div>

      {session.exercises && session.exercises.length > 0 && (
        <RevealOnView threshold={0.1}>
          <ExerciseList session={session} allSessions={allSessions} />
        </RevealOnView>
      )}

      {session.notes && (
        <Card className="p-5 mt-4">
          <div className="text-xs uppercase tracking-wide text-muted mb-1">Notes</div>
          <p className="text-sm whitespace-pre-wrap">{session.notes}</p>
        </Card>
      )}
    </PageShell>
  );
}
