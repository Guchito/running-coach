import { providerFor } from "../coachDefs";
import { AnthropicProvider } from "./anthropic";
import { NvidiaProvider } from "./nvidia";
import type { CoachProvider } from "./types";

export type { CoachProvider, ProviderMessage } from "./types";

// Pick and configure the provider for a resolved model id. Throws a clear,
// user-facing error if the required key is missing.
//
// For Claude models the key is the RUNNER'S OWN Anthropic key (passed in,
// decrypted from their account). Claude is paid, so each runner brings their own;
// the server's ANTHROPIC_API_KEY is only used as a fallback if it happens to be
// set (e.g. the owner's personal deployment).
export function resolveProvider(model: string, userAnthropicKey?: string | null): CoachProvider {
  if (providerFor(model) === "nvidia") {
    const key = process.env.NVIDIA_API_KEY;
    if (!key) {
      throw new Error(
        "This free model needs NVIDIA_API_KEY set on the server. Add it to .env.local (free key at build.nvidia.com), or pick a Claude model in Settings."
      );
    }
    return new NvidiaProvider(key);
  }
  const key = userAnthropicKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "Claude is a paid model and needs your own Anthropic API key. Add it under Settings → Coach model, or pick a free model instead."
    );
  }
  return new AnthropicProvider(key);
}
