import { getUserById, listLthrTests, listBodyMetrics } from "@/lib/db";
import { PageShell } from "@/components/ui";
import { HrZonesForm } from "@/components/HrZonesForm";
import { LthrTestSection } from "@/components/LthrTestSection";
import { BodyMetricsSection } from "@/components/BodyMetricsSection";
import { DriveSettings } from "@/components/DriveSettings";
import { GarminSettings } from "@/components/GarminSettings";
import { CoachModelForm } from "@/components/CoachModelForm";
import { AnthropicKeyForm } from "@/components/AnthropicKeyForm";
import { AutoNameRunsToggle } from "@/components/AutoNameRunsToggle";
import { requireUserId } from "@/lib/auth";
import { isDriveConfigured, serviceAccountEmail } from "@/lib/drive";
import { resolveCoachModel } from "@/lib/coach";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [user, lthrTests, bodyMetrics] = await Promise.all([
    getUserById(userId),
    listLthrTests(userId),
    listBodyMetrics(userId),
  ]);

  return (
    <PageShell title="Settings" subtitle="Personalize how your runs are analyzed and imported.">
      <h2 className="font-medium mb-3">Coach model</h2>
      <CoachModelForm
        initial={resolveCoachModel(user?.coachModel)}
        hasAnthropicKey={user?.hasAnthropicKey ?? false}
      />

      <h2 className="font-medium mb-3 mt-8">Run naming</h2>
      <AutoNameRunsToggle initial={user?.autoNameRuns ?? false} />

      <h2 className="font-medium mb-3 mt-8">Your Anthropic API key</h2>
      <AnthropicKeyForm initialHasKey={user?.hasAnthropicKey ?? false} />

      <h2 className="font-medium mb-3 mt-8">Heart-rate zones</h2>
      <HrZonesForm
        initialMaxHr={user?.maxHr ?? null}
        initialLactateThresholdHr={user?.lactateThresholdHr ?? null}
        initialZones={user?.hrZones ?? null}
      />

      <h2 className="font-medium mb-3 mt-8">Lactate threshold test</h2>
      <LthrTestSection
        initialTests={lthrTests}
        initialIntervalWeeks={user?.lthrTestIntervalWeeks ?? null}
        currentLthr={user?.lactateThresholdHr ?? null}
      />

      <h2 className="font-medium mb-3 mt-8">Resting HR &amp; weight</h2>
      <BodyMetricsSection initialMetrics={bodyMetrics} />

      <h2 className="font-medium mb-3 mt-8">Garmin Connect</h2>
      <GarminSettings
        connected={user?.garminConnected ?? false}
        lastSync={user?.garminLastSync ?? null}
      />

      <h2 className="font-medium mb-3 mt-8">Google Drive auto-import</h2>
      <DriveSettings
        initial={{
          configured: isDriveConfigured(),
          serviceAccountEmail: serviceAccountEmail(),
          folderId: user?.driveFolderId ?? null,
          lastSync: user?.driveLastSync ?? null,
        }}
      />
    </PageShell>
  );
}
