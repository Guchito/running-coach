import { getGymSession, listGymSessions, getUserById } from "@/lib/db";
import { formatDuration, formatDatesInText } from "@/lib/parseRun";
import { gymTypeLabel } from "@/lib/gym";
import { PageShell, Card, Stat, Button } from "@/components/ui";
import { DeleteGymButton } from "@/components/DeleteGymButton";
import { ExerciseList } from "@/components/ExerciseList";
import { SessionMuscleMap } from "@/components/SessionMuscleMap";
import { RevealOnView } from "@/components/RevealOnView";
import { resolveExercises, aggregateSessionMuscles } from "@/lib/exerciseDb";
import { estimateIntensity } from "@/lib/gymIntensity";
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
  // Full history: each exercise compares against its previous outing, and the
  // intensity estimate below needs the runner's recent norm for this session type.
  const allSessions = await listGymSessions(userId);

  // Hardly any source records an RPE — Strong/Hevy pastes carry none and only
  // some watches write one — so estimate it from the session's own data rather
  // than showing a dash.
  const user = session.rpe == null ? await getUserById(userId) : null;
  const estimate =
    session.rpe == null ? estimateIntensity(session, allSessions, user?.maxHr) : null;

  // Muscles worked across every exercise, for the "Muscles trained" diagram.
  // Resolution is cached, so this is cheap after the first view.
  const muscles = session.exercises?.length
    ? aggregateSessionMuscles([
        ...(await resolveExercises(session.exercises.map((e) => e.name))).values(),
      ])
    : { target: [], secondary: [] };

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
        <Stat
          label="Intensity"
          value={
            session.rpe != null ? `RPE ${session.rpe}` : estimate ? `~RPE ${estimate.rpe}` : "—"
          }
          sub={
            session.rpe != null
              ? undefined
              : estimate
              ? `estimated from ${estimate.basis.slice(0, 2).join(" + ")}`
              : "not recorded"
          }
        />
        <Stat
          label="Avg HR"
          value={session.avgHr != null ? Math.round(session.avgHr) : "—"}
          sub={session.maxHr != null ? `max ${Math.round(session.maxHr)}` : undefined}
        />
        <Stat label="Calories" value={session.calories != null ? Math.round(session.calories) : "—"} />
      </div>

      {muscles.target.length > 0 && (
        <RevealOnView threshold={0.1}>
          <SessionMuscleMap target={muscles.target} secondary={muscles.secondary} />
        </RevealOnView>
      )}

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
