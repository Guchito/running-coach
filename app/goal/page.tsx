import { getGoal } from "@/lib/db";
import { PageShell } from "@/components/ui";
import { GoalForm } from "@/components/GoalForm";

export const dynamic = "force-dynamic";

export default function GoalPage() {
  const goal = getGoal();
  return (
    <PageShell
      title="Your goal"
      subtitle="Tell your coach what you're training for. You can update this anytime as your fitness changes."
    >
      <GoalForm initial={goal} />
    </PageShell>
  );
}
