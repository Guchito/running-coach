import { getGymSession } from "@/lib/db";
import { formatDuration, formatDatesInText } from "@/lib/parseRun";
import { gymTypeLabel } from "@/lib/gym";
import { exercisesVolumeKg } from "@/lib/parseStrong";
import { PageShell, Card, Stat, Button } from "@/components/ui";
import { DeleteGymButton } from "@/components/DeleteGymButton";
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
        <Card className="p-5 mt-4">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <div className="text-xs uppercase tracking-wide text-muted">Exercises</div>
            <div className="text-xs text-muted">
              {session.exercises.reduce((n, ex) => n + ex.sets.length, 0)} sets
              {exercisesVolumeKg(session.exercises) > 0 &&
                ` · ${exercisesVolumeKg(session.exercises).toLocaleString("en-GB")} kg total volume`}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
            {session.exercises.map((ex) => (
              <div key={ex.name}>
                <div className="text-sm font-medium">{ex.name}</div>
                <ul className="mt-1 space-y-0.5">
                  {ex.sets.map((s, i) => (
                    <li
                      key={i}
                      className="text-sm text-muted font-mono tabular-nums flex gap-3"
                    >
                      <span className="w-5 text-right shrink-0">{i + 1}</span>
                      <span>
                        {s.weightKg != null ? `${s.weightKg} kg × ${s.reps}` : `${s.reps} reps`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {session.strongLink && (
            <a
              href={session.strongLink}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-4 text-xs text-muted hover:text-foreground underline underline-offset-2"
            >
              View in Strong
            </a>
          )}
        </Card>
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
