import { PageShell, Card } from "@/components/ui";
import { UploadForm } from "@/components/UploadForm";

export default function UploadPage() {
  return (
    <PageShell
      title="Upload a run"
      subtitle="Add a new run or import your history — one file at a time."
    >
      <UploadForm />

      <Card className="p-5 mt-6 text-sm text-muted">
        <div className="font-medium text-foreground mb-2">Supported files</div>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>.fit</strong> — the standard activity format from HealthFit, Garmin, Strava, etc.
            HealthFit on your Apple Watch exports these.</li>
          <li><strong>.csv</strong> — the Apple Watch &ldquo;Outdoor Running&rdquo; semicolon export
            (<span className="font-mono text-xs">…-Outdoor Running.csv</span>).</li>
        </ul>
        <p className="mt-2">Importing history? Upload each run&apos;s file one by one — they stack up in your history.</p>
      </Card>
    </PageShell>
  );
}
