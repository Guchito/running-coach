import { parseRunCsv } from "./parseRun";
import { parseRunFit } from "./parseFit";
import type { RunSummary } from "./types";

// Server-only: pick the right parser by file extension. Kept out of
// parseRun.ts because parseFit pulls in the Node-only Garmin SDK, and
// parseRun is imported by client components for its formatters.
export function parseRunFile(filename: string, data: Buffer | Uint8Array | string): RunSummary {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "fit") {
    const buf =
      typeof data === "string"
        ? Buffer.from(data, "binary")
        : data instanceof Uint8Array
        ? data
        : Buffer.from(data);
    return parseRunFit(buf);
  }
  const text = typeof data === "string" ? data : Buffer.from(data).toString("utf8");
  return parseRunCsv(text);
}

// Friendly run name from a source filename + start date.
export function runNameFromFile(filename: string, startedAt: string): string {
  const base = filename.replace(/\.(csv|fit)$/i, "").trim();
  const date = startedAt.slice(0, 10);
  if (/outdoor running/i.test(base)) return `Outdoor Run · ${date}`;
  return base.length > 40 || base.length === 0 ? `Run · ${date}` : base;
}
