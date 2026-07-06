import { getPlan, listGoals, listRuns, listGymSessions } from "@/lib/db";
import { PageShell, Card, Button, EmptyState } from "@/components/ui";
import { PlanInstructions } from "@/components/PlanInstructions";
import { weeklyAdherence } from "@/lib/adherence";
import { formatDate } from "@/lib/parseRun";
import { requireUserId } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

const DAY_TYPE_COLOR: Record<string, string> = {
  easy: "#10b981",
  recovery: "#94a3b8",
  long: "#2563eb",
  tempo: "#f59e0b",
  intervals: "#e11d48",
  race: "#7c3aed",
  cross: "#0ea5e9",
  // Clearly apart from easy's emerald; the fuchsia only ever appears as a
  // tinted label, so it reads as a category, not decoration.
  strength: "#c026d3",
  rest: "#94a3b8",
};

const DAYS_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function PlanPage() {
  const userId = await requireUserId();
  const [plan, goals, runs, gymSessions] = await Promise.all([
    getPlan(userId),
    listGoals(userId),
    listRuns(userId),
    listGymSessions(userId),
  ]);
  const activeGoals = goals.filter((g) => g.status === "active");
  const adherence = weeklyAdherence(plan.weekly, runs, gymSessions);
  const doneByDay = new Map((adherence?.items ?? []).map((it) => [it.day, it]));
  const hasMacro = !!(
    plan.macro &&
    (plan.macro.summary.trim() || plan.macro.phases.length)
  );
  const hasPlan = hasMacro || plan.weekly;

  return (
    <PageShell
      title="Training plan"
      subtitle="Built and maintained by your coach around all your goals."
      action={<Button href="/coach">Talk to coach</Button>}
    >
      <div className="space-y-6">
        <PlanInstructions initial={plan.macro?.instructions ?? null} />

        {!hasPlan ? (
          <EmptyState
            title="No plan yet"
            body={
              activeGoals.length === 0
                ? "Set a goal first, then ask your coach to build your training plan."
                : "Ask your coach to build your macro and weekly plan around your goals."
            }
            action={
              activeGoals.length === 0 ? (
                <Button href="/goals">Set a goal</Button>
              ) : (
                <Button href="/coach?ask=Build my macro and weekly training plan around my goals.">
                  Build my plan
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Macro plan */}
            {hasMacro && plan.macro && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-semibold text-lg">Macro plan</h2>
                  <span className="text-xs text-muted">
                    updated {formatDate(plan.macro.updatedAt)}
                  </span>
                </div>
                <p className="text-sm text-muted mb-5">{plan.macro.summary}</p>

                <div className="relative pl-5">
                  <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
                  {plan.macro.phases.map((p, i) => (
                    <div key={i} className="relative pb-5 last:pb-0">
                      <div className="absolute -left-3.5 top-1 w-3 h-3 rounded-full bg-accent border-2 border-card" />
                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted">
                          {p.start ? `${p.start} → ${p.end ?? "?"}` : ""}
                          {p.weeklyKm ? ` · ~${p.weeklyKm} km/wk` : ""}
                        </div>
                      </div>
                      <div className="text-sm text-muted">{p.focus}</div>
                      {p.notes && (
                        <div className="text-sm text-muted/80 mt-0.5">
                          {p.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Weekly plan */}
            {plan.weekly && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-semibold text-lg">This week</h2>
                  <div className="flex items-center gap-2">
                    {adherence &&
                      adherence.plannedCount > 0 &&
                      (adherence.upcoming ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-black/4 text-muted">
                          Upcoming
                        </span>
                      ) : (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            adherence.doneCount >= adherence.plannedCount
                              ? "bg-good/15 text-good"
                              : "bg-accent-soft text-accent"
                          }`}
                        >
                          {adherence.doneCount}/{adherence.plannedCount} done
                        </span>
                      ))}
                    <span className="text-xs text-muted">
                      {plan.weekly.weekStart
                        ? `week of ${plan.weekly.weekStart}`
                        : ""}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted mb-5">{plan.weekly.summary}</p>

                <div className="grid sm:grid-cols-2 gap-3">
                  {[...plan.weekly.days]
                    .sort(
                      (a, b) =>
                        DAYS_ORDER.indexOf(a.day) - DAYS_ORDER.indexOf(b.day),
                    )
                    .map((d, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-border p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold w-8 text-muted">
                              {d.day}
                            </span>
                            <span className="font-medium truncate">
                              {d.title}
                            </span>
                            {doneByDay.get(d.day)?.done && (
                              <span
                                className="text-good text-sm shrink-0"
                                title="Completed"
                              >
                                ✓
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted mt-1.5 flex items-center gap-1.5">
                            {/* Day-type as a tinted pill: same treatment the
                                splits table uses for interval intensity. */}
                            <span
                              className="inline-flex items-center text-xs font-medium capitalize px-2 py-0.5 rounded-full"
                              style={{
                                color: `color-mix(in srgb, ${DAY_TYPE_COLOR[d.type] ?? "#94a3b8"} 65%, black)`,
                                backgroundColor: `${DAY_TYPE_COLOR[d.type] ?? "#94a3b8"}1a`,
                              }}
                            >
                              {d.type}
                            </span>
                            {d.distanceKm ? <span>{d.distanceKm} km</span> : null}
                          </div>
                          {d.detail && (
                            <div className="text-sm text-muted/90 mt-1">
                              {d.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </Card>
            )}

            <p className="text-sm text-muted">
              Want changes?{" "}
              <Link href="/coach" className="text-accent">
                Tell your coach
              </Link>{" "}
              — and your plan updates automatically every time you upload a run.
            </p>
          </>
        )}
      </div>
    </PageShell>
  );
}
