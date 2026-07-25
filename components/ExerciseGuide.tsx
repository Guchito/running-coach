import type { ExerciseMedia as Media } from "@/lib/types";
import { Card } from "@/components/ui";
import { ExerciseMedia } from "@/components/ExerciseMedia";
import { ExerciseMatchFixer } from "@/components/ExerciseMatchFixer";

// AscendAPI stores muscles/equipment in shouting caps ("PECTORALIS MAJOR
// STERNAL HEAD"); title-case them for display.
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Chips({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "target" | "secondary" | "equipment";
}) {
  if (items.length === 0) return null;
  const cls =
    tone === "target"
      ? "bg-accent-soft text-accent"
      : tone === "secondary"
      ? "bg-black/4 text-foreground/70"
      : "bg-black/4 text-muted";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted mr-0.5">{label}</span>
      {items.map((m) => (
        <span key={m} className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>
          {titleCase(m)}
        </span>
      ))}
    </div>
  );
}

// The demonstration card on the per-exercise page: the video/GIF, the muscles it
// works, the equipment, and the step-by-step guide — with a quiet control to fix
// the match when the fuzzy lookup picked the wrong movement.
export function ExerciseGuide({ name, media }: { name: string; media: Media }) {
  const hasMedia = !!(media.videoUrl || media.gifUrl || media.imageUrl);
  const hasBody =
    hasMedia ||
    media.targetMuscles.length > 0 ||
    media.secondaryMuscles.length > 0 ||
    media.instructions.length > 0;

  return (
    <Card className="p-5 mt-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-medium">How to do it</h2>
        <ExerciseMatchFixer name={name} matchedName={media.matchedName} />
      </div>

      {!hasBody ? (
        <p className="text-sm text-muted">
          No demo matched this movement yet. Use “Pick the right demo” above to choose one.
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            {hasMedia && <ExerciseMedia media={media} />}
            <div className="space-y-2">
              <Chips label="Targets" items={media.targetMuscles} tone="target" />
              <Chips label="Also works" items={media.secondaryMuscles} tone="secondary" />
              <Chips label="Equipment" items={media.equipments} tone="equipment" />
            </div>
          </div>

          {media.instructions.length > 0 && (
            <ol className="space-y-2">
              {media.instructions.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="font-mono text-xs text-accent shrink-0 mt-0.5 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {/* Strip the API's "Step:1 " prefix if present. */}
                  <span>{step.replace(/^step:?\s*\d+\s*/i, "")}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}
