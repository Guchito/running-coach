import { PageShell, Card } from "@/components/ui";
import { UploadForm } from "@/components/UploadForm";
import { ManualEntryForm } from "@/components/ManualEntryForm";

export default function UploadPage() {
  return (
    <PageShell
      title="Upload a session"
      subtitle="Add a run or a gym session: drop a file, or log one manually."
    >
      <UploadForm />

      <ManualEntryForm />

      <Card className="p-5 mt-6 text-sm text-muted">
        <div className="font-medium text-foreground mb-2">Supported files</div>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>.fit</strong> — the standard activity format from HealthFit, Garmin, Strava, etc.
            HealthFit on your Apple Watch exports these. Works for both runs and strength/gym workouts.</li>
          <li><strong>.csv</strong> — the Apple Watch &ldquo;Outdoor Running&rdquo; semicolon export
            (<span className="font-mono text-xs">…-Outdoor Running.csv</span>).</li>
          <li><strong>.tcx</strong> — gym / strength workouts exported from your watch.</li>
        </ul>
        <p className="mt-2">We read the activity type in the file: runs go to your run history, strength and
          conditioning workouts are logged as gym sessions — all in one place.</p>
      </Card>
    </PageShell>
  );
}
