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
//
// For NVIDIA models the runner's own key (free at build.nvidia.com) takes
// precedence so they get their own rate limit; otherwise everyone shares the
// server's NVIDIA_API_KEY.
export function resolveProvider(
  model: string,
  userAnthropicKey?: string | null,
  userNvidiaKey?: string | null
): CoachProvider {
  if (providerFor(model) === "nvidia") {
    const key = userNvidiaKey || process.env.NVIDIA_API_KEY;
    if (!key) {
      throw new Error(
        "This free model needs an NVIDIA API key. Add your own under Settings (free key at build.nvidia.com), or pick a Claude model."
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
