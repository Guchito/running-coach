import { listGoals } from "@/lib/db";
import { PageShell, Button } from "@/components/ui";
import { GoalsManager } from "@/components/GoalsManager";
import { requireUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const userId = await requireUserId();
  const goals = await listGoals(userId);

  return (
    <PageShell
      title="Goals"
      subtitle="Set one or more races you're training for. Your coach builds a plan around all of them — and can update them as your fitness changes."
      action={<Button href="/plan" variant="ghost">View plan →</Button>}
    >
      <GoalsManager initial={goals} />
    </PageShell>
  );
}
