import { getUserById } from "@/lib/db";
import { PageShell } from "@/components/ui";
import { DriveSettings } from "@/components/DriveSettings";
import { GarminSettings } from "@/components/GarminSettings";
import { CoachModelForm } from "@/components/CoachModelForm";
import { AnthropicKeyForm } from "@/components/AnthropicKeyForm";
import { NvidiaKeyForm } from "@/components/NvidiaKeyForm";
import { AutoNameRunsToggle } from "@/components/AutoNameRunsToggle";
import { requireUserId } from "@/lib/auth";
import { isDriveConfigured, serviceAccountEmail } from "@/lib/drive";
import { resolveCoachModel } from "@/lib/coach";

export const dynamic = "force-dynamic";

// App behavior + integrations. Personal info, password, and the physiology
// numbers (HR zones, LTHR, resting HR & weight) live on /profile.
export default async function SettingsPage() {
  const userId = await requireUserId();
  const user = await getUserById(userId);

  return (
    <PageShell
      title="Settings"
      subtitle="The coach, the imports, and how the app behaves. Your body's numbers live in your profile."
    >
      <h2 className="font-medium mb-3">Coach model</h2>
      <CoachModelForm
        initial={resolveCoachModel(user?.coachModel)}
        hasAnthropicKey={user?.hasAnthropicKey ?? false}
      />

      <h2 className="font-medium mb-3 mt-8">Run naming</h2>
      <AutoNameRunsToggle initial={user?.autoNameRuns ?? false} />

      <h2 className="font-medium mb-3 mt-8">Your Anthropic API key</h2>
      <AnthropicKeyForm initialHasKey={user?.hasAnthropicKey ?? false} />

      <h2 className="font-medium mb-3 mt-8">Your NVIDIA API key</h2>
      <NvidiaKeyForm initialHasKey={user?.hasNvidiaKey ?? false} />

      {/* Garmin + Google Drive side by side. */}
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-6 mt-8 items-start">
        <div>
          <h2 className="font-medium mb-3">Garmin Connect</h2>
          <GarminSettings
            connected={user?.garminConnected ?? false}
            lastSync={user?.garminLastSync ?? null}
          />
        </div>
        <div>
          <h2 className="font-medium mb-3">Google Drive auto-import</h2>
          <DriveSettings
            initial={{
              configured: isDriveConfigured(),
              serviceAccountEmail: serviceAccountEmail(),
              folderId: user?.driveFolderId ?? null,
              healthSheetId: user?.healthSheetId ?? null,
              lastSync: user?.driveLastSync ?? null,
            }}
          />
        </div>
      </div>
    </PageShell>
  );
}
