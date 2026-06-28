import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Symmetric encryption for secrets we must store and later read back in
// plaintext (unlike passwords, which we only ever compare). Used for each
// runner's own Anthropic API key. AES-256-GCM gives confidentiality plus an
// auth tag, so tampering with the stored ciphertext is detected on decrypt.
//
// The master key is derived from SECRETS_KEY (or SESSION_SECRET as a fallback so
// existing deployments work without new config) via scrypt. Rotating that env
// value makes previously stored secrets undecryptable — users would just re-enter
// their key.

const ALGO = "aes-256-gcm";

function masterKey(): Buffer {
  const secret = process.env.SECRETS_KEY || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SECRETS_KEY (or SESSION_SECRET) must be set to encrypt stored API keys."
    );
  }
  // Fixed salt: we need a deterministic key from the env secret, and the secret
  // itself is the source of entropy. Per-secret salt would need to be stored too.
  return scryptSync(secret, "running-app/secrets/v1", 32);
}

// Encrypt a plaintext secret. Returns "ivHex:authTagHex:cipherHex".
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit nonce, the GCM standard
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

// Decrypt a value produced by encryptSecret. Returns null on any malformed or
// tampered input rather than throwing, so a bad row can't break a request.
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const [ivHex, tagHex, cipherHex] = stored.split(":");
  if (!ivHex || !tagHex || !cipherHex) return null;
  try {
    const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(cipherHex, "hex")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}
