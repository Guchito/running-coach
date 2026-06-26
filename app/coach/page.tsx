import { listRuns, getGoal } from "@/lib/db";
import { CoachChat } from "@/components/CoachChat";

export const dynamic = "force-dynamic";

export default function CoachPage() {
  const runs = listRuns();
  const goal = getGoal();
  return <CoachChat hasGoal={!!goal} hasRuns={runs.length > 0} />;
}
