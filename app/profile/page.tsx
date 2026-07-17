import { getUserById, listLthrTests, listHealthMetrics } from "@/lib/db";
import { PageShell } from "@/components/ui";
import { AccountForm } from "@/components/AccountForm";
import { PasswordForm } from "@/components/PasswordForm";
import { HrZonesForm } from "@/components/HrZonesForm";
import { LthrTestSection } from "@/components/LthrTestSection";
import { HealthLogSection } from "@/components/HealthLogSection";
import { requireUserId } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Who you are + your physiology. App behavior and integrations stay in
// Settings; everything the training math knows about YOUR body lives here.
export default async function ProfilePage() {
  const userId = await requireUserId();
  const [user, lthrTests, healthMetrics] = await Promise.all([
    getUserById(userId),
    listLthrTests(userId),
    listHealthMetrics(userId, 30),
  ]);
  if (!user) redirect("/api/auth/logout?next=/login");

  const memberSince = new Date(user.createdAt).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return (
    <PageShell
      title="Profile"
      subtitle="Your account, and the numbers your training math runs on."
    >
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-6 items-stretch">
        <div className="flex flex-col min-w-0">
          <h2 className="font-medium mb-3">Account</h2>
          <div className="flex-1 *:h-full">
            <AccountForm
              initialName={user.name}
              initialEmail={user.email}
              memberSince={memberSince}
            />
          </div>
        </div>
        <div className="flex flex-col min-w-0">
          <h2 className="font-medium mb-3">Password</h2>
          <div className="flex-1 *:h-full">
            <PasswordForm />
          </div>
        </div>
      </div>

      {/* HR zones + LTHR side by side, same matched-height treatment the
          settings page used before these moved here. */}
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-6 mt-8">
        <div className="flex flex-col min-w-0">
          <h2 className="font-medium mb-3">Heart-rate zones</h2>
          <div className="flex-1 *:h-full">
            <HrZonesForm
              initialMaxHr={user.maxHr ?? null}
              initialLactateThresholdHr={user.lactateThresholdHr ?? null}
              initialZones={user.hrZones ?? null}
            />
          </div>
        </div>
        <div className="flex flex-col min-w-0">
          <h2 className="font-medium mb-3">Lactate threshold test</h2>
          <div className="flex-1 *:h-full">
            <LthrTestSection
              initialTests={lthrTests}
              initialIntervalWeeks={user.lthrTestIntervalWeeks ?? null}
              currentLthr={user.lactateThresholdHr ?? null}
            />
          </div>
        </div>
      </div>

      <h2 className="font-medium mb-3 mt-8">Resting HR &amp; weight</h2>
      <HealthLogSection initialMetrics={healthMetrics} />
    </PageShell>
  );
}
