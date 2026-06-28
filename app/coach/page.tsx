import { listRuns, listGoals, getUserById } from "@/lib/db";
import { CoachChat } from "@/components/CoachChat";
import { requireUserId } from "@/lib/auth";
import { resolveCoachModel } from "@/lib/coach";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const userId = await requireUserId();
  const [runs, goals, user] = await Promise.all([
    listRuns(userId),
    listGoals(userId),
    getUserById(userId),
  ]);
  const hasGoal = goals.some((g) => g.status === "active");
  return (
    <CoachChat
      hasGoal={hasGoal}
      hasRuns={runs.length > 0}
      model={resolveCoachModel(user?.coachModel)}
      hasAnthropicKey={user?.hasAnthropicKey ?? false}
    />
  );
}
