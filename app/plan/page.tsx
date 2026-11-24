import { getPlan, listGoals, listRuns, listGymSessions } from "@/lib/db";
import { PageShell, Card, Button, EmptyState } from "@/components/ui";
import { PlanInstructions } from "@/components/PlanInstructions";
import { WeeklyPlanDays } from "@/components/WeeklyPlanDays";
import { weeklyAdherence } from "@/lib/adherence";
import { formatDate } from "@/lib/parseRun";
import { requireUserId } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

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
  const hasMacro = !!(
    plan.macro &&
    (plan.macro.summary.trim() || plan.macro.phases.length)
  );
  const hasPlan = hasMacro || plan.weekly;

  return (
    <PageShell
      wide
      title="Training plan"
      subtitle="Built and maintained by your coach around all your goals."
      action={<Button href="/coach">Talk to coach</Button>}
    >
      {/* Phones: one flex column with "This week" lifted to the top.
          Desktop: the plan in a wide column, the standing instructions in a
          sticky side column beside it. */}
      <div className="flex flex-col gap-2 md:gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:sticky lg:top-8">
          <PlanInstructions initial={plan.macro?.instructions ?? null} />
        </div>

        {!hasPlan ? (
          <div className="lg:col-start-1 lg:row-start-1">
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
          </div>
        ) : (
          <>
            {/* Macro plan */}
            {hasMacro && plan.macro && (
              <Card className="p-6 lg:col-start-1 lg:row-start-2">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-semibold text-lg">Macro plan</h2>
                  <span className="text-xs text-muted">
                    updated {formatDate(plan.macro.updatedAt)}
                  </span>
                </div>
                <p className="text-sm text-muted mb-5 max-w-prose">{plan.macro.summary}</p>

                <div className="relative pl-5">
                  <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
                  {plan.macro.phases.map((p, i) => (
                    <div key={i} className="relative pb-5 last:pb-0">
                      <div className="absolute -left-3.5 top-1 w-3 h-3 rounded-full bg-accent border-2 border-card" />
                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted">
                          {p.start ? `${formatDate(p.start)} → ${p.end ? formatDate(p.end) : "?"}` : ""}
                          {p.weeklyKm ? ` · ~${p.weeklyKm} km/wk` : ""}
                        </div>
                      </div>
                      <div className="text-sm text-muted">{p.focus}</div>
                      {p.notes && (
                        <div className="text-sm text-muted mt-0.5">
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
              <Card className="p-6 max-lg:order-first lg:col-start-1 lg:row-start-1">
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
                        ? `week of ${formatDate(plan.weekly.weekStart)}`
                        : ""}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted mb-5 max-w-prose">{plan.weekly.summary}</p>

                <WeeklyPlanDays
                  days={plan.weekly.days}
                  doneDays={(adherence?.items ?? [])
                    .filter((it) => it.done)
                    .map((it) => it.day)}
                />
              </Card>
            )}

            <p className="text-sm text-muted lg:col-start-1 lg:row-start-3">
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
