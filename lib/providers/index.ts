import { providerFor } from "../coachDefs";
import { AnthropicProvider } from "./anthropic";
import { NvidiaProvider } from "./nvidia";
import type { CoachProvider } from "./types";

export type { CoachProvider, ProviderMessage } from "./types";

// Pick and configure the provider for a resolved model id. Throws a clear,
// user-facing error if the required key is missing.
export function resolveProvider(model: string): CoachProvider {
  if (providerFor(model) === "nvidia") {
    const key = process.env.NVIDIA_API_KEY;
    if (!key) {
      throw new Error(
        "This free model needs NVIDIA_API_KEY set on the server. Add it to .env.local (free key at build.nvidia.com), or pick a Claude model in Settings."
      );
    }
    return new NvidiaProvider(key);
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local, or pick a free model in Settings.");
  }
  return new AnthropicProvider(key);
}
