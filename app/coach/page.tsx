import { listRuns, listGoals } from "@/lib/db";
import { CoachChat } from "@/components/CoachChat";
import { requireUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const userId = await requireUserId();
  const [runs, goals] = await Promise.all([listRuns(userId), listGoals(userId)]);
  const hasGoal = goals.some((g) => g.status === "active");
  return <CoachChat hasGoal={hasGoal} hasRuns={runs.length > 0} />;
}
