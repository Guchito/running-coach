import type { SessionLite } from "@/lib/sessionMeta";

// Filled glyphs (Material): a runner for runs, a barbell for gym sessions, and
// a medal for the runs that were actual races.
export function SessionGlyph({
  kind,
  isRace,
  className,
}: {
  kind: "run" | "gym";
  isRace?: boolean;
  className?: string;
}) {
  if (kind === "run" && isRace) {
    // Ribbon pair over a medallion, the star knocked out of the disc so the
    // glyph still reads at 12px.
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
        <path d="M9.6 2H6.1l3.3 5.9c.8-.5 1.6-.8 2.6-.9L9.6 2z" />
        <path d="M14.4 2h3.5l-3.3 5.9c-.8-.5-1.6-.8-2.6-.9L14.4 2z" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 8.6a6.7 6.7 0 100 13.4 6.7 6.7 0 000-13.4zm0 2.8l1.2 2.4 2.7.4-1.95 1.9.46 2.66L12 17.5l-2.41 1.26.46-2.66L8.1 14.2l2.7-.4L12 11.4z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      {kind === "run" ? (
        <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" />
      ) : (
        <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z" />
      )}
    </svg>
  );
}

// An outlined circle (a thin line) in the session's colour, with the icon inside
// drawn in that same colour.
export function SessionBadge({
  s,
  size = "sm",
}: {
  s: Pick<SessionLite, "kind" | "color" | "typeLabel" | "name"> & { isRace?: boolean };
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "w-9 h-9" : size === "md" ? "w-7 h-7" : "w-5 h-5";
  const icon = size === "lg" ? "w-5 h-5" : size === "md" ? "w-4 h-4" : "w-3 h-3";
  return (
    <span
      className={`${box} rounded-full grid place-items-center border-2 bg-card shrink-0`}
      style={{ borderColor: s.color, color: s.color }}
      title={`${s.typeLabel} · ${s.name}`}
    >
      <SessionGlyph kind={s.kind} isRace={s.isRace} className={icon} />
    </span>
  );
}
