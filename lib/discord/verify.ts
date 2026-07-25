import { createPublicKey, verify as edVerify } from "crypto";
import { publicKey } from "@/lib/discord/config";

// Discord signs every interaction with Ed25519 and REQUIRES us to reject bad
// signatures with a 401 — the developer portal will not accept an interactions
// URL that doesn't. Node can verify Ed25519 natively; we just have to wrap the
// raw 32-byte public key Discord gives us in an SPKI DER header first.

// SPKI prefix for an Ed25519 public key: SEQUENCE { SEQUENCE { OID 1.3.101.112 }, BIT STRING }
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

let cached: { hex: string; key: ReturnType<typeof createPublicKey> } | null = null;

function keyFor(hex: string) {
  if (cached?.hex === hex) return cached.key;
  const raw = Buffer.from(hex, "hex");
  if (raw.length !== 32) throw new Error("DISCORD_PUBLIC_KEY must be 32 bytes of hex");
  const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" });
  cached = { hex, key };
  return key;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

// `body` must be the EXACT raw request text — re-serializing the parsed JSON
// changes the bytes and every signature fails.
export function verifyInteraction(body: string, signature: string | null, timestamp: string | null): VerifyResult {
  const hex = publicKey();
  if (!hex) return { ok: false, reason: "not_configured" };
  if (!signature || !timestamp) return { ok: false, reason: "missing_signature" };
  try {
    const sig = Buffer.from(signature, "hex");
    if (sig.length !== 64) return { ok: false, reason: "bad_signature_length" };
    const message = Buffer.from(timestamp + body, "utf8");
    return edVerify(null, message, keyFor(hex), sig) ? { ok: true } : { ok: false, reason: "invalid_signature" };
  } catch {
    return { ok: false, reason: "verify_failed" };
  }
}
