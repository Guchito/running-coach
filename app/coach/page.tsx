import { listRuns, listGoals, getUserById } from "@/lib/db";
import { CoachChat } from "@/components/CoachChat";
import { requireUserId, isDemoSession } from "@/lib/auth";
import { resolveCoachModel, COACH_MODEL } from "@/lib/coach";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const userId = await requireUserId();
  const [runs, goals, user] = await Promise.all([
    listRuns(userId),
    listGoals(userId),
    getUserById(userId),
  ]);
  const hasGoal = goals.some((g) => g.status === "active");
  // The demo shares the owner's row, so it neither reads their saved model nor
  // sees their Anthropic key — it starts on the free default and can switch
  // between the other free models for the length of its visit.
  const demo = await isDemoSession();
  return (
    <CoachChat
      hasGoal={hasGoal}
      hasRuns={runs.length > 0}
      model={demo ? COACH_MODEL : resolveCoachModel(user?.coachModel)}
      hasAnthropicKey={!demo && (user?.hasAnthropicKey ?? false)}
      demo={demo}
    />
  );
}
