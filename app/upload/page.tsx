import { PageShell, Card } from "@/components/ui";
import { UploadForm } from "@/components/UploadForm";

export default function UploadPage() {
  return (
    <PageShell
      title="Upload a run"
      subtitle="Add a new run or import your history — one CSV at a time."
    >
      <UploadForm />

      <Card className="p-5 mt-6 text-sm text-muted">
        <div className="font-medium text-foreground mb-2">How to export from your iPhone</div>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Open your run in the app you used to record it (e.g. the workout export app on your Apple Watch).</li>
          <li>Export the workout as a <strong>CSV</strong> — you&apos;ll get a file like
            <span className="font-mono text-xs"> 2026-06-25-…-Outdoor Running.csv</span>.</li>
          <li>Drop it above. Importing history? Just upload each run&apos;s CSV one by one — they&apos;ll stack up in your history.</li>
        </ol>
      </Card>
    </PageShell>
  );
}
