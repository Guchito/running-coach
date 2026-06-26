import { getUserById } from "@/lib/db";
import { PageShell } from "@/components/ui";
import { HrZonesForm } from "@/components/HrZonesForm";
import { DriveSettings } from "@/components/DriveSettings";
import { requireUserId } from "@/lib/auth";
import { isDriveConfigured, serviceAccountEmail } from "@/lib/drive";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const user = await getUserById(userId);

  return (
    <PageShell title="Settings" subtitle="Personalize how your runs are analyzed and imported.">
      <h2 className="font-medium mb-3">Heart-rate zones</h2>
      <HrZonesForm initialMaxHr={user?.maxHr ?? null} initialZones={user?.hrZones ?? null} />

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
