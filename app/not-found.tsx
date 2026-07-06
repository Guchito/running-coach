import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="min-h-[70dvh] grid place-items-center px-6">
      <div className="text-center">
        <div className="font-mono text-6xl font-semibold tracking-tight text-muted/60">
          404
        </div>
        <h1 className="text-xl font-semibold mt-4">This page went off course</h1>
        <p className="text-sm text-muted mt-2 max-w-sm mx-auto">
          The page you&apos;re looking for doesn&apos;t exist, or the run it
          belonged to was deleted.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button href="/">Back to dashboard</Button>
          <Button href="/runs" variant="ghost">
            View history
          </Button>
        </div>
      </div>
    </div>
  );
}
